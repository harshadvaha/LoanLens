import { useMemo, useState } from 'react'
import { analysePrepayment } from '../core/scenarios'
import { compact, duration, money, monthLabel, pct } from '../locale'
import { Assumptions, Insight, PageHead, Section } from '../ui/bits'
import { BalanceChart } from '../ui/charts'
import { MoneyInput, Select } from '../ui/inputs'
import { useLoanSource } from '../ui/LoanSource'

interface Row {
  id: number
  at: number
  amount: number
}

export default function Prepay() {
  const src = useLoanSource()
  const b = src.basics
  const [rows, setRows] = useState<Row[]>([{ id: 1, at: 0, amount: Math.round(Math.min(300_000, b.principal * 0.1) / 10_000) * 10_000 || 100_000 }])
  const valid = b.principal > 0 && b.months > 0 && b.emi > b.principal * (b.rate / 1200)
  const pre = rows.filter((r) => r.amount > 0)
  const a = useMemo(
    () => (valid && pre.length ? analysePrepayment({ principal: b.principal, annualRate: b.rate, months: b.months, emi: b.emi }, pre.map(({ at, amount }) => ({ at, amount }))) : null),
    [valid, b, rows], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const total = pre.reduce((s, r) => s + r.amount, 0)
  const start = new Date().toISOString().slice(0, 10)
  const atOptions = Array.from({ length: Math.min(b.months, 360) / 6 + 1 }, (_, i) => i * 6).map((m) => ({ value: String(m), label: m === 0 ? 'Today' : `After ${duration(m)}` }))

  return (
    <div>
      <PageHead eyebrow="Prepayment" title="Should I reduce my EMI or my tenure?" lede="Same prepayment, two very different outcomes. Add one or several prepayments to see the cumulative effect." />
      <div className="workbench">
        <div className="controls stack">
          {src.ui}
          <hr className="rule" />
          <h2 className="h3">Prepayments</h2>
          {rows.map((r, i) => (
            <div key={r.id} className="stack-s" style={{ paddingBottom: 8, borderBottom: '1px dotted var(--rule-2)' }}>
              <MoneyInput range={[0, Math.max(10_000, b.principal)]} label={`Prepayment ${i + 1}`} value={r.amount} onChange={(amount) => setRows(rows.map((x) => (x.id === r.id ? { ...x, amount } : x)))} />
              <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <Select label="When" value={String(r.at)} onChange={(v) => setRows(rows.map((x) => (x.id === r.id ? { ...x, at: Number(v) } : x)))} options={atOptions} />
                </div>
                {rows.length > 1 && (
                  <button type="button" className="btn btn-ghost btn-s" onClick={() => setRows(rows.filter((x) => x.id !== r.id))} aria-label={`Remove prepayment ${i + 1}`}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
          <button type="button" className="btn btn-s" style={{ alignSelf: 'flex-start' }} onClick={() => setRows([...rows, { id: Date.now(), at: Math.min(b.months - 1, (rows[rows.length - 1]?.at ?? 0) + 12), amount: rows[rows.length - 1]?.amount ?? 100_000 }])}>
            + Add another prepayment
          </button>
        </div>

        <div className="stack-l" aria-live="polite">
          {!a ? (
            <div className="callout warn">Enter the loan details and at least one prepayment amount.</div>
          ) : (
            <>
              <section className="stack-s">
                <div className="eyebrow">{src.label}</div>
                <p className="delight">
                  Prepaying {compact(total)} removes <b>{compact(a.tenure.interestSaved)}</b> of interest if you keep the EMI, or <b>{compact(a.emi.interestSaved)}</b> if you lower it.
                </p>
                <p className="small muted">
                  Every ₹1 prepaid saves about ₹{(a.tenure.interestSaved / total).toFixed(2)} (shorter loan) or ₹{(a.emi.interestSaved / total).toFixed(2)} (lower EMI).
                </p>
              </section>

              <div className="offer-cols">
                <div className="scenario">
                  <div className="row between">
                    <span className="h3">A · Shorten the loan</span>
                  </div>
                  <span className="tiny muted">Keep EMI at {money(a.base.emi)}</span>
                  <div className="kv">
                    <span>Interest saved</span>
                    <span className="good-c">{money(a.tenure.interestSaved)}</span>
                  </div>
                  <div className="kv">
                    <span>New tenure</span>
                    <span>{duration(a.tenure.schedule.months)}</span>
                  </div>
                  <div className="kv">
                    <span>Finishes</span>
                    <span>
                      {duration(a.tenure.monthsSaved)} earlier · {monthLabel(start, a.tenure.schedule.months - 1)}
                    </span>
                  </div>
                  <div className="kv">
                    <span>EMI</span>
                    <span>{money(a.base.emi)} (unchanged)</span>
                  </div>
                </div>
                <div className="scenario">
                  <span className="h3">B · Lower the EMI</span>
                  <span className="tiny muted">Keep the end date</span>
                  <div className="kv">
                    <span>Interest saved</span>
                    <span className="good-c">{money(a.emi.interestSaved)}</span>
                  </div>
                  <div className="kv">
                    <span>New EMI</span>
                    <span>
                      {money(a.newEmi)} <span className="muted">(−{money(a.base.emi - a.newEmi)})</span>
                    </span>
                  </div>
                  <div className="kv">
                    <span>Tenure</span>
                    <span>{duration(a.emi.schedule.months)} (unchanged)</span>
                  </div>
                </div>
              </div>

              <section className="stack-s">
                <Insight tone="neutral">
                  Shortening the loan saves {compact(a.tenure.interestSaved - a.emi.interestSaved)} more than lowering the EMI. Lowering the EMI frees up {money(a.base.emi - a.newEmi)} a month,
                  which is useful if your budget is tight.
                </Insight>
                {Number.isFinite(a.effectiveReturn) && (
                  <Insight tone="good">
                    The prepaid money earns an effective {pct(a.effectiveReturn)} a year (option A) — the same as your loan rate, guaranteed, before tax.
                  </Insight>
                )}
                <Insight tone="neutral">A middle path many people use: prepay, keep the EMI, and lower it later only if you need to. Most lenders let you choose at each prepayment.</Insight>
              </section>

              <Section title="Balance over time" id="pb">
                <BalanceChart
                  title="Outstanding balance with and without prepayment"
                  startDate={start}
                  series={[
                    { label: 'No prepayment', color: 'var(--ink-3)', values: [b.principal, ...a.base.rows.map((r) => r.closing)], dashed: true },
                    { label: 'A · Shorter loan', color: 'var(--interest)', values: [b.principal, ...a.tenure.schedule.rows.map((r) => r.closing)] },
                    { label: 'B · Lower EMI', color: 'var(--principal)', values: [b.principal, ...a.emi.schedule.rows.map((r) => r.closing)] },
                  ]}
                />
              </Section>

              <Section title="Side by side" id="sbs">
                <div className="panel-flush table-scroll">
                  <table className="data">
                    <thead>
                      <tr>
                        <th />
                        <th className="r">No prepayment</th>
                        <th className="r">A · Shorter</th>
                        <th className="r">B · Lower EMI</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Total interest</td>
                        <td className="r">{money(a.base.totalInterest)}</td>
                        <td className="r">{money(a.tenure.schedule.totalInterest)}</td>
                        <td className="r">{money(a.emi.schedule.totalInterest)}</td>
                      </tr>
                      <tr>
                        <td>Prepaid</td>
                        <td className="r">—</td>
                        <td className="r">{money(total)}</td>
                        <td className="r">{money(total)}</td>
                      </tr>
                      <tr>
                        <td>Time left</td>
                        <td className="r">{duration(a.base.months)}</td>
                        <td className="r">{duration(a.tenure.schedule.months)}</td>
                        <td className="r">{duration(a.emi.schedule.months)}</td>
                      </tr>
                      <tr>
                        <td>Everything paid from today</td>
                        <td className="r">{money(a.base.totalOutflow)}</td>
                        <td className="r">{money(a.tenure.schedule.totalOutflow)}</td>
                        <td className="r">{money(a.emi.schedule.totalOutflow)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Section>

              <Assumptions
                items={[
                  'Rate stays constant. Each prepayment is applied just before the next EMI.',
                  'Option B recalculates the EMI after each prepayment so the loan still ends on the original date.',
                  'No prepayment charges included. RBI rules bar them on floating-rate loans to individuals for non-business use (from 1 Jan 2026); fixed-rate loans may carry them.',
                  'Effective return is the annualised internal rate of return of the prepayment against the EMIs you no longer pay.',
                ]}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
