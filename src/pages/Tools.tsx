import { useMemo, useState, type ReactNode } from 'react'
import { principalFor, rateFor, tenureFor } from '../core/amortize'
import { affordability, stressTest, type Comfort, type StressScenario } from '../core/household'
import { foreclosure, liquidityAfter, rateRise } from '../core/scenarios'
import { compact, duration, locale, loanType, money, pct } from '../locale'
import type { LoanTypeId } from '../locale/types'
import { setHousehold, useStore } from '../store/loans'
import { Arrow, Assumptions, Badge, Insight, PageHead, Section, Stat } from '../ui/bits'
import { Chips, DecimalInput, MoneyInput, TenureInput } from '../ui/inputs'
import { useLoanSource } from '../ui/LoanSource'
import { href } from '../ui/router'

const TOOLS: { id: string; title: string; sub: string; to?: string }[] = [
  { id: 'affordability', title: 'How much can I safely borrow?', sub: 'Comfortable EMI and loan, not the lender maximum' },
  { id: 'stress', title: 'EMI stress test', sub: 'Rate rises, income drops, big expenses' },
  { id: 'rate-rise', title: 'My rate went up — what now?', sub: 'Higher EMI, longer tenure, or prepay' },
  { id: 'foreclosure', title: 'Should I close my loan early?', sub: 'Net benefit vs keeping your cash' },
  { id: 'loan-from-emi', title: 'Loan amount from an EMI', sub: 'What EMI ₹X buys at a rate and tenure' },
  { id: 'tenure', title: 'How long will my loan run?', sub: 'Tenure from amount, rate and EMI' },
  { id: 'rate-from-emi', title: 'What rate am I really paying?', sub: 'Rate implied by amount, EMI and tenure' },
  { id: 'flat-rate', title: 'Flat rate converter', sub: 'Convert a flat rate to its reducing-balance equivalent' },
  { id: 'redflags', title: 'Offer red-flag checklist', sub: 'Tick what applies; see why it matters' },
  { id: 'ask', title: 'Ask the lender', sub: 'Questions for your loan type' },
  { id: '', title: 'EMI calculator & amortisation', sub: 'Full cost, charts and schedule', to: '/new' },
  { id: '', title: 'Prepayment planner', sub: 'Reduce EMI vs tenure, many prepayments', to: '/prepay' },
  { id: '', title: 'Refinancing & break-even', sub: 'Balance transfer after switching costs', to: '/refinance' },
  { id: '', title: 'Compare offers', sub: 'Rank by total cost', to: '/compare' },
  { id: '', title: 'Rate sensitivity', sub: 'EMI and interest at nearby rates', to: '/rates?tab=understand' },
]

export default function Tools({ id }: { id?: string }) {
  const tool = TOOLS.find((t) => t.id === id && id)
  if (!tool)
    return (
      <div className="stack-l">
        <PageHead eyebrow="Tools" title="Loan tools" lede="Quick answers to specific questions. All of them use the same calculation engine as the rest of LoanLens." />
        <nav className="tool-list">
          {TOOLS.map((t) => {
            const to = t.to ?? `/tools/${t.id}`
            const [p, qs] = to.split('?')
            return (
              <a key={t.title} className="intent" href={`#${p}${qs ? '?' + qs : ''}`}>
                <span>
                  {t.title}
                  <small>{t.sub}</small>
                </span>
                <Arrow />
              </a>
            )
          })}
        </nav>
      </div>
    )
  const body: Record<string, ReactNode> = {
    affordability: <Affordability />,
    stress: <Stress />,
    'rate-rise': <RateRise />,
    foreclosure: <Foreclosure />,
    'loan-from-emi': <LoanFromEmi />,
    tenure: <Tenure />,
    'rate-from-emi': <RateFromEmi />,
    'flat-rate': <FlatRate />,
    redflags: <RedFlags />,
    ask: <Ask />,
  }
  return (
    <div className="stack-l">
      <div>
        <a href={href('/tools')} className="small muted">
          ← All tools
        </a>
        <PageHead eyebrow="Tool" title={tool.title} lede={tool.sub} />
      </div>
      {body[tool.id]}
    </div>
  )
}

/* -------------------------- Affordability -------------------------- */

