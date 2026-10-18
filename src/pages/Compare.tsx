import { useMemo, useState } from 'react'
import { compareOffers, type Offer } from '../core/scenarios'
import { compact, duration, locale, money, pct } from '../locale'
import { getStore, newId, saveLoan, type Loan } from '../store/loans'
import { Assumptions, Badge, Insight, PageHead, Section } from '../ui/bits'
import { DecimalInput, FeeInput, MoneyInput, RANGES, Segmented, Slider, TenureInput, TextInput } from '../ui/inputs'

interface OfferForm extends Offer {
  rateType: 'floating' | 'fixed'
  benchmark: string
  reset: string
  prepayPct: number
  foreclosurePct: number
  latePayment: string
  bounce: string
  example?: boolean
}

const blankCharges = { processingFee: 0, processingFeeIsPct: false, otherCharges: 0, insurance: 0 }

function fromLoan(l: Loan): OfferForm {
  return {
    id: l.id,
    name: l.name,
    principal: l.originalAmount ?? l.principal,
    rate: l.rate,
    months: l.originalMonths ?? l.months,
    charges: l.charges,
    rateType: l.rateType,
    benchmark: l.benchmark === 'repo' && l.spread ? `Repo + ${l.spread}%` : '',
    reset: l.resetMonths ? `Every ${l.resetMonths} months` : '',
    prepayPct: l.prepayChargePct,
    foreclosurePct: l.foreclosureChargePct,
    latePayment: '',
    bounce: '',
  }
}

function initial(): OfferForm[] {
  const offers = getStore().loans.filter((l) => l.kind === 'offer')
  if (offers.length >= 2) return offers.slice(0, 4).map(fromLoan)
  const ex = (name: string, rate: number, fee: number): OfferForm => ({
    id: newId(),
    name,
    principal: 3_000_000,
    rate,
    months: 240,
    charges: { ...blankCharges, processingFee: fee },
    rateType: 'floating',
    benchmark: '',
    reset: '',
    prepayPct: 0,
    foreclosurePct: 0,
    latePayment: '',
    bounce: '',
    example: true,
  })
  const base = offers.map(fromLoan)
  return [...base, ex('Offer A (example)', 8.25, 120_000), ex('Offer B (example)', 8.4, 25_000)].slice(0, 2)
}

