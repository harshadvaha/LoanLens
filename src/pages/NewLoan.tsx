import { useMemo, useState } from 'react'
import { byYear, rateFor } from '../core/amortize'
import { trueCost } from '../core/cost'
import { rateSensitivity } from '../core/scenarios'
import { loanInsights } from '../insights'
import { compact, duration, locale, loanType, money, monthLabel, pct } from '../locale'
import type { LoanTypeId } from '../locale/types'
import { getStore, newId, saveLoan, type Loan } from '../store/loans'
import { Assumptions, CostBar, Insight, PageHead, Section, Stat } from '../ui/bits'
import { YearBars } from '../ui/charts'
import { Chips, DecimalInput, FeeInput, MoneyInput, Segmented, TenureInput, TextInput } from '../ui/inputs'
import { href, navigate, useRoute } from '../ui/router'
import { ScheduleTable } from '../ui/Schedule'

type Basis = 'reducing' | 'monthly' | 'flat'

interface Form {
  type: LoanTypeId
  amount: number
  rate: number
  basis: Basis
  months: number
  rateType: 'floating' | 'fixed'
  startDate: string
  fee: number
  feeIsPct: boolean
  other: number
  insurance: number
  down: number
  balloon: number
}

const today = () => new Date().toISOString().slice(0, 10)

function initial(id: string | null): { form: Form; from?: Loan } {
  const l = id ? getStore().loans.find((x) => x.id === id) : undefined
  if (l)
    return {
      from: l,
      form: {
        type: l.type,
        amount: l.originalAmount ?? l.principal,
        rate: l.originalRate ?? l.rate,
        basis: 'reducing',
        months: l.originalMonths ?? l.months,
        rateType: l.rateType,
        startDate: l.startDate ?? today(),
        fee: l.charges.processingFee,
        feeIsPct: l.charges.processingFeeIsPct,
        other: l.charges.otherCharges,
        insurance: l.charges.insurance,
        down: 0,
        balloon: l.balloon ?? 0,
      },
    }
  const t = loanType('home')
  return {
    form: {
      type: 'home',
      amount: t.defaultAmount,
      rate: t.defaultRate,
      basis: 'reducing',
      months: t.defaultMonths,
      rateType: 'floating',
      startDate: today(),
      fee: 0.5,
      feeIsPct: true,
      other: 0,
      insurance: 0,
      down: 0,
      balloon: 0,
    },
  }
}