function HouseholdInputs({ withFund = true }: { withFund?: boolean }) {
  const { household: h } = useStore()
  return (
    <>
      <MoneyInput label="Monthly take-home income" value={h.monthlyIncome} onChange={(v) => setHousehold({ monthlyIncome: v })} required />
      <MoneyInput label="Existing EMIs" value={h.existingEmis} onChange={(v) => setHousehold({ existingEmis: v })} hint="Other loans you already pay each month" />
      <MoneyInput label="Essential monthly expenses" value={h.monthlyEssentials} onChange={(v) => setHousehold({ monthlyEssentials: v })} hint="Rent, food, utilities, school fees, insurance" />
      <MoneyInput label="Other fixed commitments" value={h.otherObligations} onChange={(v) => setHousehold({ otherObligations: v })} hint="SIPs you won’t stop, support to family" />
      <DecimalInput label="Dependents" value={h.dependents} onChange={(v) => setHousehold({ dependents: Math.round(v) })} suffix="people" max={15} />
      {withFund && <MoneyInput label="Emergency fund" value={h.emergencyFund} onChange={(v) => setHousehold({ emergencyFund: v })} />}
      <p className="tiny muted">Saved on this device and shared with the stress test and optimiser.</p>
    </>
  )
}

function Affordability() {
  const { household: h } = useStore()
  const [type, setType] = useState<LoanTypeId>('home')
  const lt = loanType(type)
  const [rate, setRate] = useState(lt.defaultRate)
  const [months, setMonths] = useState(lt.defaultMonths)
  const p = locale.affordability
  const r = useMemo(() => (h.monthlyIncome > 0 ? affordability(h, rate, months, p) : null), [h, rate, months, p])
  const dti = h.monthlyIncome > 0 ? (h.existingEmis / h.monthlyIncome) * 100 : 0
  return (
    <div className="workbench">
      <div className="controls stack">
        <Chips label="Loan type" value={type} onChange={(t) => (setType(t), setRate(loanType(t).defaultRate), setMonths(loanType(t).defaultMonths))} options={locale.loanTypes.filter((t) => t.id !== 'other').map((t) => ({ value: t.id, label: t.short }))} />
        <HouseholdInputs />
        <DecimalInput label="Expected rate" value={rate} onChange={setRate} max={40} step={0.05} />
        <TenureInput label="Preferred tenure" months={months} onChange={setMonths} maxYears={lt.maxYears} />
      </div>
      {!r ? (
        <div className="callout warn">Enter your monthly income to begin.</div>
      ) : (
        <div className="stack-l">
          <div className="offer-cols">
            {r.levels.map((l) => (
              <div key={l.key} className={`scenario ${l.key === 'lender' ? 'base' : ''}`}>
                <div className="row between">
                  <span className="h3">{l.label}</span>
                  {l.key === 'comfortable' && <Badge tone="good">Suggested</Badge>}
                </div>
                <div className="num-l">{l.loan > 0 ? compact(l.loan) : '—'}</div>
                <div className="kv">
                  <span>EMI</span>
                  <span>{money(l.emi)}</span>
                </div>
                <div className="kv">
                  <span>All EMIs / income</span>
                  <span>{pct(((l.emi + h.existingEmis) / h.monthlyIncome) * 100, 0)}</span>
                </div>
              </div>
            ))}
          </div>
          <section className="stack-s">
            {r.notes.map((n) => (
              <Insight key={n} tone="watch">
                {n}
              </Insight>
            ))}
            <Insight>
              After essentials, existing EMIs and commitments you have {money(r.surplus)} a month. The comfortable level uses at most {p.comfortableSurplusPct}% of that, so a bad month doesn’t
              force you to borrow.
            </Insight>
            <Insight tone="neutral">
              Your current debt-to-income ratio is {pct(dti, 0)} ({money(h.existingEmis)} of EMIs on {money(h.monthlyIncome)} income).
            </Insight>
            {r.emergencyGap > 0 ? (
              <Insight tone="watch">
                With the comfortable EMI, a {p.emergencyMonths}-month emergency fund would be {compact(r.emergencyTarget)}. You are {compact(r.emergencyGap)} short.
              </Insight>
            ) : (
              <Insight tone="good">Your emergency fund covers {p.emergencyMonths} months of essentials and EMIs at the comfortable level.</Insight>
            )}
          </section>
          <Assumptions
            items={[
              `Lender ceiling: all EMIs up to ${p.lenderCapPct}% of income — a common rule of thumb (FOIR); actual lender limits vary from about 40% to 65% depending on income and lender.`,
              `Comfortable: all EMIs within ${p.comfortablePct}% of income and the new EMI within ${p.comfortableSurplusPct}% of your monthly surplus. Conservative: ${p.conservativePct}% and ${p.conservativeSurplusPct}%.`,
              `Each dependent reduces the comfortable and conservative shares by ${p.perDependentPct} percentage points.`,
              'These are planning rules of thumb, not RBI rules or a lender’s eligibility decision.',
            ]}
          />
        </div>
      )}
    </div>
  )
}

