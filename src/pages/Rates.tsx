import { useMemo, useState } from 'react'
import { emi as calcEmi, schedule, tenureFor } from '../core/amortize'
import { rateSensitivity } from '../core/scenarios'
import { compact, duration, fmtDate, money, pct } from '../locale'
import { currentBenchmark, useStore } from '../store/loans'
import { Assumptions, Insight, PageHead, Section, Source } from '../ui/bits'
import { DecimalInput, MoneyInput, RANGES, Segmented, Slider, TenureInput } from '../ui/inputs'
import { href, navigate, useRoute } from '../ui/router'

export default function Rates() {
  const route = useRoute()
  const tab = route.query.get('tab') === 'floating' ? 'floating' : 'understand'
  return (
    <div className="stack-l">
      <PageHead eyebrow="Interest rates" title="Understand interest rates" lede="What a quoted rate means for your EMI, how sensitive it is, and how floating rates move. Enter the rate a lender quoted you." />
      <div style={{ marginTop: -12 }}>
        <Segmented
          label="Section"
          value={tab}
          onChange={(t) => navigate('/rates', { tab: t })}
          options={[
            { value: 'understand', label: 'Understand a rate' },
            { value: 'floating', label: 'How floating rates work' },
          ]}
        />
      </div>
      {tab === 'understand' && <Understand />}
      {tab === 'floating' && <Floating />}
    </div>
  )
}

/* ---------------------------------------------------------------- */

