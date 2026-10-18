import { useMemo, useRef, useState } from 'react'
import { emi as calcEmi, schedule, tenureFor } from '../core/amortize'
import { loanHealth } from '../insights'
import { compact, duration, fmtDate, locale, loanType, money, monthLabel, monthsBetween, pct } from '../locale'
import type { LoanTypeId } from '../locale/types'
import { currentBenchmark, deleteLoan, exportJson, getStore, importJson, loanEmi, loanSchedule, newId, saveLoan, useStore, type Loan } from '../store/loans'
import { Arrow, Badge, CostBar, Empty, Insight, PageHead, Section, Stat } from '../ui/bits'
import { BalanceChart } from '../ui/charts'
import { DecimalInput, FeeInput, MoneyInput, Segmented, Select, TenureInput, TextInput } from '../ui/inputs'
import { href, navigate } from '../ui/router'
import { ScheduleTable } from '../ui/Schedule'
import { LoanCard } from './Home'

/* ------------------------------------------------------------------ */

export function MyLoans() {
  const { loans } = useStore()
  const existing = loans.filter((l) => l.kind === 'existing')
  const offers = loans.filter((l) => l.kind === 'offer')
  const totalOut = existing.reduce((s, l) => s + l.principal, 0)
  const totalEmi = existing.reduce((s, l) => s + loanEmi(l), 0)
  const totalInt = existing.reduce((s, l) => s + loanSchedule(l).totalInterest, 0)
  return (
    <div className="stack-l">
      <PageHead eyebrow="My loans" title="Your loans and saved offers" lede="Saved only in this browser. Enter a loan once; every tool can use it.">
        <div className="row" style={{ marginTop: 14 }}>
          <a className="btn btn-primary" href={href('/loans/new')}>
            Add an existing loan
          </a>
          <a className="btn" href={href('/new')}>
            Calculate a new offer
          </a>
        </div>
      </PageHead>

      {existing.length > 1 && (
        <div className="stats s3">
          <Stat label="Total outstanding" value={compact(totalOut)} />
          <Stat label="Total EMIs" value={money(totalEmi)} sub="per month" />
          <Stat label="Interest still to pay" value={<span className="interest-c">{compact(totalInt)}</span>} sub="if nothing changes" />
        </div>
      )}

      <section className="stack">
        <h2 className="h2">Existing loans</h2>
        {existing.length ? (
          <div className="cards">
            {existing.map((l) => (
              <LoanCard key={l.id} l={l} />
            ))}
          </div>
        ) : (
          <Empty title="No loans saved yet" action={<a className="btn btn-s" href={href('/loans/new')}>Add your loan</a>}>
            Add the outstanding amount, rate and EMI from your latest statement. It takes a minute and unlocks the optimiser, prepayment and refinancing tools with your
            numbers.
          </Empty>
        )}
      </section>

      <section className="stack">
        <h2 className="h2">Saved offers</h2>
        {offers.length ? (
          <div className="cards">
            {offers.map((l) => (
              <LoanCard key={l.id} l={l} />
            ))}
          </div>
        ) : (
          <Empty title="No offers saved">
            Use <a href={href('/new')}>New loan</a> and choose “Save as an offer” to compare them later by total cost.
          </Empty>
        )}
      </section>

      <Backup />
    </div>
  )
}

function Backup() {
  const { loans } = useStore()
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  return (
    <Section title="Back up your data" sub="Your loans live in this browser only. Export a file to keep a copy or move to another device." id="backup">
      <div className="row">
        <button
          className="btn"
          type="button"
          disabled={!loans.length}
          onClick={() => {
            const blob = new Blob([exportJson()], { type: 'application/json' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = `loanlens-backup-${new Date().toISOString().slice(0, 10)}.json`
            a.click()
            URL.revokeObjectURL(a.href)
          }}
        >
          Export JSON
        </button>
        <button className="btn" type="button" onClick={() => file.current?.click()}>
          Import JSON
        </button>
        <Segmented
          label="Import mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'merge', label: 'Add to existing' },
            { value: 'replace', label: 'Replace all' },
          ]}
        />
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Choose a backup file"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            try {
              const r = importJson(await f.text(), mode)
              setMsg({ tone: 'good', text: `Imported ${r.added} loan${r.added === 1 ? '' : 's'}.` })
            } catch (err) {
              setMsg({ tone: 'bad', text: err instanceof Error ? err.message : 'Could not read that file.' })
            }
          }}
        />
      </div>
      {msg && (
        <div className={`callout ${msg.tone} small`} role="status">
          {msg.text}
        </div>
      )}
    </Section>
  )
}

