import { useMemo, useState } from 'react'
import { refinance } from '../core/scenarios'
import { compact, duration, locale, money, pct } from '../locale'
import { Assumptions, Insight, PageHead, Section, Stat } from '../ui/bits'
import { NetLine } from '../ui/charts'
import { DecimalInput, FeeInput, MoneyInput, Slider, TenureInput } from '../ui/inputs'
import { useLoanSource } from '../ui/LoanSource'

export default function Refinance() {
  const src = useLoanSource('existing')
  const b = src.basics
  const [newRate, setNewRate] = useState(Math.max(0, Math.round((b.rate - 0.5) * 100) / 100))
  const [newMonths, setNewMonths] = useState<number | null>(null)
  const [fee, setFee] = useState(0.5)
  const [feePct, setFeePct] = useState(true)
  const [other, setOther] = useState(10_000)
  const [fc, setFc] = useState<number | null>(null)
  const [keepYears, setKeepYears] = useState<number | null>(null)
  const nm = newMonths ?? b.months
  const foreclosurePct = fc ?? b.foreclosureChargePct

  const valid = b.principal > 0 && b.months > 0 && nm > 0 && b.emi > b.principal * (b.rate / 1200)
  const r = useMemo(
    () =>
      valid
        ? refinance({
            balance: b.principal,
            currentRate: b.rate,
            remainingMonths: b.months,
            currentEmi: b.emi,
            newRate,
            newMonths: nm,
            newLenderCharges: { processingFee: fee, processingFeeIsPct: feePct, otherCharges: other, insurance: 0 },
            foreclosureChargePct: foreclosurePct,
            taxOnChargesPct: locale.chargeTax.pct,
          })
        : null,
    [valid, b, newRate, nm, fee, feePct, other, foreclosurePct],
  )
  const horizon = Math.ceil(Math.max(b.months, nm) / 12)
  const keepM = (keepYears ?? horizon) * 12
  const netAtKeep = r ? r.netByMonth[Math.min(keepM, r.netByMonth.length) - 1] : 0
  const gap = b.rate - newRate

  let verdict: { tone: 'good' | 'watch' | 'bad'; text: string } | null = null
  if (r) {
    if (gap <= 0) verdict = { tone: 'bad', text: 'The new rate is not lower than your current rate, so switching only adds costs.' }
    else if (r.breakEvenMonth === null) verdict = { tone: 'bad', text: `A ${pct(gap)} lower rate never recovers the ${compact(r.switchingCosts)} switching cost within the loan term.` }
    else if (keepM < r.breakEvenMonth)
      verdict = {
        tone: 'watch',
        text: `Switching pays for itself after about ${duration(r.breakEvenMonth)}. If you close or move the loan within ${duration(keepM)}, you'd be ${compact(Math.abs(netAtKeep))} worse off.`,
      }
    else
      verdict = {
        tone: 'good',
        text: `A ${pct(gap)} lower rate recovers the ${compact(r.switchingCosts)} switching cost in about ${duration(r.breakEvenMonth)}. Keeping the loan ${keepM >= Math.max(b.months, nm) ? 'to the end' : `for ${duration(keepM)}`}, you'd be about ${compact(netAtKeep)} better off.`,
      }
  }

  return (
    <div>
      <PageHead eyebrow="Refinance" title="Is a balance transfer worth it?" lede="A lower rate only helps if it saves more than it costs to switch. This counts the new lender's fees, tax, and any foreclosure charge from your current lender." />
      <div className="workbench">
        <div className="controls stack">
          <h2 className="h3">Your current loan</h2>
          {src.ui}
          <hr className="rule" />
          <h2 className="h3">The new offer</h2>
          <DecimalInput label="New interest rate" value={newRate} onChange={setNewRate} max={40} step={0.05} hint={gap > 0 ? `${pct(gap)} lower than today` : gap < 0 ? `${pct(-gap)} higher than today` : 'Same as today'} />
          <TenureInput label="New tenure" months={nm} onChange={setNewMonths} hint={nm !== b.months ? `Your remaining tenure is ${duration(b.months)}. A longer tenure lowers EMI but adds interest.` : 'Same as your remaining tenure'} />
          <FeeInput label="New lender's processing fee" value={fee} isPct={feePct} base={b.principal} onChange={(v, p) => (setFee(v), setFeePct(p))} />
          <MoneyInput label="Legal, valuation, MOD, other" value={other} onChange={setOther} hint={`${locale.chargeTax.label} added. Stamp duty on a new mortgage can apply in some states.`} />
          <DecimalInput label="Current lender's foreclosure charge" value={foreclosurePct} onChange={setFc} max={10} suffix="% of balance" hint="Usually nil for floating-rate loans to individuals" />
        </div>

        <div className="stack-l" aria-live="polite">
          {!r ? (
            <div className="callout warn">Enter your current loan and the new offer.</div>
          ) : (
            <>
              <section className="stack">
                <div className="eyebrow">{src.label}</div>
                {verdict && (
                  <div className={`callout ${verdict.tone === 'good' ? 'good' : verdict.tone === 'watch' ? 'warn' : 'bad'}`}>
                    <p className="delight" style={{ fontSize: 18 }}>
                      {verdict.text}
                    </p>
                  </div>
                )}
                <div className="stats s3">
                  <Stat label="Switching costs" value={money(r.switchingCosts)} sub="paid upfront, incl. tax" />
                  <Stat label="Break-even" value={r.breakEvenMonth ? duration(r.breakEvenMonth) : 'Never'} sub="counting balance difference" />
                  <Stat label="Net saving (full term)" value={<span className={r.netSaving >= 0 ? 'good-c' : 'bad-c'}>{money(r.netSaving)}</span>} sub="interest saved − costs" />
                  <Stat label="EMI" value={`${money(r.next.emi)}`} sub={r.monthlySaving >= 0 ? `${money(r.monthlySaving)} less than ${money(r.current.emi)}` : `${money(-r.monthlySaving)} more than ${money(r.current.emi)}`} />
                  <Stat label="Interest saved" value={money(r.interestSaved)} sub={`${compact(r.current.totalInterest)} → ${compact(r.next.totalInterest)}`} />
                  <Stat label="Rate gap" value={pct(gap)} />
                </div>
              </section>

              <Section title="When does switching start paying off?" sub="Your running position versus staying put. Above ₹0 means you're ahead." id="be">
                <Slider label="I expect to keep the loan for" value={keepYears ?? horizon} min={1} max={horizon} step={1} onChange={setKeepYears} display={(v) => (v >= horizon ? 'Full term' : `${v} year${v === 1 ? '' : 's'}`)} />
                <NetLine values={r.netByMonth} breakEven={r.breakEvenMonth} marker={keepM < r.netByMonth.length ? keepM : undefined} />
              </Section>

              <section className="stack-s">
                {nm > b.months && <Insight tone="watch">The new loan runs {duration(nm - b.months)} longer. That lowers the EMI but stretches interest over more years — the net figures above already include this.</Insight>}
                {gap > 0 && r.breakEvenMonth && (
                  <Insight tone="neutral">
                    Before switching, ask your current lender to match the rate. Many lenders offer a conversion for a small fee, which avoids most of the {compact(r.switchingCosts)} switching cost.
                  </Insight>
                )}
              </section>

              <Assumptions
                items={[
                  'Both rates stay constant for the full term.',
                  'Switching costs are paid from your pocket, not added to the new loan.',
                  'Break-even counts both lower EMIs and any difference in the outstanding balance, so a longer new tenure does not look better than it is.',
                  'Time, paperwork and any change in insurance or tax benefits are not included.',
                ]}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
