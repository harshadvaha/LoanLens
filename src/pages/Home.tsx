import { useState } from 'react'
import { compact, duration, fmtDate, loanType, money, pct } from '../locale'
import { currentBenchmark, loanEmi, loanSchedule, setBenchmarkOverride, useStore, type Loan } from '../store/loans'
import { DecimalInput } from '../ui/inputs'
import { Arrow, Badge, CostBar, Source } from '../ui/bits'
import { href } from '../ui/router'
import { loanHealth } from '../insights'

const INTENTS = [
  { label: 'Calculate a new loan', sub: 'EMI, total interest, true cost and schedule', to: '/new' },
  { label: 'Check my existing loan', sub: 'What is left to pay, and how healthy the rate is', to: '/loans' },
  { label: 'Compare offers', sub: 'Ranked by total cost, not headline rate', to: '/compare' },
  { label: 'Reduce my interest', sub: 'Prepayments, higher EMI, yearly step-ups', to: '/optimize' },
  { label: 'Know whether I should prepay', sub: 'Reduce EMI or tenure, and what it does to your cash', to: '/prepay' },
  { label: 'Understand an interest rate', sub: 'What a quoted rate means and how sensitive it is', to: '/rates?tab=understand' },
  { label: 'My rate went up — what now?', sub: 'Higher EMI, longer tenure, or prepay', to: '/tools/rate-rise' },
  { label: 'See whether refinancing is worthwhile', sub: 'Savings after switching costs, and break-even', to: '/refinance' },
  { label: 'How much can I safely borrow?', sub: 'Comfortable EMI, not the lender maximum', to: '/tools/affordability' },
  { label: 'What should I ask the lender?', sub: 'Questions for your loan type, plus red flags', to: '/tools/ask' },
]

export function LoanCard({ l }: { l: Loan }) {
  const s = loanSchedule(l)
  const h = l.kind === 'existing' ? loanHealth(l) : null
  const q = { loan: l.id }
  return (
    <article className="panel loan-card">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div>
          <a href={href(`/loans/${l.id}`)} className="h3" style={{ textDecoration: 'none' }}>
            {l.name}
          </a>
          <div className="tiny muted">
            {loanType(l.type).label} · {l.kind === 'offer' ? 'Offer' : 'Existing'} · {l.rateType}
          </div>
        </div>
        {h && <Badge tone={h.tone}>{h.status}</Badge>}
      </div>
      <div className="row" style={{ gap: 20, alignItems: 'baseline' }}>
        <div>
          <div className="num-l">{compact(l.principal)}</div>
          <div className="tiny muted">{l.kind === 'existing' ? 'outstanding' : 'to borrow'}</div>
        </div>
        <div className="small">
          <div>
            <strong>{pct(l.rate)}</strong> · {money(loanEmi(l))}/mo
          </div>
          <div className="muted">{duration(s.months)} remaining</div>
        </div>
      </div>
      <div>
        <div className="tiny muted" style={{ marginBottom: 4 }}>
          Estimated interest remaining <strong className="interest-c">{compact(s.totalInterest)}</strong>
        </div>
        <CostBar principal={l.principal} interest={s.totalInterest} thin showLegend={false} />
      </div>
      <div className="actions">
        <a className="btn btn-s" href={href(`/loans/${l.id}`)}>
          Analyse
        </a>
        <a className="btn btn-s" href={href('/prepay', q)}>
          Prepay
        </a>
        <a className="btn btn-s" href={href('/optimize', q)}>
          Optimise
        </a>
        {l.kind === 'existing' ? (
          <a className="btn btn-s" href={href('/refinance', q)}>
            Refinance
          </a>
        ) : (
          <a className="btn btn-s" href={href('/compare')}>
            Compare
          </a>
        )}
      </div>
    </article>
  )
}

