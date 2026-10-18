import { useMemo, useState } from 'react'
import { emi as calcEmi } from '../core/amortize'
import { extraForTarget, liquidityAfter, optimizerScenarios, type ScenarioResult } from '../core/scenarios'
import { compact, duration, loanType, money, monthLabel, pct } from '../locale'
import { setHousehold, useStore } from '../store/loans'
import { Assumptions, Badge, Insight, PageHead, Section } from '../ui/bits'
import { BalanceChart } from '../ui/charts'
import { DecimalInput, MoneyInput, RANGES, Segmented, Select, Slider } from '../ui/inputs'
import { useLoanSource } from '../ui/LoanSource'
import { href } from '../ui/router'

const stepFor = (x: number) => (x >= 5_000_000 ? 50_000 : x >= 1_000_000 ? 10_000 : x >= 200_000 ? 5_000 : 1_000)

export default function Optimize() {
  const src = useLoanSource()
  const b = src.basics
  const { household: hh } = useStore()
  const [lump, setLump] = useState(() => Math.round(b.principal * 0.07 / stepFor(b.principal)) * stepFor(b.principal))
  const [extra, setExtra] = useState(() => Math.round(b.emi * 0.1 / 500) * 500)
  const [stepUp, setStepUp] = useState(0)
  const [periodic, setPeriodic] = useState(0)
  const [every, setEvery] = useState(12)
  const [mode, setMode] = useState<'tenure' | 'emi'>('tenure')
  const [targetYears, setTargetYears] = useState<number | null>(null)

  const valid = b.principal > 0 && b.months > 0 && b.emi > b.principal * (b.rate / 1200)
  const base = { principal: b.principal, annualRate: b.rate, months: b.months, emi: b.emi }
  const scheduled = useMemo(() => {
    const out = []
    if (periodic > 0) for (let at = every; at < b.months; at += every) out.push({ at, amount: periodic })
    return out
  }, [periodic, every, b.months])

  const res = useMemo(() => (valid ? optimizerScenarios({ base, lumpSum: lump, extraMonthly: extra, annualStepUpPct: stepUp, prepayMode: mode, scheduled }) : null), [valid, b, lump, extra, stepUp, mode, scheduled]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasLiquidity = hh.monthlyEssentials > 0
  const liq = liquidityAfter(hh.cashForPrepayment + hh.emergencyFund, lump, hh.monthlyEssentials, hh.bufferMonths)

  if (!res)
    return (
      <div>
        <PageHead eyebrow="Optimise" title="How should I optimise this loan?" />
        <div className="workbench">
          <div className="controls">{src.ui}</div>
          <div className="callout warn">Enter an outstanding amount, rate, tenure, and an EMI that covers the monthly interest.</div>
        </div>
      </div>
    )

  const { base: bs, scenarios } = res
  const all: (ScenarioResult & { isBase?: boolean })[] = scenarios
  const best = scenarios.length ? scenarios.reduce((a, c) => (c.interestSaved > a.interestSaved ? c : a)) : null
  const fastest = scenarios.length ? scenarios.reduce((a, c) => (c.schedule.months < a.schedule.months ? c : a)) : null
  const lowestMonthly = [...scenarios].sort((a, c) => a.firstPayment - c.firstPayment)[0]
  const liquidityOk = (s: ScenarioResult) => !hasLiquidity || liquidityAfter(hh.cashForPrepayment + hh.emergencyFund, s.cashToday, hh.monthlyEssentials, hh.bufferMonths).status === 'ok'
  const friendlyPool = scenarios.filter((s) => s.interestSaved > 0 && liquidityOk(s))
  const friendly = friendlyPool.length ? friendlyPool.reduce((a, c) => (c.interestSaved / Math.max(1, c.cashToday) > a.interestSaved / Math.max(1, a.cashToday) ? c : a)) : null
  const badges = (s: ScenarioResult) => (
    <div className="row" style={{ gap: 4 }}>
      {best?.key === s.key && <Badge tone="solid">Lowest total interest</Badge>}
      {fastest?.key === s.key && <Badge tone="good">Fastest payoff</Badge>}
      {lowestMonthly?.key === s.key && lowestMonthly.firstPayment < bs.emi && <Badge tone="neutral">Lowest monthly burden</Badge>}
      {friendly?.key === s.key && scenarios.length > 1 && <Badge tone="watch">Most liquidity-friendly</Badge>}
    </div>
  )
  const start = new Date().toISOString().slice(0, 10)
  const targetMonths = targetYears ? Math.round(targetYears * 12) : null
  const needExtra = targetMonths ? extraForTarget(b.principal, b.rate, b.emi, targetMonths) : 0
  const lStep = stepFor(b.principal)
  const isHome = b.type === 'home'

  return (
    <div>
      <PageHead
        eyebrow="Optimise"
        title="How should I optimise this loan?"
        lede="Move the sliders. Every option is compared with simply continuing as you are. Prepaying is not always the right call — check your cash buffer below."
      />
      <div className="workbench">
        <div className="controls stack">
          {src.ui}
          <hr className="rule" />
          <h2 className="h3">Try these levers</h2>
          <Slider label="Lump-sum prepayment today" value={lump} min={0} max={Math.min(b.principal, Math.max(lStep * 20, Math.round(b.principal / 2 / lStep) * lStep))} step={lStep} onChange={setLump} display={(v) => (v ? compact(v) : 'None')} />
          <Slider label="Extra every month" value={extra} min={0} max={Math.max(5000, Math.round(b.emi / 500) * 500)} step={b.emi > 20_000 ? 1000 : 500} onChange={setExtra} display={(v) => (v ? `+${money(v)}` : 'None')} hint={extra ? `New EMI ${money(b.emi + extra)}` : undefined} />
          <Slider label="Raise EMI every year by" value={stepUp} min={0} max={15} step={1} onChange={setStepUp} display={(v) => (v ? `${v}%` : 'None')} hint={stepUp ? 'Matches salary growth; first raise after 12 EMIs' : undefined} />
          <Slider label="Regular prepayment (e.g. bonus)" value={periodic} min={0} max={Math.max(lStep * 10, Math.round(b.principal / 10 / lStep) * lStep)} step={lStep} onChange={setPeriodic} display={(v) => (v ? compact(v) : 'None')} />
          {periodic > 0 && (
            <Select
              label="How often"
              value={String(every)}
              onChange={(v) => setEvery(Number(v))}
              options={[
                { value: '6', label: 'Every 6 months' },
                { value: '12', label: 'Every year' },
                { value: '24', label: 'Every 2 years' },
              ]}
            />
          )}
          <div className="stack-s">
            <span className="field-label">Prepayments should</span>
            <Segmented
              label="Prepayment effect"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'tenure', label: 'Shorten the loan' },
                { value: 'emi', label: 'Lower the EMI' },
              ]}
            />
          </div>
          <hr className="rule" />
          <Slider
            label="I want to be debt-free in"
            value={targetYears ?? Math.ceil(b.months / 12)}
            min={1}
            max={Math.max(1, Math.ceil(b.months / 12))}
            step={1}
            onChange={setTargetYears}
            display={(v) => `${v} year${v === 1 ? '' : 's'}`}
            hint={
              targetMonths && targetMonths < b.months ? (
                <>
                  Needs about <strong>{money(needExtra)}</strong> more each month (EMI {money(b.emi + needExtra)}).{' '}
                  <button type="button" className="link-btn" onClick={() => setExtra(Math.ceil(needExtra / 100) * 100)}>
                    Use this
                  </button>
                </>
              ) : (
                'Drag left to see what a faster payoff needs'
              )
            }
          />
          <details className="disclosure" open={hasLiquidity}>
            <summary>Check your cash buffer</summary>
            <div className="stack" style={{ marginTop: 8 }}>
              <MoneyInput range={RANGES.expense} label="Monthly essential expenses" value={hh.monthlyEssentials} onChange={(v) => setHousehold({ monthlyEssentials: v })} hint="Rent, food, bills, EMIs — what you can't skip" />
              <MoneyInput range={RANGES.savings} label="Emergency fund" value={hh.emergencyFund} onChange={(v) => setHousehold({ emergencyFund: v })} />
              <MoneyInput range={RANGES.savings} label="Other cash you could prepay from" value={hh.cashForPrepayment} onChange={(v) => setHousehold({ cashForPrepayment: v })} />
              <div className="grid-2">
                <DecimalInput label="Keep a buffer of" value={hh.bufferMonths} onChange={(v) => setHousehold({ bufferMonths: v })} suffix="months" max={36} range={[0, 24]} step={1} />
                <DecimalInput label="Return elsewhere" value={hh.alternativeReturnPct} onChange={(v) => setHousehold({ alternativeReturnPct: v })} suffix="% / yr" max={30} range={[0, 15]} step={0.5} hint="e.g. FD, debt fund" />
              </div>
              <p className="tiny muted">Saved on this device, used across tools.</p>
            </div>
          </details>
        </div>

        <div className="stack-l" aria-live="polite">
          <section className="stack">
            <div className="eyebrow">{src.label}</div>
            {best && best.interestSaved > 0 ? (
              <div className="stack-s">
                <p className="delight">
                  {best.key === 'combined' ? 'Together, these' : 'This'} remove <b>{compact(best.interestSaved)}</b> of future interest
                  {best.monthsSaved > 0 && (
                    <>
                      {' '}
                      and finish the loan <b>{duration(best.monthsSaved)} sooner</b>
                    </>
                  )}
                  .
                </p>
                <p className="small muted">
                  Debt-free around {monthLabel(start, best.schedule.months - 1)} instead of {monthLabel(start, bs.months - 1)}.
                </p>
              </div>
            ) : (
              <p className="delight">
                Today: <b>{compact(bs.totalInterest)}</b> of interest left over {duration(bs.months)}. Move a slider to see what changes.
              </p>
            )}
          </section>

          <div className="scenario-grid">
            <div className="scenario base">
              <div className="h3">Continue as you are</div>
              <div className="kv">
                <span>EMI</span>
                <span>{money(bs.emi)}</span>
              </div>
              <div className="kv">
                <span>Interest left</span>
                <span className="interest-c">{compact(bs.totalInterest)}</span>
              </div>
              <div className="kv">
                <span>Time left</span>
                <span>{duration(bs.months)}</span>
              </div>
            </div>
            {all.map((s) => (
              <div className="scenario" key={s.key}>
                <div className="h3">{s.label}</div>
                {badges(s)}
                <div className="kv">
                  <span>EMI next month</span>
                  <span>{money(s.firstPayment)}</span>
                </div>
                {s.cashToday > 0 && (
                  <div className="kv">
                    <span>Cash needed today</span>
                    <span>{compact(s.cashToday)}</span>
                  </div>
                )}
                <div className="kv">
                  <span>Interest saved</span>
                  <span className="good-c">{compact(s.interestSaved)}</span>
                </div>
                <div className="kv">
                  <span>Time saved</span>
                  <span>{s.monthsSaved > 0 ? duration(s.monthsSaved) : '—'}</span>
                </div>
                {s.key === 'lump' && s.schedule.totalPrepayments > 0 && (
                  <div className="kv">
                    <span>Saved per ₹1 prepaid</span>
                    <span>₹{(s.interestSaved / (s.schedule.totalPrepayments || 1)).toFixed(2)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          {!scenarios.length && <p className="muted small">Use the levers on the left. Results update instantly.</p>}

          {(lump > 0 || periodic > 0 || hasLiquidity) && (
            <section className="stack-s">
              {lump > 0 && hasLiquidity && (
                <Insight tone={liq.status === 'ok' ? 'good' : 'watch'}>
                  {liq.status === 'short' ? (
                    <>
                      Prepaying {compact(lump)} is more than the {compact(hh.cashForPrepayment + hh.emergencyFund)} you have available.
                    </>
                  ) : (
                    <>
                      Prepaying {compact(lump)} leaves you {compact(liq.cashAfter)} — {liq.monthsCovered.toFixed(1)} months of essential expenses.
                      {liq.status === 'thin'
                        ? ` That is below your ${hh.bufferMonths}-month buffer by ${compact(liq.shortfall)}. You may want to prepay ${compact(Math.max(0, lump - liq.shortfall))} instead.`
                        : ` That keeps your ${hh.bufferMonths}-month buffer intact.`}
                    </>
                  )}
                </Insight>
              )}
              {lump > 0 && !hasLiquidity && <Insight tone="watch">Before prepaying {compact(lump)}, check it leaves you enough cash for emergencies. Add your expenses under “Check your cash buffer”.</Insight>}
              {(lump > 0 || periodic > 0) && (
                <Insight tone={b.rate >= hh.alternativeReturnPct ? 'good' : 'watch'}>
                  Money used to prepay effectively earns your loan rate, about {pct(b.rate)} a year, with no risk.{' '}
                  {b.rate >= hh.alternativeReturnPct
                    ? `That is more than the ${pct(hh.alternativeReturnPct)} you expect elsewhere, before tax.`
                    : `You expect ${pct(hh.alternativeReturnPct)} elsewhere, which is higher — but that return is not guaranteed and is usually taxed.`}
                  {isHome && ' For home loans under the old tax regime, interest you no longer pay may also mean a smaller tax deduction.'}
                </Insight>
              )}
              {extra > 0 && scenarios.find((s) => s.key === 'extra') && (
                <Insight tone="neutral">
                  Paying {money(extra)} more each month ({pct((extra / b.emi) * 100, 0)} of your EMI) saves {compact(scenarios.find((s) => s.key === 'extra')!.interestSaved)} — no lump sum needed.
                </Insight>
              )}
            </section>
          )}

          {best && (
            <Section title="Balance over time" sub="Hover or tap for exact balances." id="bal">
              <BalanceChart
                title="Outstanding balance: current plan versus best option"
                startDate={start}
                series={[
                  { label: 'Current plan', color: 'var(--ink-3)', values: [b.principal, ...bs.rows.map((r) => r.closing)], dashed: true },
                  { label: best.label, color: 'var(--interest)', values: [b.principal, ...best.schedule.rows.map((r) => r.closing)] },
                ]}
              />
            </Section>
          )}

          <div className="row small">
            <a href={href('/prepay', src.saved ? { loan: src.saved.id } : undefined)}>Compare reduce-EMI vs reduce-tenure in detail →</a>
            <a href={href('/refinance', src.saved ? { loan: src.saved.id } : undefined)}>Or check a lower rate elsewhere →</a>
          </div>

          <Assumptions
            items={[
              'Your interest rate stays the same for the rest of the loan. Floating rates will move.',
              `Prepayments are applied before the next EMI. “${mode === 'tenure' ? 'Shorten the loan' : 'Lower the EMI'}” is applied to every prepayment.`,
              'No prepayment charges are included. Fixed-rate loans may carry them — check with your lender.',
              `${loanType(b.type).label} interest shown before any tax benefit.`,
              `Step-ups increase the EMI by the chosen % after every 12 EMIs, rounded up to the next rupee. Computed EMI for reference: ${money(calcEmi(b.principal, b.rate, b.months))}.`,
            ]}
          />
        </div>
      </div>
    </div>
  )
}
