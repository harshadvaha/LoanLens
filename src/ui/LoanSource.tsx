import { useEffect, useState } from 'react'
import { emi as calcEmi, tenureFor } from '../core/amortize'
import { compact, duration, loanType, money } from '../locale'
import type { LoanTypeId } from '../locale/types'
import { getStore, loanEmi, saveLoan, useStore, type Loan } from '../store/loans'
import { href, useRoute } from './router'
import { DecimalInput, MoneyInput, RANGES, TenureInput } from './inputs'

export interface Basics {
  principal: number
  rate: number
  months: number
  emi: number
  type: LoanTypeId
  startDate?: string
  name?: string
  foreclosureChargePct: number
  rateType: 'floating' | 'fixed'
}

const DEFAULT: Basics = { principal: 3_000_000, rate: 8.5, months: 180, emi: calcEmi(3_000_000, 8.5, 180), type: 'home', foreclosureChargePct: 0, rateType: 'floating' }

function fromLoan(l: Loan): Basics {
  return {
    principal: l.principal,
    rate: l.rate,
    months: l.months,
    emi: loanEmi(l),
    type: l.type,
    startDate: undefined,
    name: l.name,
    foreclosureChargePct: l.foreclosureChargePct,
    rateType: l.rateType,
  }
}

/**
 * Lets any tool start from a saved loan (no re-entry) or from manual numbers.
 * Reads ?loan=<id> from the URL. Editing numbers detaches from the saved loan
 * unless the user chooses to update it.
 */
export function useLoanSource(kindFilter?: Loan['kind']) {
  const route = useRoute()
  const { loans } = useStore()
  const pool = loans.filter((l) => !kindFilter || l.kind === kindFilter)
  const initialId = route.query.get('loan') ?? undefined
  const [loanId, setLoanId] = useState<string | undefined>(() => (initialId && pool.some((l) => l.id === initialId) ? initialId : pool.find((l) => l.kind === 'existing')?.id))
  const [b, setB] = useState<Basics>(() => {
    const l = getStore().loans.find((x) => x.id === loanId)
    return l ? fromLoan(l) : DEFAULT
  })
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    const id = route.query.get('loan')
    if (id && id !== loanId) {
      const l = getStore().loans.find((x) => x.id === id)
      if (l) {
        setLoanId(id)
        setB(fromLoan(l))
        setDirty(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.query.get('loan')])

  const pick = (id: string | undefined) => {
    setLoanId(id)
    setDirty(false)
    const l = loans.find((x) => x.id === id)
    if (l) setB(fromLoan(l))
  }
  const update = (p: Partial<Basics>) => {
    setB((prev) => {
      const next = { ...prev, ...p }
      // Keep EMI consistent when the user changes the drivers and hasn't set EMI explicitly.
      if (('principal' in p || 'rate' in p || 'months' in p) && !('emi' in p)) next.emi = calcEmi(next.principal, next.rate, next.months)
      return next
    })
    setDirty(true)
  }
  const saved = loans.find((l) => l.id === loanId)

  const impliedMonths = tenureFor(b.principal, b.rate, b.emi)
  const ui = (
    <div className="stack">
      {pool.length > 0 && (
        <div className="stack-s">
          <span className="field-label">Start from</span>
          <div className="chips" role="group" aria-label="Choose a saved loan">
            {pool.map((l) => (
              <button key={l.id} type="button" className="chip" aria-pressed={loanId === l.id} onClick={() => pick(l.id)}>
                {l.name}
              </button>
            ))}
            <button type="button" className="chip" aria-pressed={!loanId} onClick={() => pick(undefined)}>
              Enter numbers
            </button>
          </div>
        </div>
      )}
      <MoneyInput label="Outstanding principal" value={b.principal} onChange={(v) => update({ principal: v })} required range={RANGES.outstanding} />
      <DecimalInput label="Current interest rate" value={b.rate} onChange={(v) => update({ rate: v })} hint="Per year" max={40} step={0.05} range={RANGES.rate} />
      <TenureInput label="Remaining tenure" months={b.months} onChange={(v) => update({ months: v })} />
      <MoneyInput
        label="Current EMI"
        value={b.emi}
        onChange={(v) => update({ emi: v })}
        range={RANGES.emi}
        hint={
          b.emi > 0 && Number.isFinite(impliedMonths) && Math.abs(impliedMonths - b.months) > 2
            ? `At this EMI the loan runs ${duration(impliedMonths)}, not ${duration(b.months)}. We use your EMI.`
            : b.emi > 0 && !Number.isFinite(impliedMonths)
              ? 'This EMI does not cover the interest. Check the numbers.'
              : `Computed EMI for these numbers: ${money(calcEmi(b.principal, b.rate, b.months))}`
        }
      />
      {saved && dirty && (
        <div className="callout small row between">
          <span>Edited from “{saved.name}”.</span>
          <span className="row" style={{ gap: 6 }}>
            <button
              type="button"
              className="btn btn-s"
              onClick={() => {
                saveLoan({ ...saved, principal: b.principal, rate: b.rate, months: b.months, emi: b.emi })
                setDirty(false)
              }}
            >
              Update saved loan
            </button>
            <button type="button" className="btn btn-s btn-ghost" onClick={() => pick(saved.id)}>
              Reset
            </button>
          </span>
        </div>
      )}
      {!pool.length && (
        <p className="tiny muted">
          Tip: <a href={href('/loans/new')}>save your loan once</a> and every tool will start from it.
        </p>
      )}
    </div>
  )
  return { basics: b, update, ui, saved, label: saved && !dirty ? saved.name : `${loanType(b.type).short} loan · ${compact(b.principal)}` }
}