export default function Compare() {
  const [offers, setOffers] = useState<OfferForm[]>(initial)
  const [horizonYears, setHorizonYears] = useState<number | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const upd = (id: string, p: Partial<OfferForm>) => setOffers((os) => os.map((o) => (o.id === id ? { ...o, ...p, example: false } : o)))
  const valid = offers.every((o) => o.principal > 0 && o.months > 0 && o.rate >= 0)
  const cmp = useMemo(() => (valid ? compareOffers(offers, locale.chargeTax.pct) : null), [offers, valid])
  const maxYears = Math.ceil(Math.max(...offers.map((o) => o.months)) / 12)
  const H = (horizonYears ?? maxYears) * 12
  const tax = 1 + locale.chargeTax.pct / 100

  /** Cost if the loan is closed after H months: interest so far + upfront + foreclosure charge on the balance then. */
  const horizonCost = (id: string) => {
    const r = cmp!.results.find((x) => x.offer.id === id)!
    const o = offers.find((x) => x.id === id)!
    const rows = r.cost.schedule.rows.slice(0, H)
    const interest = rows.reduce((s, x) => s + x.interest, 0)
    const bal = rows.length ? rows[rows.length - 1].closing : o.principal
    return interest + r.cost.upfront.total + ((bal * o.foreclosurePct) / 100) * tax
  }
  const horizonRank = cmp ? [...cmp.results].sort((a, b) => horizonCost(a.offer.id) - horizonCost(b.offer.id)) : []
  const fullTerm = H >= Math.max(...offers.map((o) => o.months))
  const winner = horizonRank[0]
  const name = (id: string) => offers.find((o) => o.id === id)?.name ?? ''

  const explain = () => {
    if (!cmp || cmp.results.length < 2) return null
    const lowRate = cmp.results.find((r) => r.offer.id === cmp.lowestRate)!
    const cheap = winner
    if (lowRate.offer.id === cheap.offer.id) return `${cheap.offer.name} has both the lowest rate and the lowest total cost${fullTerm ? '' : ` over ${duration(H)}`}.`
    const dInt = cheap.cost.interest - lowRate.cost.interest
    const dFee = lowRate.cost.upfront.total - cheap.cost.upfront.total
    return `${lowRate.offer.name} has the lower rate (${pct(lowRate.offer.rate)} vs ${pct(cheap.offer.rate)}), which saves about ${compact(Math.max(0, dInt))} in interest over the full term — but its charges are ${compact(dFee)} higher. ${fullTerm ? 'Over the full term' : `If you close or switch after ${duration(H)}`}, ${cheap.offer.name} costs ${compact(horizonCost(lowRate.offer.id) - horizonCost(cheap.offer.id))} less.`
  }

  return (
    <div className="stack-l">
      <PageHead eyebrow="Compare offers" title="Compare the offers by total cost" lede="The lowest headline rate is not always the cheapest loan. Enter each offer's rate and every charge; we rank them by what they actually cost you." />

      {offers.some((o) => o.example) && <div className="callout small">The numbers below are examples. Replace them with your offers — or save offers from New loan and they'll load here.</div>}

      <div className="offer-cols">
        {offers.map((o, i) => (
          <section key={o.id} className="panel stack" aria-label={o.name || `Offer ${i + 1}`}>
            <div className="row between">
              <TextInput label="Name" value={o.name} onChange={(name) => upd(o.id, { name })} />
            </div>
            <MoneyInput label="Loan amount" value={o.principal} onChange={(principal) => upd(o.id, { principal })} required range={RANGES.outstanding} />
            <DecimalInput label="Rate" value={o.rate} onChange={(rate) => upd(o.id, { rate })} max={40} step={0.05} suffix="% / year" range={RANGES.rate} />
            <TenureInput label="Tenure" months={o.months} onChange={(months) => upd(o.id, { months })} />
            <FeeInput label="Processing fee" value={o.charges.processingFee} isPct={o.charges.processingFeeIsPct} base={o.principal} onChange={(processingFee, processingFeeIsPct) => upd(o.id, { charges: { ...o.charges, processingFee, processingFeeIsPct } })} />
            <details className="disclosure">
              <summary>Other charges and terms</summary>
              <div className="stack" style={{ marginTop: 8 }}>
                <MoneyInput range={[0, 200_000]} label="Legal, technical, other" value={o.charges.otherCharges} onChange={(otherCharges) => upd(o.id, { charges: { ...o.charges, otherCharges } })} />
                <MoneyInput range={[0, 500_000]} label="Insurance / bundled" value={o.charges.insurance} onChange={(insurance) => upd(o.id, { charges: { ...o.charges, insurance } })} />
                <Segmented
                  label="Rate type"
                  value={o.rateType}
                  onChange={(rateType) => upd(o.id, { rateType })}
                  options={[
                    { value: 'floating', label: 'Floating' },
                    { value: 'fixed', label: 'Fixed' },
                  ]}
                />
                {o.rateType === 'floating' && (
                  <div className="grid-2">
                    <TextInput label="Benchmark + spread" value={o.benchmark} onChange={(benchmark) => upd(o.id, { benchmark })} placeholder="Repo + 2.75%" />
                    <TextInput label="Reset" value={o.reset} onChange={(reset) => upd(o.id, { reset })} placeholder="Every 3 months" />
                  </div>
                )}
                <div className="grid-2">
                  <DecimalInput label="Prepayment charge" value={o.prepayPct} onChange={(prepayPct) => upd(o.id, { prepayPct })} max={10} range={RANGES.chargePct} />
                  <DecimalInput label="Foreclosure charge" value={o.foreclosurePct} onChange={(foreclosurePct) => upd(o.id, { foreclosurePct })} max={10} range={RANGES.chargePct} />
                </div>
                <div className="grid-2">
                  <TextInput label="Late payment charge" value={o.latePayment} onChange={(latePayment) => upd(o.id, { latePayment })} placeholder="e.g. 2% p.m." />
                  <TextInput label="Bounce charge" value={o.bounce} onChange={(bounce) => upd(o.id, { bounce })} placeholder="e.g. ₹500" />
                </div>
              </div>
            </details>
            <div className="row" style={{ gap: 6 }}>
              <button
                type="button"
                className="btn btn-s"
                onClick={() => {
                  saveLoan({
                    id: o.id,
                    name: o.name || `Offer ${i + 1}`,
                    kind: 'offer',
                    type: getStore().loans.find((l) => l.id === o.id)?.type ?? 'home',
                    principal: o.principal,
                    rate: o.rate,
                    months: o.months,
                    rateType: o.rateType,
                    charges: o.charges,
                    prepayChargePct: o.prepayPct,
                    foreclosureChargePct: o.foreclosurePct,
                    originalAmount: o.principal,
                    originalMonths: o.months,
                    updatedAt: '',
                  })
                  setSavedIds(new Set(savedIds).add(o.id))
                }}
              >
                {savedIds.has(o.id) ? 'Saved ✓' : 'Save offer'}
              </button>
              {offers.length > 2 && (
                <button type="button" className="btn btn-s btn-ghost" onClick={() => setOffers(offers.filter((x) => x.id !== o.id))}>
                  Remove
                </button>
              )}
            </div>
          </section>
        ))}
      </div>
      {offers.length < 4 && (
        <button
          type="button"
          className="btn"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => {
            const last = offers[offers.length - 1]
            setOffers([...offers, { ...last, id: newId(), name: `Offer ${String.fromCharCode(65 + offers.length)}`, example: false }])
          }}
        >
          + Add an offer
        </button>
      )}

      {cmp && (
        <Section title="Result" id="result">
          {(!cmp.samePrincipal || !cmp.sameTenure) && (
            <div className="callout warn small">
              The offers have different {!cmp.samePrincipal ? 'amounts' : ''}
              {!cmp.samePrincipal && !cmp.sameTenure ? ' and ' : ''}
              {!cmp.sameTenure ? 'tenures' : ''}. Total cost is still comparable, but a longer tenure always costs more interest — compare EMIs too.
            </div>
          )}
          <Slider
            label="How long do you expect to keep the loan?"
            value={horizonYears ?? maxYears}
            min={1}
            max={maxYears}
            step={1}
            onChange={setHorizonYears}
            display={(v) => (v >= maxYears ? 'Full term' : `${v} year${v === 1 ? '' : 's'}`)}
            hint="Many loans are prepaid or moved early. Upfront charges hurt most when you close early."
          />
          <p className="delight">
            {winner.offer.name} is the cheapest{fullTerm ? '' : ` if you keep the loan ${duration(H)}`}: <b className="good-c" style={{ color: 'var(--good)' }}>{compact(horizonCost(winner.offer.id))}</b> to borrow.
            {cmp.rateMisleads && fullTerm && <> Lower rate, higher total cost for {name(cmp.lowestRate)}.</>}
          </p>
          {explain() && <Insight>{explain()}</Insight>}

          <div className="panel-flush table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th />
                  {horizonRank.map((r, i) => (
                    <th key={r.offer.id} className="r" style={{ minWidth: 130 }}>
                      <div style={{ color: 'var(--ink)', fontWeight: 600 }}>
                        {i + 1}. {r.offer.name}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td />
                  {horizonRank.map((r) => (
                    <td key={r.offer.id} className="r">
                      <div className="stack-s" style={{ alignItems: 'flex-end', gap: 3 }}>
                        {r.offer.id === winner.offer.id && <Badge tone="solid">Lowest total cost</Badge>}
                        {r.offer.id === cmp.lowestEmi && <Badge tone="neutral">Lowest EMI</Badge>}
                        {r.offer.id === cmp.lowestUpfront && <Badge tone="neutral">Lowest upfront</Badge>}
                        {r.offer.id === cmp.lowestRate && <Badge tone="neutral">Lowest rate</Badge>}
                      </div>
                    </td>
                  ))}
                </tr>
                <tr className="hl">
                  <td>{fullTerm ? 'Cost of borrowing' : `Cost if closed after ${duration(H)}`}</td>
                  {horizonRank.map((r) => (
                    <td key={r.offer.id} className="r">
                      {money(horizonCost(r.offer.id))}
                    </td>
                  ))}
                </tr>
                {(
                  [
                    ['Interest rate', (r) => pct(r.offer.rate)],
                    ['All-in annual rate', (r) => pct(r.cost.allInRate)],
                    ['EMI', (r) => money(r.cost.schedule.emi)],
                    ['Tenure', (r) => duration(r.offer.months)],
                    ['Total interest (full term)', (r) => money(r.cost.interest)],
                    ['Processing fee', (r) => money(r.cost.upfront.processing)],
                    ['Other charges', (r) => money(r.cost.upfront.other)],
                    [`${locale.chargeTax.label} on charges`, (r) => money(r.cost.upfront.taxOnCharges)],
                    ['Insurance', (r) => money(r.cost.upfront.insurance)],
                    ['Upfront total', (r) => money(r.cost.upfront.total)],
                    ['Total paid (full term)', (r) => money(r.cost.totalOutflow)],
                  ] as [string, (r: (typeof horizonRank)[number]) => string][]
                ).map(([label, f]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    {horizonRank.map((r) => (
                      <td key={r.offer.id} className="r">
                        {f(r)}
                      </td>
                    ))}
                  </tr>
                ))}
                {(
                  [
                    ['Rate type', (o) => o.rateType],
                    ['Benchmark + spread', (o) => o.benchmark || '—'],
                    ['Reset', (o) => o.reset || '—'],
                    ['Prepayment charge', (o) => (o.prepayPct ? pct(o.prepayPct) : 'None entered')],
                    ['Foreclosure charge', (o) => (o.foreclosurePct ? pct(o.foreclosurePct) : 'None entered')],
                    ['Late payment', (o) => o.latePayment || '—'],
                    ['Bounce charge', (o) => o.bounce || '—'],
                  ] as [string, (o: OfferForm) => string][]
                ).map(([label, f]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    {horizonRank.map((r) => (
                      <td key={r.offer.id} className="r">
                        {f(offers.find((o) => o.id === r.offer.id)!)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Assumptions
            items={[
              'Ranked by cost of borrowing: interest + processing and other charges + tax on charges + insurance. Principal is the same money you would repay under any offer.',
              'Each offer’s rate is held constant. Floating rates will move, usually by similar amounts for loans on the same benchmark.',
              'Closing early adds the foreclosure charge (plus tax) on the balance at that time.',
              'Late-payment and bounce charges are shown for reference; they only apply if you miss payments.',
            ]}
          />
        </Section>
      )}
    </div>
  )
}
