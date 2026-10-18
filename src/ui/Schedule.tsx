import { Fragment, useMemo, useState } from 'react'
import { byYear, type ScheduleResult } from '../core/amortize'
import { money, monthLabel } from '../locale'
import { Segmented } from './inputs'

export function ScheduleTable({ s, startDate, filename = 'repayment-schedule' }: { s: ScheduleResult; startDate?: string; filename?: string }) {
  const [view, setView] = useState<'year' | 'month'>('year')
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [showAll, setShowAll] = useState(false)
  const years = useMemo(() => byYear(s.rows), [s])
  const hasPre = s.totalPrepayments > 0
  const rowsShown = view === 'month' && !showAll ? s.rows.slice(0, 36) : s.rows
  const when = (m: number) => (startDate ? monthLabel(startDate, m - 1) : `#${m}`)

  const csv = () => {
    const head = ['Month', 'Date', 'Opening', 'Prepayment', 'EMI', 'Principal', 'Interest', 'Closing', 'Rate %']
    const body = s.rows.map((r) => [r.month, startDate ? monthLabel(startDate, r.month - 1) : '', r.opening, r.prepayment, r.payment, r.principal, r.interest, r.closing, r.rate].join(','))
    const blob = new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${filename}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="stack">
      <div className="row between">
        <Segmented
          label="Schedule view"
          value={view}
          onChange={setView}
          options={[
            { value: 'year', label: 'By year' },
            { value: 'month', label: 'By month' },
          ]}
        />
        <button className="btn btn-s" onClick={csv} type="button">
          Download CSV
        </button>
      </div>
      <div className="panel-flush table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>{view === 'year' ? 'Loan year' : 'Month'}</th>
              <th className="r">Opening</th>
              {hasPre && <th className="r">Prepaid</th>}
              <th className="r">{view === 'year' ? 'EMIs paid' : 'EMI'}</th>
              <th className="r">Principal</th>
              <th className="r">Interest</th>
              <th className="r">Closing</th>
            </tr>
          </thead>
          <tbody>
            {view === 'year'
              ? years.map((y) => {
                  const isOpen = open.has(y.year)
                  return (
                    <Fragment key={y.year}>
                      <tr>
                        <td>
                          <button
                            type="button"
                            className="link-btn"
                            aria-expanded={isOpen}
                            onClick={() => {
                              const n = new Set(open)
                              if (isOpen) n.delete(y.year)
                              else n.add(y.year)
                              setOpen(n)
                            }}
                          >
                            {isOpen ? '▾' : '▸'} Year {y.year}
                          </button>
                          {startDate && <div className="tiny muted">{monthLabel(startDate, (y.year - 1) * 12)}</div>}
                        </td>
                        <td className="r">{money(y.opening)}</td>
                        {hasPre && <td className="r">{y.prepayment ? money(y.prepayment) : '—'}</td>}
                        <td className="r">{money(y.payments)}</td>
                        <td className="r principal-c">{money(y.principal)}</td>
                        <td className="r interest-c">{money(y.interest)}</td>
                        <td className="r">{money(y.closing)}</td>
                      </tr>
                      {isOpen &&
                        y.months.map((r) => (
                          <tr key={r.month} className="sub">
                            <td style={{ paddingLeft: 26 }}>{when(r.month)}</td>
                            <td className="r">{money(r.opening)}</td>
                            {hasPre && <td className="r">{r.prepayment ? money(r.prepayment) : ''}</td>}
                            <td className="r">{money(r.payment)}</td>
                            <td className="r">{money(r.principal)}</td>
                            <td className="r">{money(r.interest)}</td>
                            <td className="r">{money(r.closing)}</td>
                          </tr>
                        ))}
                    </Fragment>
                  )
                })
              : rowsShown.map((r) => (
                  <tr key={r.month}>
                    <td>
                      {when(r.month)}
                      {r.rate !== s.rows[0].rate && <span className="tiny muted"> · {r.rate}%</span>}
                    </td>
                    <td className="r">{money(r.opening)}</td>
                    {hasPre && <td className="r">{r.prepayment ? money(r.prepayment) : ''}</td>}
                    <td className="r">{money(r.payment)}</td>
                    <td className="r principal-c">{money(r.principal)}</td>
                    <td className="r interest-c">{money(r.interest)}</td>
                    <td className="r">{money(r.closing)}</td>
                  </tr>
                ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td />
              {hasPre && <td className="r">{money(s.totalPrepayments)}</td>}
              <td className="r">{money(s.totalPayments)}</td>
              <td className="r">{money(s.totalPrincipal)}</td>
              <td className="r">{money(s.totalInterest)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {view === 'month' && s.rows.length > 36 && (
        <button type="button" className="btn btn-s" onClick={() => setShowAll(!showAll)} style={{ alignSelf: 'flex-start' }}>
          {showAll ? 'Show first 3 years' : `Show all ${s.rows.length} months`}
        </button>
      )}
      <p className="tiny muted">
        Totals reconcile exactly: principal repaid ({money(s.totalPrincipal)}) + interest ({money(s.totalInterest)}) = everything paid ({money(s.totalOutflow)}). The last EMI is
        smaller because the EMI is rounded up to the next rupee.
      </p>
    </div>
  )
}