export default function Home() {
  const { loans } = useStore()
  return (
    <div className="stack-l">
      <header className="page-head" style={{ marginBottom: 0 }}>
        <div className="eyebrow">Loan intelligence · India</div>
        <h1 className="page-title">See what a loan will actually cost — and how to pay less.</h1>
        <p className="lede">Calculate, compare and optimise with real amortisation maths. No sign-in, no lender ads, and nothing leaves your browser.</p>
      </header>

      {loans.length > 0 && (
        <section className="stack" aria-labelledby="yl">
          <div className="row between">
            <h2 className="h2" id="yl">
              Your loans
            </h2>
            <a href={href('/loans/new')} className="btn btn-s">
              Add a loan
            </a>
          </div>
          <div className="cards">
            {loans.slice(0, 4).map((l) => (
              <LoanCard key={l.id} l={l} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="iw">
        <h2 className="h2" id="iw" style={{ marginBottom: 10 }}>
          I want to…
        </h2>
        <nav className="intent-list" aria-labelledby="iw">
          {INTENTS.map((i) => {
            const [path, qs] = i.to.split('?')
            return (
              <a key={i.label} className="intent" href={`#${path}${qs ? '?' + qs : ''}`}>
                <span>
                  {i.label}
                  <small>{i.sub}</small>
                </span>
                <Arrow />
              </a>
            )
          })}
        </nav>
      </section>

      <BenchmarkCard />

      {loans.length === 0 && (
        <p className="small muted">
          Have a loan already? <a href={href('/loans/new')}>Save it once</a> and every tool — optimiser, prepayment, refinancing, stress test — starts from your
          numbers.
        </p>
      )}
    </div>
  )
}

/** The one externally-sourced number in the app. Users can correct it when RBI changes it. */
export function BenchmarkCard() {
  const store = useStore()
  const b = currentBenchmark(store)
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(b.value)
  const ageDays = Math.floor((Date.now() - new Date(b.asOf + 'T00:00:00').getTime()) / 864e5)
  return (
    <section className="panel stack-s" aria-labelledby="bm">
      <div className="row between">
        <h2 className="h3" id="bm">
          {b.name}: {pct(b.value)}
        </h2>
        {!b.overridden && b.change !== 0 ? (
          <Badge tone={b.change > 0 ? 'watch' : 'good'}>
            {b.change > 0 ? '+' : ''}
            {pct(b.change)} on {fmtDate(b.asOf)}
          </Badge>
        ) : (
          <Badge tone="neutral">{b.overridden ? 'Entered by you' : 'As of'} {fmtDate(b.asOf)}</Badge>
        )}
      </div>
      {!b.overridden && <p className="small muted">{b.note}</p>}
      {ageDays > 75 && (
        <p className="small" style={{ color: 'var(--watch)' }}>
          This value is {Math.floor(ageDays / 30)} months old. The RBI reviews the repo rate about every two months — check the latest and update it here.
        </p>
      )}
      {editing ? (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ maxWidth: 180 }}>
            <DecimalInput label="Current repo rate" value={v} onChange={setV} max={20} step={0.25} />
          </div>
          <button
            type="button"
            className="btn btn-primary btn-s"
            onClick={() => {
              setBenchmarkOverride({ value: v, asOf: new Date().toISOString().slice(0, 10) })
              setEditing(false)
            }}
          >
            Save
          </button>
          {b.overridden && (
            <button type="button" className="btn btn-ghost btn-s" onClick={() => (setBenchmarkOverride(undefined), setEditing(false))}>
              Reset to built-in
            </button>
          )}
        </div>
      ) : (
        <div className="row between">
          {b.overridden ? <span className="tiny muted">Used in floating-rate checks across the app.</span> : <Source label={b.source.label} url={b.source.url} />}
          <span className="row" style={{ gap: 14 }}>
            <button type="button" className="link-btn small" onClick={() => (setV(b.value), setEditing(true))}>
              Update
            </button>
            <a className="small" href={href('/tools/rate-rise')}>
              What a rate rise does →
            </a>
          </span>
        </div>
      )}
    </section>
  )
}