/* -------------------------- Stress test -------------------------- */

const COMFORT_TONE: Record<Comfort, 'good' | 'watch' | 'bad' | 'neutral'> = { Comfortable: 'good', Watch: 'neutral', Stretched: 'watch', 'High risk': 'bad' }

function Stress() {
  const src = useLoanSource()
  const { household: h } = useStore()
  const b = src.basics
  const [shock, setShock] = useState(200_000)
  const scenarios: StressScenario[] = [
    { key: 'now', label: 'Today' },
    { key: 'r50', label: 'Rate +0.50%', rateDelta: 0.5 },
    { key: 'r100', label: 'Rate +1.00%', rateDelta: 1 },
    { key: 'r200', label: 'Rate +2.00%', rateDelta: 2 },
    { key: 'i10', label: 'Income −10%', incomeFactor: 0.9 },
    { key: 'i20', label: 'Income −20%', incomeFactor: 0.8 },
    { key: 'shock', label: `Unexpected ${compact(shock)} expense`, shock },
    { key: 'combo', label: 'Rate +1% and income −10%', rateDelta: 1, incomeFactor: 0.9 },
  ]
  // Existing EMIs here exclude this loan; the loan's own EMI is added by the stress test.
  const rows = h.monthlyIncome > 0 && b.principal > 0 ? stressTest({ balance: b.principal, rate: b.rate, months: b.months }, h, scenarios, locale.stress) : []
  const now = rows[0]
  const r100 = rows.find((r) => r.scenario.key === 'r100')
  return (
    <div className="workbench">
      <div className="controls stack">
        <h2 className="h3">The loan</h2>
        {src.ui}
        <hr className="rule" />
        <h2 className="h3">Your household</h2>
        <HouseholdInputs />
        <MoneyInput label="Size of an unexpected expense" value={shock} onChange={setShock} />
      </div>
      {!now ? (
        <div className="callout warn">Enter the loan and your monthly income.</div>
      ) : (
        <div className="stack-l">
          <p className="delight">
            You’re <b style={{ color: 'var(--ink)' }}>{now.level.toLowerCase()}</b> at {pct(b.rate)}
            {r100 && r100.level !== now.level ? (
              <>
                , but a 1% increase makes the loan <b>{r100.level.toLowerCase()}</b>.
              </>
            ) : (
              <>, and still {r100?.level.toLowerCase()} if the rate rises 1%.</>
            )}
          </p>
          <div className="panel-flush table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Status</th>
                  <th className="r">This EMI</th>
                  <th className="r">All EMIs / income</th>
                  <th className="r">Left each month</th>
                  <th className="r">Buffer</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.scenario.key}>
                    <td>{r.scenario.label}</td>
                    <td>
                      <Badge tone={COMFORT_TONE[r.level]}>{r.level}</Badge>
                    </td>
                    <td className="r">{money(r.emi)}</td>
                    <td className="r">{pct(r.emiShare, 0)}</td>
                    <td className={`r ${r.monthlyLeft < 0 ? 'bad-c' : ''}`}>{money(r.monthlyLeft)}</td>
                    <td className="r">{Number.isFinite(r.bufferMonths) ? `${r.bufferMonths.toFixed(1)} mo` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Assumptions
            items={[
              'Rate scenarios keep the remaining tenure and raise the EMI (the more demanding case). If your lender extends tenure instead, the EMI stays but you pay more interest.',
              `Comfortable: all EMIs below ${locale.stress.watchSharePct}% of income and at least ${locale.stress.minBufferMonths} months of buffer. Watch: up to ${locale.stress.stretchedSharePct}%. Stretched: up to ${locale.stress.highRiskSharePct}% or under 1 month of buffer. High risk: above that, or spending more than you earn.`,
              '“Buffer” is your emergency fund divided by monthly outgoings (essentials + commitments + all EMIs).',
              '“Existing EMIs” should not include this loan.',
            ]}
          />
        </div>
      )}
    </div>
  )
}