/* ------------------------------------------------------------------ */

const BLANK = (): Loan => ({
  id: newId(),
  name: '',
  kind: 'existing',
  type: 'home',
  principal: 0,
  rate: 8.5,
  months: 0,
  emi: undefined,
  rateType: 'floating',
  benchmark: 'repo',
  spread: undefined,
  resetMonths: 3,
  charges: { processingFee: 0, processingFeeIsPct: false, otherCharges: 0, insurance: 0 },
  prepayChargePct: 0,
  foreclosureChargePct: 0,
  updatedAt: '',
})

export function LoanForm({ id }: { id?: string }) {
  const existing = id ? getStore().loans.find((l) => l.id === id) : undefined
  const [l, setL] = useState<Loan>(existing ?? BLANK())
  const [touched, setTouched] = useState(false)
  const set = (p: Partial<Loan>) => setL((x) => ({ ...x, ...p }))
  const lt = loanType(l.type)
  const emiTerm = l.emi && l.principal ? tenureFor(l.principal, l.rate, l.emi) : NaN
  const elapsed = l.startDate && /^\d{4}-\d{2}-\d{2}$/.test(l.startDate) ? monthsBetween(l.startDate) : null
  const suggestedRemaining = l.originalMonths && elapsed !== null ? Math.max(1, l.originalMonths - elapsed) : null
  const canSave = l.principal > 0 && l.rate >= 0 && (l.months > 0 || (l.emi ?? 0) > 0)
  const isOffer = l.kind === 'offer'

  const submit = () => {
    setTouched(true)
    if (!canSave) return
    let months = l.months
    if (!months && l.emi) months = Number.isFinite(emiTerm) ? emiTerm : 360
    saveLoan({ ...l, months, name: l.name.trim() || `My ${lt.label.toLowerCase()}` })
    navigate(`/loans/${l.id}`)
  }

  return (
    <div style={{ maxWidth: 720 }} className="stack-l">
      <PageHead eyebrow={existing ? 'Edit loan' : 'Add a loan'} title={existing ? existing.name : 'Add your existing loan'} lede="Your latest loan statement or the lender's app shows the outstanding principal, rate and EMI. Only the first section is required." />

      <section className="stack">
        <div className="grid-2">
          <TextInput label="Name" value={l.name} onChange={(name) => set({ name })} placeholder={`My ${lt.label.toLowerCase()}`} />
          <Select label="Loan type" value={l.type} onChange={(type: LoanTypeId) => set({ type })} options={locale.loanTypes.map((t) => ({ value: t.id, label: t.label }))} />
        </div>
        <Segmented
          label="Kind"
          value={l.kind}
          onChange={(kind) => set({ kind })}
          options={[
            { value: 'existing', label: 'A loan I have' },
            { value: 'offer', label: 'An offer I’m considering' },
          ]}
        />
        <MoneyInput label={isOffer ? 'Loan amount' : 'Outstanding principal today'} value={l.principal} onChange={(principal) => set({ principal })} required={touched} />
        <div className="grid-2">
          <DecimalInput label={isOffer ? 'Interest rate' : 'Current interest rate'} value={l.rate} onChange={(rate) => set({ rate })} max={40} step={0.05} hint="Per year" />
          <MoneyInput
            label={isOffer ? 'EMI (optional)' : 'Current EMI'}
            value={l.emi ?? 0}
            onChange={(v) => set({ emi: v || undefined })}
            hint={l.emi && Number.isFinite(emiTerm) ? `Implies ${duration(emiTerm)} remaining` : l.emi ? 'Does not cover interest at this rate' : 'From your statement'}
          />
        </div>
        {!isOffer && (
          <DecimalInput
            label="Best rate you've been quoted elsewhere (optional)"
            value={l.bestQuote ?? 0}
            onChange={(v) => set({ bestQuote: v || undefined })}
            max={40}
            step={0.05}
            hint="From another lender or your bank's current rate for new customers. Used to rate your loan's health."
          />
        )}
        <TenureInput
          label={isOffer ? 'Tenure' : 'Remaining tenure'}
          months={l.months}
          onChange={(months) => set({ months })}
          hint={
            l.emi && Number.isFinite(emiTerm) && emiTerm !== l.months ? (
              <button type="button" className="link-btn" onClick={() => set({ months: emiTerm })}>
                Use {duration(emiTerm)} (from your EMI)
              </button>
            ) : suggestedRemaining && suggestedRemaining !== l.months ? (
              <button type="button" className="link-btn" onClick={() => set({ months: suggestedRemaining })}>
                Use {duration(suggestedRemaining)} (from start date)
              </button>
            ) : (
              'If you know your EMI instead, enter that and we can work this out.'
            )
          }
        />
        {touched && !canSave && <div className="callout bad small">Enter the outstanding principal, a rate, and either the remaining tenure or the EMI.</div>}
      </section>

      <details className="disclosure section" open={!!existing?.spread || l.rateType === 'floating'}>
        <summary>Rate details</summary>
        <div className="stack" style={{ marginTop: 10 }}>
          <Segmented
            label="Rate type"
            value={l.rateType}
            onChange={(rateType) => set({ rateType })}
            options={[
              { value: 'floating', label: 'Floating' },
              { value: 'fixed', label: 'Fixed' },
            ]}
          />
          {l.rateType === 'floating' && (
            <>
              <div className="grid-2">
                <Select
                  label="Benchmark"
                  value={(l.benchmark ?? 'repo') as string}
                  onChange={(benchmark) => set({ benchmark })}
                  options={[
                    { value: 'repo', label: 'Repo rate (EBLR / RLLR)' },
                    { value: 'mclr', label: 'MCLR' },
                    { value: 'other', label: 'Other / not sure' },
                  ]}
                />
                <DecimalInput label="Spread over benchmark" value={l.spread ?? 0} onChange={(spread) => set({ spread: spread || undefined })} max={15} step={0.05} hint="From your sanction letter or KFS" />
              </div>
              <div className="grid-2">
                <Select
                  label="Rate resets every"
                  value={String(l.resetMonths ?? 3)}
                  onChange={(v) => set({ resetMonths: Number(v) })}
                  options={[
                    { value: '1', label: 'Month' },
                    { value: '3', label: '3 months' },
                    { value: '6', label: '6 months' },
                    { value: '12', label: '12 months' },
                  ]}
                />
                <TextInput label="Next reset (if known)" value={l.nextReset ?? ''} onChange={(nextReset) => set({ nextReset })} placeholder="yyyy-mm-dd" />
              </div>
            </>
          )}
        </div>
      </details>

      <details className="disclosure section" open={!!existing?.foreclosureChargePct}>
        <summary>Charges</summary>
        <div className="stack" style={{ marginTop: 10 }}>
          <div className="grid-2">
            <DecimalInput label="Prepayment charge" value={l.prepayChargePct} onChange={(prepayChargePct) => set({ prepayChargePct })} max={10} suffix="% of amount" />
            <DecimalInput label="Foreclosure charge" value={l.foreclosureChargePct} onChange={(foreclosureChargePct) => set({ foreclosureChargePct })} max={10} suffix="% of balance" />
          </div>
          {l.rateType === 'floating' && l.type !== 'business' && (
            <p className="tiny muted">For floating-rate loans to individuals for non-business purposes, RBI rules from 1 Jan 2026 bar prepayment charges. See Learn → Rules.</p>
          )}
          <FeeInput
            label="Processing fee paid"
            value={l.charges.processingFee}
            isPct={l.charges.processingFeeIsPct}
            base={l.originalAmount ?? l.principal}
            onChange={(processingFee, processingFeeIsPct) => set({ charges: { ...l.charges, processingFee, processingFeeIsPct } })}
          />
          <div className="grid-2">
            <MoneyInput label="Other charges" value={l.charges.otherCharges} onChange={(otherCharges) => set({ charges: { ...l.charges, otherCharges } })} />
            <MoneyInput label="Insurance" value={l.charges.insurance} onChange={(insurance) => set({ charges: { ...l.charges, insurance } })} />
          </div>
        </div>
      </details>

      {!isOffer && (
        <details className="disclosure section" open={!!existing?.originalAmount}>
          <summary>Loan history (optional — for “already paid” figures)</summary>
          <div className="stack" style={{ marginTop: 10 }}>
            <div className="grid-2">
              <MoneyInput label="Original loan amount" value={l.originalAmount ?? 0} onChange={(v) => set({ originalAmount: v || undefined })} />
              <DecimalInput label="Original rate" value={l.originalRate ?? 0} onChange={(v) => set({ originalRate: v || undefined })} max={40} />
            </div>
            <div className="grid-2">
              <TenureInput label="Original tenure" months={l.originalMonths ?? 0} onChange={(v) => set({ originalMonths: v || undefined })} />
              <TextInput label="First EMI date" value={l.startDate ?? ''} onChange={(startDate) => set({ startDate: startDate || undefined })} placeholder="yyyy-mm-dd" hint={elapsed !== null ? `${duration(elapsed)} ago` : undefined} />
            </div>
          </div>
        </details>
      )}

      <div className="row">
        <button className="btn btn-primary" type="button" onClick={submit}>
          {existing ? 'Save changes' : 'Save loan'}
        </button>
        <a className="btn btn-ghost" href={href(existing ? `/loans/${existing.id}` : '/loans')}>
          Cancel
        </a>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

export function LoanDetail({ id }: { id: string }) {
  const store = useStore()
  const { loans } = store
  const l = loans.find((x) => x.id === id)
  const s = useMemo(() => (l ? loanSchedule(l) : null), [l])
  const [confirmDel, setConfirmDel] = useState(false)
  if (!l || !s)
    return (
      <Empty title="Loan not found" action={<a className="btn btn-s" href={href('/loans')}>Back to my loans</a>}>
        It may have been deleted, or saved in a different browser.
      </Empty>
    )
  const h = loanHealth(l)
  const e = loanEmi(l)
  const next12 = s.rows.slice(0, 12)
  const n12i = next12.reduce((a, r) => a + r.interest, 0)
  const n12p = next12.reduce((a, r) => a + r.payment, 0)
  const startForDates = new Date().toISOString().slice(0, 10)
  const q = { loan: l.id }

  // History estimates
  const elapsed = l.startDate && /^\d{4}-\d{2}-\d{2}$/.test(l.startDate) ? Math.max(0, monthsBetween(l.startDate) + 1) : null
  const history =
    l.originalAmount && elapsed !== null && l.kind === 'existing'
      ? (() => {
          const origEmi = calcEmi(l.originalAmount, l.originalRate ?? l.rate, l.originalMonths ?? l.months + elapsed)
          const principalPaid = Math.max(0, l.originalAmount - l.principal)
          const paid = origEmi * elapsed
          return { principalPaid, paid, interestPaid: Math.max(0, paid - principalPaid), origEmi }
        })()
      : null

  // Benchmark consistency
  const b = currentBenchmark(store)
  const linked = l.rateType === 'floating' && l.benchmark === 'repo' && l.spread !== undefined
  const implied = linked ? Math.round((b.value + (l.spread ?? 0)) * 100) / 100 : null
  const impliedEmi = implied && Math.abs(implied - l.rate) >= 0.05 ? calcEmi(l.principal, implied, s.months) : null
  const impliedTenure = implied && Math.abs(implied - l.rate) >= 0.05 ? tenureFor(l.principal, implied, e) : null

  return (
    <div className="stack-l">
      <PageHead eyebrow={`${loanType(l.type).label} · ${l.kind === 'offer' ? 'offer' : 'existing loan'}`} title={l.name}>
        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          <a className="btn btn-s" href={href(`/loans/${l.id}/edit`)}>
            Edit
          </a>
          {confirmDel ? (
            <>
              <button
                className="btn btn-s btn-danger"
                type="button"
                onClick={() => {
                  deleteLoan(l.id)
                  navigate('/loans')
                }}
              >
                Confirm delete
              </button>
              <button className="btn btn-s btn-ghost" type="button" onClick={() => setConfirmDel(false)}>
                Keep
              </button>
            </>
          ) : (
            <button className="btn btn-s btn-ghost btn-danger" type="button" onClick={() => setConfirmDel(true)}>
              Delete
            </button>
          )}
        </div>
      </PageHead>

      <section className="stack">
        <div className="row" style={{ gap: 28, alignItems: 'flex-end' }}>
          <div>
            <div className="eyebrow">Interest still to pay</div>
            <div className="num-xl interest-c">{compact(s.totalInterest)}</div>
          </div>
          <p className="small muted" style={{ maxWidth: 360 }}>
            on {money(l.principal)} outstanding at {pct(l.rate)}, if nothing changes. Last EMI around <strong style={{ color: 'var(--ink)' }}>{monthLabel(startForDates, s.months - 1)}</strong>.
          </p>
        </div>
        <CostBar principal={l.principal} interest={s.totalInterest} />
        <div className="stats s4">
          <Stat label="Outstanding" value={money(l.principal)} />
          <Stat label="EMI" value={money(e)} sub={l.emi ? 'as entered' : 'computed'} />
          <Stat label="Time remaining" value={duration(s.months)} />
          <Stat label="Total still to pay" value={money(s.totalOutflow)} sub="principal + interest" />
        </div>
      </section>

      {l.kind === 'existing' && (
        <section className="panel stack" aria-labelledby="health">
          <div className="row between">
            <h2 className="h3" id="health">
              Loan health
            </h2>
            <Badge tone={h.tone}>{h.status}</Badge>
          </div>
          <div className="stack-s">
            {h.reasons.map((r) => (
              <p key={r} className="small">
                {r}
              </p>
            ))}
          </div>
        </section>
      )}

      <section className="stack-s">
        <Insight tone={n12i / n12p > 0.5 ? 'neutral' : 'good'}>
          Of your next 12 EMIs ({money(n12p)}), <strong className="interest-c">{money(n12i)}</strong> ({pct((n12i / n12p) * 100, 0)}) is interest and only {money(n12p - n12i)} reduces
          the loan.
        </Insight>
        {impliedEmi && implied && (
          <Insight tone="watch">
            Your rate ({pct(l.rate)}) differs from repo ({pct(b.value)}) + your spread ({pct(l.spread ?? 0)}) = {pct(implied)}. If the lender moves you to {pct(implied)} at the next reset,
            EMI would be about {money(impliedEmi)} for the same tenure
            {impliedTenure && Number.isFinite(impliedTenure) ? `, or the tenure would become ${duration(impliedTenure)} at the same EMI` : ''}.
          </Insight>
        )}
        {Number.isFinite(tenureFor(l.principal, l.rate, e)) && Math.abs(tenureFor(l.principal, l.rate, e) - l.months) > 2 && (
          <Insight tone="watch">
            Your EMI pays off this balance in {duration(tenureFor(l.principal, l.rate, e))}, but you entered {duration(l.months)} remaining. Lenders often extend tenure after rate rises —
            check your latest statement.
          </Insight>
        )}
      </section>

      <section aria-labelledby="next" className="stack">
        <h2 className="h2" id="next">
          What would you like to do?
        </h2>
        <nav className="intent-list">
          {[
            { to: href('/optimize', q), t: 'Find the best way to pay less interest', s: 'Prepay, raise EMI, or step up yearly — side by side' },
            { to: href('/prepay', q), t: 'Plan a prepayment', s: 'Reduce EMI or tenure, one or many payments' },
            { to: href('/refinance', q), t: 'Check a balance transfer', s: 'Savings after costs and break-even' },
            { to: href('/tools/rate-rise', q), t: 'My rate went up', s: 'Higher EMI vs longer tenure vs prepay' },
            { to: href('/tools/stress', q), t: 'Stress-test this loan', s: 'Rate rises, income drops, big expenses' },
            { to: href('/tools/foreclosure', q), t: 'Should I close it early?', s: 'Net benefit and what it does to your cash' },
          ].map((a) => (
            <a key={a.t} className="intent" href={a.to}>
              <span>
                {a.t}
                <small>{a.s}</small>
              </span>
              <Arrow />
            </a>
          ))}
        </nav>
      </section>

      {history && (
        <Section title="So far" sub="Estimated from your original loan details." id="history">
          <div className="stats s3">
            <Stat label="Principal repaid" value={money(history.principalPaid)} sub={`${pct((history.principalPaid / l.originalAmount!) * 100, 0)} of ${compact(l.originalAmount!)}`} />
            <Stat label="EMIs paid (estimate)" value={money(history.paid)} sub={`${elapsed} × ${money(history.origEmi)}`} />
            <Stat label="Interest paid (estimate)" value={<span className="interest-c">{money(history.interestPaid)}</span>} />
          </div>
          <p className="tiny muted">
            Estimate assumes the original EMI every month. Rate changes, prepayments or tenure changes since {l.startDate ? fmtDate(l.startDate) : 'the start'} will make the real figure
            differ. Your lender’s interest certificate has the exact number.
          </p>
        </Section>
      )}

      <Section title="Balance from today" id="balance">
        <BalanceChart title="Outstanding balance from today" startDate={startForDates} series={[{ label: 'Outstanding', color: 'var(--principal)', values: [l.principal, ...s.rows.map((r) => r.closing)] }]} />
      </Section>

      <Section title="Repayment schedule from today" id="schedule">
        <ScheduleTable s={s} startDate={startForDates} filename={l.name.replace(/\s+/g, '-').toLowerCase()} />
      </Section>
    </div>
  )
}

/** Re-exported for tests or tools that need a quick projection. */
export function projection(l: Loan) {
  return schedule({ principal: l.principal, annualRate: l.rate, months: l.months, emi: loanEmi(l) })
}