export default function NewLoan() {
  const route = useRoute()
  const [{ form: f0, from }] = useState(() => initial(route.query.get('loan')))
  const [f, setF] = useState<Form>(f0)
  const [name, setName] = useState(from?.name ?? '')
  const [saved, setSaved] = useState<string | null>(null)
  const set = (p: Partial<Form>) => {
    setF((x) => ({ ...x, ...p }))
    setSaved(null)
  }
  const lt = loanType(f.type)

  const effRate = useMemo(() => {
    if (f.basis === 'monthly') return f.rate * 12
    if (f.basis === 'flat') {
      const flatEmi = (f.amount * (1 + (f.rate / 100) * (f.months / 12))) / f.months
      return rateFor(f.amount, flatEmi, f.months)
    }
    return f.rate
  }, [f.basis, f.rate, f.amount, f.months])

  const valid = f.amount > 0 && f.months > 0 && f.months <= lt.maxYears * 12 && effRate >= 0 && effRate < 60 && f.balloon < f.amount
  const tc = useMemo(
    () =>
      valid
        ? trueCost(
            { principal: f.amount, annualRate: effRate, months: f.months, balloon: lt.hasBalloon ? f.balloon : 0 },
            { processingFee: f.fee, processingFeeIsPct: f.feeIsPct, otherCharges: f.other, insurance: f.insurance },
            locale.chargeTax.pct,
          )
        : null,
    [valid, f, effRate, lt.hasBalloon],
  )
  const years = useMemo(() => (tc ? byYear(tc.schedule.rows) : []), [tc])
  const sens = useMemo(() => (valid ? rateSensitivity(f.amount, f.months, Math.round(effRate * 100) / 100, [-0.5, -0.25, 0, 0.25, 0.5, 1]) : []), [valid, f.amount, f.months, effRate])

  const save = (kind: Loan['kind']) => {
    const id = from?.id ?? newId()
    const loan: Loan = {
      id,
      name: name.trim() || `${lt.label} ${kind === 'offer' ? 'offer' : ''}`.trim(),
      kind,
      type: f.type,
      principal: f.amount,
      rate: Math.round(effRate * 1000) / 1000,
      months: f.months,
      rateType: f.rateType,
      balloon: lt.hasBalloon && f.balloon ? f.balloon : undefined,
      charges: { processingFee: f.fee, processingFeeIsPct: f.feeIsPct, otherCharges: f.other, insurance: f.insurance },
      prepayChargePct: from?.prepayChargePct ?? 0,
      foreclosureChargePct: from?.foreclosureChargePct ?? 0,
      originalAmount: f.amount,
      originalRate: Math.round(effRate * 1000) / 1000,
      originalMonths: f.months,
      startDate: f.startDate,
      updatedAt: '',
    }
    saveLoan(loan)
    setSaved(id)
  }

  const s = tc?.schedule
  const charges = tc ? tc.upfront.total : 0

  return (
    <div>
      <PageHead eyebrow="New loan" title="See what this loan will actually cost" lede="EMI is only part of the story. This shows interest, charges and tax on charges together, so you can see the full cost of borrowing." />

      {s && (
        <div className="sticky-summary" aria-hidden="true">
          <span>
            <span className="tiny muted">EMI </span>
            <strong>{money(s.emi)}</strong>
          </span>
          <span>
            <span className="tiny muted">Interest </span>
            <strong className="interest-c">{compact(tc!.interest)}</strong>
          </span>
          <span>
            <span className="tiny muted">All-in </span>
            <strong>{pct(tc!.allInRate)}</strong>
          </span>
        </div>
      )}

      <div className="workbench" style={{ marginTop: 16 }}>
        <div className="controls stack">
          <div className="stack-s">
            <span className="field-label">Loan type</span>
            <Chips
              label="Loan type"
              value={f.type}
              options={locale.loanTypes.map((t) => ({ value: t.id, label: t.short }))}
              onChange={(type) => {
                const t = loanType(type)
                set({ type, amount: t.defaultAmount, rate: t.defaultRate, months: t.defaultMonths, balloon: 0, down: 0, rateType: type === 'home' || type === 'education' || type === 'lap' ? 'floating' : 'fixed' })
              }}
            />
            <span className="tiny muted">Defaults are example values, not quotes.</span>
          </div>
          <MoneyInput label="Loan amount" value={f.amount} onChange={(amount) => set({ amount })} required range={lt.amountRange} presets={lt.presets} />
          <DecimalInput
            label="Interest rate"
            value={f.rate}
            onChange={(rate) => set({ rate })}
            max={f.basis === 'monthly' ? 5 : 50}
            step={0.05}
            range={f.basis === 'monthly' ? [0.5, 3] : f.basis === 'flat' ? [3, 20] : lt.rateRange}
            suffix={f.basis === 'monthly' ? '% / month' : '% / year'}
            hint={
              f.basis === 'flat'
                ? `A flat ${pct(f.rate)} equals about ${pct(effRate)} on a reducing balance.`
                : f.basis === 'monthly'
                  ? `= ${pct(effRate)} per year.`
                  : undefined
            }
          />
          <div className="row" style={{ gap: 8 }}>
            <Segmented
              label="How the rate is quoted"
              value={f.basis}
              onChange={(basis) => set({ basis })}
              options={[
                { value: 'reducing', label: 'Reducing p.a.' },
                { value: 'flat', label: 'Flat p.a.' },
                { value: 'monthly', label: 'Per month' },
              ]}
            />
            <Segmented
              label="Rate type"
              value={f.rateType}
              onChange={(rateType) => set({ rateType })}
              options={[
                { value: 'floating', label: 'Floating' },
                { value: 'fixed', label: 'Fixed' },
              ]}
            />
          </div>
          <TenureInput label="Tenure" months={f.months} onChange={(months) => set({ months })} maxYears={lt.maxYears} />
          <FeeInput label="Processing fee" value={f.fee} isPct={f.feeIsPct} base={f.amount} onChange={(fee, feeIsPct) => set({ fee, feeIsPct })} hint={`${locale.chargeTax.label} at ${locale.chargeTax.pct}% is added automatically`} />
          <details className="disclosure">
            <summary>More charges and options</summary>
            <div className="stack" style={{ marginTop: 8 }}>
              <MoneyInput label="Legal, technical and other charges" value={f.other} onChange={(other) => set({ other })} range={[0, 200_000]} hint={`${locale.chargeTax.label} added`} />
              <MoneyInput label="Insurance or bundled products" value={f.insurance} onChange={(insurance) => set({ insurance })} range={[0, 500_000]} hint="Paid upfront; premium already includes its own tax" />
              {lt.hasDownPayment && <MoneyInput label="Down payment (your own money)" value={f.down} onChange={(down) => set({ down })} range={[0, Math.max(100_000, f.amount)]} hint={f.down ? `Price ${money(f.amount + f.down)} · you finance ${pct((f.amount / (f.amount + f.down)) * 100, 0)}` : 'Not part of the cost of borrowing'} />}
              {lt.hasBalloon && <MoneyInput label="Balloon / residual at the end" value={f.balloon} onChange={(balloon) => set({ balloon })} max={f.amount - 1} range={[0, Math.max(10_000, Math.round(f.amount * 0.6))]} hint="Lowers the EMI, but you owe this lump sum with the last EMI" />}
              <TextInput type="date" label="First EMI date (for dates in the schedule)" value={f.startDate} onChange={(startDate) => set({ startDate })} />
            </div>
          </details>
        </div>

        <div className="stack-l" aria-live="polite">
          {!tc || !s ? (
            <div className="callout warn">Enter a loan amount, a rate and a tenure within {lt.maxYears} years to see results.</div>
          ) : (
            <>
              <section className="stack" aria-label="Result">
                <div>
                  <div className="eyebrow">Monthly EMI</div>
                  <div className="num-xl">{money(s.emi)}</div>
                  <p className="muted small" style={{ marginTop: 6 }}>
                    for {duration(f.months)}
                    {f.startDate && f.startDate.length === 10 && ` · last EMI ${monthLabel(f.startDate, s.months - 1)}`}
                    {f.balloon > 0 && lt.hasBalloon && <> · plus {money(f.balloon)} balloon at the end</>}
                  </p>
                </div>
                <CostBar principal={f.amount} interest={tc.interest} charges={charges} />
                <div className="stats s3">
                  <Stat label="Total interest" value={<span className="interest-c">{money(tc.interest)}</span>} sub={`${pct(tc.interestPctOfPrincipal, 0)} of the amount borrowed`} />
                  <Stat label="Total repayment to lender" value={money(s.totalPayments)} sub="principal + interest" />
                  <Stat label="Upfront charges" value={money(charges)} sub={charges ? `incl. ${money(tc.upfront.taxOnCharges)} ${locale.chargeTax.label}` : 'none entered'} />
                  <Stat label="Cost of borrowing" value={money(tc.costOfBorrowing)} sub="interest + all charges" />
                  <Stat label="All-in annual rate" value={pct(tc.allInRate)} sub={`vs ${pct(effRate)} quoted · like APR`} />
                  <Stat label="Cost per month of the loan" value={money(tc.costOfBorrowing / s.months)} sub="cost of borrowing ÷ months" />
                </div>
              </section>

              {(() => {
                const ins = loanInsights(f.amount, effRate, f.months, s, charges)
                return ins.length ? (
                  <section className="stack-s" aria-label="What stands out">
                    {ins.map((t) => (
                      <Insight key={t} tone={t.startsWith('Paying') ? 'good' : 'neutral'}>
                        {t}
                      </Insight>
                    ))}
                  </section>
                ) : null
              })()}

              <Section title="True cost" sub="Every rupee that leaves your pocket because of this loan." id="true-cost">
                <table className="ledger">
                  <tbody>
                    <tr>
                      <td>
                        <span className="sw" style={{ background: 'var(--principal)' }} />
                        Amount borrowed (repaid as principal)
                      </td>
                      <td className="r">{money(f.amount)}</td>
                    </tr>
                    <tr>
                      <td>
                        <span className="sw" style={{ background: 'var(--interest)' }} />
                        Interest
                      </td>
                      <td className="r">{money(tc.interest)}</td>
                    </tr>
                    {tc.upfront.processing > 0 && (
                      <tr>
                        <td className="indent">Processing fee</td>
                        <td className="r">{money(tc.upfront.processing)}</td>
                      </tr>
                    )}
                    {tc.upfront.other > 0 && (
                      <tr>
                        <td className="indent">Legal, technical and other charges</td>
                        <td className="r">{money(tc.upfront.other)}</td>
                      </tr>
                    )}
                    {tc.upfront.taxOnCharges > 0 && (
                      <tr>
                        <td className="indent">
                          {locale.chargeTax.label} on charges ({locale.chargeTax.pct}%)
                        </td>
                        <td className="r">{money(tc.upfront.taxOnCharges)}</td>
                      </tr>
                    )}
                    {tc.upfront.insurance > 0 && (
                      <tr>
                        <td className="indent">Insurance / bundled products</td>
                        <td className="r">{money(tc.upfront.insurance)}</td>
                      </tr>
                    )}
                    <tr className="subtotal">
                      <td>Cost of borrowing</td>
                      <td className="r interest-c">{money(tc.costOfBorrowing)}</td>
                    </tr>
                    <tr className="total">
                      <td>Total paid because of the loan</td>
                      <td className="r">{money(tc.totalOutflow)}</td>
                    </tr>
                    {f.down > 0 && lt.hasDownPayment && (
                      <>
                        <tr>
                          <td className="indent">+ Down payment (your own money)</td>
                          <td className="r">{money(f.down)}</td>
                        </tr>
                        <tr className="total">
                          <td>Total money leaving your pocket</td>
                          <td className="r">{money(tc.totalOutflow + f.down)}</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
                <p className="small muted">
                  For every ₹1 you borrow, you pay back about <strong style={{ color: 'var(--ink)' }}>₹{(tc.totalOutflow / f.amount).toFixed(2)}</strong>.
                </p>
              </Section>

              <Section title="Where each year's EMIs go" sub="Early EMIs are mostly interest. Hover or tap a bar for exact numbers." id="years">
                <YearBars years={years} startDate={f.startDate.length === 10 ? f.startDate : undefined} />
                <div className="legend">
                  <span>
                    <i style={{ background: 'var(--principal)' }} />
                    Principal
                  </span>
                  <span>
                    <i style={{ background: 'var(--interest)' }} />
                    Interest
                  </span>
                </div>
              </Section>

              <Section title="If the rate changes" sub={f.rateType === 'floating' ? 'Floating rates move with the benchmark. Same amount and tenure:' : 'Useful when comparing quotes. Same amount and tenure:'} id="sens">
                <div className="panel-flush table-scroll">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Rate</th>
                        <th className="r">EMI</th>
                        <th className="r">Change</th>
                        <th className="r">Total interest</th>
                        <th className="r">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sens.map((r) => (
                        <tr key={r.rate} className={r.deltaEmi === 0 ? 'hl' : ''}>
                          <td>{pct(r.rate)}</td>
                          <td className="r">{money(r.emi)}</td>
                          <td className="r">{r.deltaEmi ? (r.deltaEmi > 0 ? '+' : '−') + money(Math.abs(r.deltaEmi)) : '—'}</td>
                          <td className="r">{compact(r.totalInterest)}</td>
                          <td className="r">{r.deltaInterest ? (r.deltaInterest > 0 ? '+' : '−') + compact(Math.abs(r.deltaInterest)) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <a className="small" href={href('/rates', { tab: 'understand', rate: effRate.toFixed(2), amount: f.amount, months: f.months })}>
                  Understand this rate in detail →
                </a>
              </Section>

              <Section title="Repayment schedule" id="schedule">
                <ScheduleTable s={s} startDate={f.startDate.length === 10 ? f.startDate : undefined} filename={`${lt.id}-loan-schedule`} />
              </Section>

              <Section title="Keep this" sub="Saved in this browser only." id="save">
                <div className="stack" style={{ maxWidth: 520 }}>
                  <TextInput label="Name" value={name} onChange={setName} placeholder={`e.g. “${lt.short === 'Home' ? 'SBI offer' : 'Bank A offer'}” or “My ${lt.short.toLowerCase()} loan”`} />
                  <div className="row">
                    <button className="btn btn-primary" type="button" onClick={() => save('offer')}>
                      Save as an offer
                    </button>
                    <button className="btn" type="button" onClick={() => save('existing')}>
                      Save as my loan
                    </button>
                  </div>
                  {saved && (
                    <div className="callout good small row between fade-in" role="status">
                      <span>Saved.</span>
                      <span className="row" style={{ gap: 8 }}>
                        <button className="btn btn-s" type="button" onClick={() => navigate('/compare')}>
                          Compare offers
                        </button>
                        <button className="btn btn-s" type="button" onClick={() => navigate('/optimize', { loan: saved })}>
                          Optimise
                        </button>
                      </span>
                    </div>
                  )}
                </div>
              </Section>

              <Assumptions
                items={[
                  'Reducing-balance interest, compounded monthly (annual rate ÷ 12). This is how Indian banks and HFCs compute EMI loans.',
                  'EMI is rounded up to the next rupee; the final EMI is smaller to close the loan exactly.',
                  `${locale.chargeTax.label} at ${locale.chargeTax.pct}% is applied to processing and other lender charges, not to insurance premiums.`,
                  'The rate stays the same for the whole tenure. Floating rates will change; see “If the rate changes”.',
                  'All-in annual rate is the internal rate of return of the cash you receive (amount minus upfront charges) against the EMIs you pay, × 12. Lenders call a similar figure APR in the Key Facts Statement; their method may differ slightly.',
                  f.basis === 'flat' ? 'A flat rate charges interest on the original amount for the whole tenure. It has been converted to the reducing-balance rate with the same EMI.' : '',
                ].filter(Boolean)}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