function Understand() {
  const bm = currentBenchmark(useStore())
  const route = useRoute()
  const [rate, setRate] = useState(Number(route.query.get('rate')) || 8.35)
  const [amount, setAmount] = useState(Number(route.query.get('amount')) || 5_000_000)
  const [months, setMonths] = useState(Number(route.query.get('months')) || 240)
  const [floating, setFloating] = useState<'floating' | 'fixed'>('floating')
  const valid = amount > 0 && months > 0
  const base = useMemo(() => (valid ? schedule({ principal: amount, annualRate: rate, months }) : null), [valid, amount, rate, months])
  const sens = useMemo(() => (valid ? rateSensitivity(amount, months, rate, [-0.5, -0.25, 0, 0.25, 0.5, 0.75, 1, 1.5, 2]) : []), [valid, amount, months, rate])
  const r25 = sens.find((r) => Math.abs(r.rate - (rate + 0.25)) < 1e-6)
  const r100 = sens.find((r) => Math.abs(r.rate - (rate + 1)) < 1e-6)
  const monthly = rate / 12
  const firstInterest = (amount * rate) / 1200
  const emi = base?.emi ?? 0
  const tenureAt1 = tenureFor(amount, rate + 1, emi)
  return (
    <div className="workbench">
      <div className="controls stack">
        <DecimalInput label="Quoted rate" value={rate} onChange={setRate} max={40} step={0.05} suffix="% / year" range={RANGES.rate} />
        <Segmented
          label="Rate type"
          value={floating}
          onChange={setFloating}
          options={[
            { value: 'floating', label: 'Floating' },
            { value: 'fixed', label: 'Fixed' },
          ]}
        />
        <MoneyInput label="Loan amount" value={amount} onChange={setAmount} required range={RANGES.outstanding} />
        <TenureInput label="Tenure" months={months} onChange={setMonths} />
      </div>
      {!base ? (
        <div className="callout warn">Enter an amount and tenure.</div>
      ) : (
        <div className="stack-l">
          <section className="stack-s">
            <p className="delight">
              “{pct(rate)} {floating}” means about <b>{pct(monthly, 3)}</b> interest a month on whatever you still owe.
            </p>
            <Insight>
              On {compact(amount)}, the first month's interest is {money(firstInterest)}. Your EMI of {money(emi)} covers that, and the remaining {money(emi - firstInterest)} reduces the loan. As
              the balance falls, so does the interest.
            </Insight>
            {floating === 'floating' ? (
              <Insight tone="watch">
                Floating means this rate is {pct(rate - bm.value)} above the benchmark today if it is repo-linked ({bm.name} {pct(bm.value)}). When the
                benchmark moves, your rate moves at the next reset; the lender either changes your EMI or your tenure.
              </Insight>
            ) : (
              <Insight tone="good">Fixed means the rate shouldn't change for the fixed period. Check whether it is fixed for the whole tenure or only a few years, and what happens after.</Insight>
            )}
          </section>
          <div className="stats s3">
            <Stat2 label="EMI at this rate" value={money(emi)} sub={`${compact(base.totalInterest)} total interest`} />
            <Stat2 label="+0.25% costs" value={`+${money(r25?.deltaEmi ?? 0)}/mo`} sub={`+${compact(r25?.deltaInterest ?? 0)} over the loan`} />
            <Stat2 label="+1% costs" value={`+${money(r100?.deltaEmi ?? 0)}/mo`} sub={`+${compact(r100?.deltaInterest ?? 0)} over the loan`} />
          </div>
          {floating === 'floating' && Number.isFinite(tenureAt1) && (
            <Insight tone="neutral">
              If the rate rose 1% and your lender kept the EMI at {money(emi)}, the loan would run {duration(tenureAt1)} instead of {duration(months)}.
            </Insight>
          )}
          <Section title="Rate sensitivity" sub="Same amount and tenure; only the rate changes." id="sens">
            <div className="panel-flush table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Rate</th>
                    <th className="r">EMI</th>
                    <th className="r">vs now</th>
                    <th className="r">Total interest</th>
                    <th className="r">vs now</th>
                  </tr>
                </thead>
                <tbody>
                  {sens.map((r) => (
                    <tr key={r.rate} className={r.deltaEmi === 0 ? 'hl' : ''}>
                      <td>{pct(r.rate)}</td>
                      <td className="r">{money(r.emi)}</td>
                      <td className="r">{r.deltaEmi ? `${r.deltaEmi > 0 ? '+' : '−'}${money(Math.abs(r.deltaEmi))}` : '—'}</td>
                      <td className="r">{money(r.totalInterest)}</td>
                      <td className="r">{r.deltaInterest ? `${r.deltaInterest > 0 ? '+' : '−'}${compact(Math.abs(r.deltaInterest))}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <a className="small" href={href('/new')}>
            See the full cost with fees →
          </a>
        </div>
      )}
    </div>
  )
}

function Stat2({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  )
}

/* ---------------------------------------------------------------- */

function Floating() {
  const b = currentBenchmark(useStore())
  const [spread, setSpread] = useState(2.75)
  const [move, setMove] = useState(0.5)
  const [amount, setAmount] = useState(3_000_000)
  const [months, setMonths] = useState(180)
  const rate = Math.round((b.value + spread) * 100) / 100
  const newRate = Math.round((rate + move) * 100) / 100
  const e0 = calcEmi(amount, rate, months)
  const e1 = calcEmi(amount, newRate, months)
  const t1 = tenureFor(amount, newRate, e0)
  return (
    <div className="stack-l">
      <div className="workbench">
        <div className="controls stack">
          <p className="small">
            Most Indian bank floating-rate loans are linked to an <strong>external benchmark</strong>, usually the {b.name}. Your rate = benchmark + spread.
          </p>
          <DecimalInput label="Your spread" value={spread} onChange={setSpread} max={10} step={0.05} range={[0, 6]} hint={`Your rate today: ${pct(b.value)} + ${pct(spread)} = ${pct(rate)}`} />
          <Slider label="Benchmark moves by" value={move} min={-1.5} max={2} step={0.25} onChange={setMove} display={(v) => `${v > 0 ? '+' : ''}${pct(v)}`} />
          <MoneyInput label="Outstanding" value={amount} onChange={setAmount} range={RANGES.outstanding} />
          <TenureInput label="Remaining tenure" months={months} onChange={setMonths} />
        </div>
        <div className="stack">
          <p className="delight">
            Benchmark {pct(b.value)} → {pct(b.value + move)}. With your spread unchanged, your rate goes from <b>{pct(rate)}</b> to <b>{pct(newRate)}</b> at the next reset.
          </p>
          <div className="offer-cols">
            <div className="scenario">
              <span className="h3">If the lender changes the EMI</span>
              <div className="kv">
                <span>EMI</span>
                <span>
                  {money(e0)} → {money(e1)}
                </span>
              </div>
              <div className="kv">
                <span>Difference</span>
                <span className={e1 > e0 ? 'bad-c' : 'good-c'}>
                  {e1 >= e0 ? '+' : '−'}
                  {money(Math.abs(e1 - e0))} / month
                </span>
              </div>
            </div>
            <div className="scenario">
              <span className="h3">If the lender changes the tenure</span>
              <div className="kv">
                <span>Tenure</span>
                <span>{Number.isFinite(t1) ? `${duration(months)} → ${duration(t1)}` : 'EMI would not cover interest'}</span>
              </div>
              <div className="kv">
                <span>EMI</span>
                <span>{money(e0)} (unchanged)</span>
              </div>
            </div>
          </div>
          <p className="small muted">Many lenders extend the tenure by default because the EMI stays the same — it is less visible but usually costs more interest. You can ask for the EMI option.</p>
        </div>
      </div>

      <Section title="The parts of a floating rate" id="parts">
        <dl className="stack" style={{ margin: 0 }}>
          {[
            ['Benchmark', `The reference rate your loan follows. For most bank retail loans today it is the ${b.name} (currently ${pct(b.value)}, as of ${fmtDate(b.asOf)}). Some older loans follow MCLR or base rate, which the bank sets and which move more slowly.`],
            ['External vs internal benchmark', 'External: set outside the bank (e.g. RBI repo). Changes reach you faster in both directions. Internal (MCLR, base rate): set by the bank from its own costs; cuts often reach borrowers late.'],
            ['Spread', 'The fixed margin the lender adds to the benchmark. It reflects your credit risk and the lender’s pricing. Ask whether it can change during the loan and on what conditions.'],
            ['Reset frequency', 'How often your rate is recalculated from the benchmark — commonly every 3 months for repo-linked loans. A benchmark change only reaches you at your next reset date.'],
            ['Rate revision', 'At reset, the lender adjusts either your EMI or your tenure. RBI rules require lenders to tell you and let you choose, and to offer prepayment.'],
          ].map(([t, d]) => (
            <div key={t} className="glossary-item" style={{ paddingTop: 0 }}>
              <dt className="h3">{t}</dt>
              <dd style={{ margin: '4px 0 0' }} className="small">
                {d}
              </dd>
            </div>
          ))}
        </dl>
        <Source label={b.source.label} url={b.source.url} asOf={fmtDate(b.asOf)} />
      </Section>
      <Assumptions items={['Actual loan terms depend on your lender’s contract: benchmark, spread, reset dates and what changes at reset.', 'The spread is assumed unchanged.']} />
    </div>
  )
}