/* -------------------------- Rate rise -------------------------- */

function RateRise() {
  const src = useLoanSource()
  const b = src.basics
  const [newRate, setNewRate] = useState(Math.round((b.rate + 0.5) * 100) / 100)
  const { household: hh } = useStore()
  const valid = b.principal > 0 && b.months > 0 && newRate > 0
  const r = useMemo(() => (valid ? rateRise(b.principal, b.rate, newRate, b.months, b.emi) : null), [valid, b, newRate])
  return (
    <div className="workbench">
      <div className="controls stack">
        {src.ui}
        <DecimalInput label="New interest rate" value={newRate} onChange={setNewRate} max={40} step={0.05} hint={newRate > b.rate ? `+${pct(newRate - b.rate)}` : undefined} />
      </div>
      {!r ? (
        <div className="callout warn">Enter your loan and the new rate.</div>
      ) : (
        <div className="stack-l">
          <p className="delight">
            {pct(b.rate)} → {pct(newRate)}. Before the change: <b style={{ color: 'var(--ink)' }}>{compact(r.before.totalInterest)}</b> interest left over {duration(r.before.months)}.
          </p>
          <div className="offer-cols">
            {r.options.map((o) => (
              <div key={o.key} className="scenario">
                <span className="h3">{o.label}</span>
                {o.feasible ? (
                  <>
                    <div className="kv">
                      <span>EMI</span>
                      <span>{money(o.emi)}</span>
                    </div>
                    <div className="kv">
                      <span>Time left</span>
                      <span>{duration(o.months)}</span>
                    </div>
                    <div className="kv">
                      <span>Interest left</span>
                      <span className="interest-c">{compact(o.totalInterest)}</span>
                    </div>
                    <div className="kv">
                      <span>Extra interest vs before</span>
                      <span>{compact(o.totalInterest - r.before.totalInterest)}</span>
                    </div>
                    {o.cashToday > 0 && (
                      <div className="kv">
                        <span>Cash needed today</span>
                        <span>{money(o.cashToday)}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="small bad-c">The current EMI no longer covers the interest at this rate (or would take over 50 years). The lender will need to raise the EMI.</p>
                )}
              </div>
            ))}
          </div>
          {(() => {
            const [k, t] = r.options
            if (!k.feasible) return null
            const diff = k.totalInterest - t.totalInterest
            const p = r.options[2]
            const liq = hh.monthlyEssentials > 0 ? liquidityAfter(hh.cashForPrepayment + hh.emergencyFund, p.cashToday, hh.monthlyEssentials, hh.bufferMonths) : null
            return (
              <section className="stack-s">
                <Insight tone="watch">
                  Keeping the EMI looks painless, but adds {duration(k.months - b.months)} and costs {compact(diff)} more interest than paying {money(t.emi - b.emi)} more each month.
                </Insight>
                <Insight>
                  If {money(t.emi - b.emi)} a month is affordable, raising the EMI is the cheaper choice. If not, a mix works: raise the EMI by what you can, and let the tenure absorb the rest. You can also
                  switch later.
                </Insight>
                {liq && (
                  <Insight tone={liq.status === 'ok' ? 'good' : 'watch'}>
                    Prepaying {compact(p.cashToday)} to keep everything unchanged would leave {liq.monthsCovered.toFixed(1)} months of essential expenses in cash.
                  </Insight>
                )}
                <Insight tone="neutral">
                  If the new rate is well above what other lenders charge, <a href={href('/refinance', src.saved ? { loan: src.saved.id } : undefined)}>check whether a balance transfer is worth it</a>.
                </Insight>
              </section>
            )
          })()}
          <Assumptions items={['The new rate applies from the next EMI and stays constant afterwards.', 'RBI rules require lenders to let you choose between a higher EMI, a longer tenure, or both, and to allow prepayment.']} />
        </div>
      )}
    </div>
  )
}

/* -------------------------- Foreclosure -------------------------- */

function Foreclosure() {
  const src = useLoanSource()
  const b = src.basics
  const { household: hh } = useStore()
  const [fc, setFc] = useState<number | null>(null)
  const charge = fc ?? b.foreclosureChargePct
  const valid = b.principal > 0 && b.months > 0
  const f = valid
    ? foreclosure({
        balance: b.principal,
        rate: b.rate,
        remainingMonths: b.months,
        emi: b.emi,
        chargePct: charge,
        taxOnChargesPct: locale.chargeTax.pct,
        cashAvailable: hh.cashForPrepayment + hh.emergencyFund,
        monthlyEssentials: hh.monthlyEssentials,
        alternativeReturnPct: hh.alternativeReturnPct,
      })
    : null
  return (
    <div className="workbench">
      <div className="controls stack">
        {src.ui}
        <DecimalInput label="Foreclosure charge" value={charge} onChange={setFc} max={10} suffix="% of balance" hint={`${locale.chargeTax.label} added`} />
        <hr className="rule" />
        <MoneyInput label="Cash and savings available" value={hh.cashForPrepayment} onChange={(v) => setHousehold({ cashForPrepayment: v })} />
        <MoneyInput label="Emergency fund" value={hh.emergencyFund} onChange={(v) => setHousehold({ emergencyFund: v })} />
        <MoneyInput label="Monthly essential expenses" value={hh.monthlyEssentials} onChange={(v) => setHousehold({ monthlyEssentials: v })} />
        <DecimalInput label="Return you'd expect on the cash instead" value={hh.alternativeReturnPct} onChange={(v) => setHousehold({ alternativeReturnPct: v })} suffix="% / yr" max={30} />
      </div>
      {!f ? (
        <div className="callout warn">Enter your loan.</div>
      ) : (
        <div className="stack-l">
          <div className="stats s3">
            <Stat label="To close today" value={money(f.closingAmount)} sub={f.charges ? `incl. ${money(f.charges)} charges` : 'no charges'} />
            <Stat label="Interest avoided" value={<span className="good-c">{money(f.interestAvoided)}</span>} />
            <Stat label="Net financial benefit" value={money(f.netBenefit)} sub="interest avoided − charges" />
          </div>
          <section className="stack-s">
            <h2 className="h3">The maths</h2>
            <Insight tone={f.beatsAlternative ? 'good' : 'watch'}>
              Closing the loan is like earning {pct(f.effectiveReturn)} a year, guaranteed, on {compact(f.closingAmount)}.{' '}
              {f.beatsAlternative ? `That beats the ${pct(hh.alternativeReturnPct)} you expect elsewhere.` : `You expect ${pct(hh.alternativeReturnPct)} elsewhere, which is higher — though usually taxed and not guaranteed.`}
            </Insight>
            <h2 className="h3" style={{ marginTop: 10 }}>
              Your cash
            </h2>
            {hh.cashForPrepayment + hh.emergencyFund === 0 ? (
              <Insight tone="neutral">Enter your cash and expenses to see what closing the loan leaves you with.</Insight>
            ) : !f.affordable ? (
              <Insight tone="watch">Closing needs {compact(f.closingAmount)}; you have {compact(hh.cashForPrepayment + hh.emergencyFund)}. A partial prepayment may suit better.</Insight>
            ) : (
              <Insight tone={f.monthsOfExpensesLeft >= hh.bufferMonths ? 'good' : 'watch'}>
                After closing, you'd have {compact(f.cashLeft)} — {Number.isFinite(f.monthsOfExpensesLeft) ? `${f.monthsOfExpensesLeft.toFixed(1)} months` : 'an unknown number of months'} of essential expenses.
                {f.monthsOfExpensesLeft < hh.bufferMonths ? ` That is below your ${hh.bufferMonths}-month buffer. Mathematically worthwhile isn’t the same as safe.` : ''}
              </Insight>
            )}
            <Insight tone="neutral">Once repaid, a loan is hard to get back quickly. Cash you keep can always be used to prepay later.</Insight>
          </section>
          <Assumptions items={['Rate held constant for the remaining tenure.', 'Effective return is the annualised IRR of the closing amount against the EMIs you will no longer pay.', 'Tax benefits on interest (for home loans, old regime) are not included.']} />
        </div>
      )}
    </div>
  )
}

/* -------------------------- Small calculators -------------------------- */

function LoanFromEmi() {
  const [e, setE] = useState(40_000)
  const [rate, setRate] = useState(8.5)
  const [months, setMonths] = useState(240)
  const p = e > 0 && months > 0 ? principalFor(e, rate, months) : 0
  return (
    <div className="workbench">
      <div className="controls stack">
        <MoneyInput label="EMI you can pay" value={e} onChange={setE} />
        <DecimalInput label="Interest rate" value={rate} onChange={setRate} max={40} step={0.05} />
        <TenureInput label="Tenure" months={months} onChange={setMonths} />
      </div>
      <div className="stack">
        <div className="eyebrow">You could borrow about</div>
        <div className="num-xl">{money(Math.floor(p / 1000) * 1000)}</div>
        <Insight>
          Over {duration(months)} you would pay {money(e * months)} in total, of which about {compact(e * months - p)} is interest.
        </Insight>
        <a className="small" href={href('/tools/affordability')}>
          Is this EMI comfortable for your budget? →
        </a>
      </div>
    </div>
  )
}

function Tenure() {
  const [p, setP] = useState(3_000_000)
  const [rate, setRate] = useState(8.5)
  const [e, setE] = useState(30_000)
  const n = tenureFor(p, rate, e)
  return (
    <div className="workbench">
      <div className="controls stack">
        <MoneyInput label="Loan amount / outstanding" value={p} onChange={setP} />
        <DecimalInput label="Interest rate" value={rate} onChange={setRate} max={40} step={0.05} />
        <MoneyInput label="EMI" value={e} onChange={setE} />
      </div>
      <div className="stack">
        <div className="eyebrow">The loan would run</div>
        {Number.isFinite(n) ? (
          <>
            <div className="num-xl">{duration(n)}</div>
            <Insight>Total paid about {compact(e * n)}, of which {compact(e * n - p)} is interest.</Insight>
          </>
        ) : (
          <Insight tone="watch">An EMI of {money(e)} does not cover the monthly interest of {money((p * rate) / 1200)}. The loan would never be repaid.</Insight>
        )}
      </div>
    </div>
  )
}

function RateFromEmi() {
  const [p, setP] = useState(500_000)
  const [e, setE] = useState(13_000)
  const [months, setMonths] = useState(48)
  const r = p > 0 && months > 0 ? rateFor(p, e, months) : 0
  return (
    <div className="workbench">
      <div className="controls stack">
        <MoneyInput label="Amount you receive" value={p} onChange={setP} hint="Use the amount after any deducted fees to see the all-in rate" />
        <MoneyInput label="EMI" value={e} onChange={setE} />
        <TenureInput label="Tenure" months={months} onChange={setMonths} />
      </div>
      <div className="stack">
        <div className="eyebrow">Implied rate (reducing balance)</div>
        <div className="num-xl">{e * months <= p ? '0%' : pct(r)}</div>
        <Insight>Useful when a lender quotes only an EMI, or a “flat” or “per month” rate. Compare this number across offers.</Insight>
      </div>
    </div>
  )
}

function FlatRate() {
  const [flat, setFlat] = useState(7)
  const [p, setP] = useState(100_000)
  const [months, setMonths] = useState(24)
  const flatEmi = (p * (1 + (flat / 100) * (months / 12))) / months
  const r = rateFor(p, flatEmi, months)
  return (
    <div className="workbench">
      <div className="controls stack">
        <DecimalInput label="Flat rate quoted" value={flat} onChange={setFlat} max={40} step={0.1} suffix="% p.a. flat" />
        <MoneyInput label="Loan amount" value={p} onChange={setP} />
        <TenureInput label="Tenure" months={months} onChange={setMonths} />
      </div>
      <div className="stack">
        <p className="delight">
          A flat <b>{pct(flat)}</b> is really about <b>{pct(r)}</b> on a reducing balance.
        </p>
        <Insight>
          Flat rates charge interest on the full original amount for the entire tenure, even as you repay. EMI here is {money(Math.ceil(flatEmi))}; total interest {money(flatEmi * months - p)}.
        </Insight>
        <a className="small" href={href('/new')}>
          Use this rate in the full calculator →
        </a>
      </div>
    </div>
  )
}

/* -------------------------- Red flags & Ask the lender -------------------------- */

const FLAGS: { t: string; why: string; ask: string }[] = [
  { t: 'Very low headline rate with high processing or other charges', why: 'Charges can outweigh a small rate advantage, especially if you prepay or switch early.', ask: 'Compare the all-in rate (APR) in the Key Facts Statement, not just the rate.' },
  { t: 'Insurance is bundled or described as mandatory', why: 'Insurance added to the loan also accrues interest. Lenders may require cover on the asset, but life cover is usually optional.', ask: 'Ask in writing whether it is mandatory and whether you can buy it elsewhere.' },
  { t: 'You can’t get a clear answer on the floating-rate mechanism', why: 'Without the benchmark and spread, you can’t predict or check future rate changes.', ask: 'Ask for the benchmark, the spread, and the reset dates in the sanction letter.' },
  { t: 'The spread can change at the lender’s discretion', why: 'A changeable spread means your rate can rise even if the benchmark doesn’t.', ask: 'Ask under what conditions the spread can change.' },
  { t: 'Frequent resets or unclear reset dates', why: 'Rate rises reach you sooner; budgeting becomes harder.', ask: 'Ask how often and on which dates your rate is reset.' },
  { t: 'High foreclosure or part-payment charges', why: 'They make prepaying or switching expensive. Floating-rate loans to individuals for personal use shouldn’t carry these under current RBI rules.', ask: 'Ask for the charge in the KFS and confirm it applies to your loan type.' },
  { t: 'High late-payment or bounce charges', why: 'One missed payment can cost far more than expected.', ask: 'Ask for the exact charges and whether a grace period applies.' },
  { t: 'Fees not listed in the Key Facts Statement', why: 'RBI rules say charges not in the KFS can’t be levied without your explicit consent.', ask: 'Ask for every charge to appear in the KFS.' },
  { t: 'Large legal, technical or valuation charges', why: 'These add to upfront cost and are often non-refundable.', ask: 'Ask whether they are refunded if the loan is not sanctioned.' },
  { t: 'Quoted rate is valid only for a very short time', why: 'Pressure to decide quickly makes comparison harder.', ask: 'Ask how long the KFS terms are valid (at least three working days for most loans).' },
  { t: 'The advertised rate needs conditions you may not meet', why: 'Credit score, salary account or a specific property may be required for the headline rate.', ask: 'Ask what rate applies to your profile specifically.' },
  { t: 'Interest is quoted as “flat” or “per month”', why: 'Flat and monthly rates look much smaller than the equivalent reducing-balance annual rate.', ask: 'Ask for the reducing-balance annual rate and the APR.' },
]

function RedFlags() {
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const picked = FLAGS.filter((_, i) => checked.has(i))
  return (
    <div className="stack-l" style={{ maxWidth: 760 }}>
      <p className="small muted">Tick anything that matches the offer you have. None of these means a lender is doing something wrong — they are things to understand before you sign.</p>
      <div>
        {FLAGS.map((f, i) => (
          <label key={f.t} className="check">
            <input
              type="checkbox"
              checked={checked.has(i)}
              onChange={() => {
                const n = new Set(checked)
                if (n.has(i)) n.delete(i)
                else n.add(i)
                setChecked(n)
              }}
            />
            <span>
              {f.t}
              {checked.has(i) && (
                <span className="stack-s fade-in" style={{ marginTop: 6 }}>
                  <span className="small muted">{f.why}</span>
                  <span className="small">
                    <strong>Ask:</strong> {f.ask}
                  </span>
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
      {picked.length > 0 && (
        <div className="callout warn small">
          {picked.length} item{picked.length > 1 ? 's' : ''} to clarify before you sign. Get the answers in writing, ideally in the Key Facts Statement or sanction letter.
        </div>
      )}
    </div>
  )
}

function Ask() {
  const [type, setType] = useState<LoanTypeId>('home')
  const [floating, setFloating] = useState(true)
  const [copied, setCopied] = useState(false)
  const lt = loanType(type)
  const qs = [...locale.commonAskLender, ...(floating ? locale.floatingAskLender : []), ...lt.askLender]
  return (
    <div className="stack-l" style={{ maxWidth: 760 }}>
      <Chips label="Loan type" value={type} onChange={setType} options={locale.loanTypes.filter((t) => t.id !== 'other').map((t) => ({ value: t.id, label: t.short }))} />
      <label className="row small" style={{ gap: 8 }}>
        <input type="checkbox" checked={floating} onChange={(e) => setFloating(e.target.checked)} /> The rate is floating
      </label>
      <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 10 }}>
        {qs.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ol>
      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={() => {
            navigator.clipboard?.writeText(`Questions for my ${lt.label.toLowerCase()}:\n` + qs.map((q, i) => `${i + 1}. ${q}`).join('\n')).then(() => setCopied(true))
          }}
        >
          {copied ? 'Copied ✓' : 'Copy questions'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
          Print
        </button>
      </div>
      <Section title="Related" id="rel">
        <a href={href('/tools/redflags')}>Offer red-flag checklist →</a>
      </Section>
    </div>
  )
}
