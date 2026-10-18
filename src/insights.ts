/**
 * Calculated insights. Every sentence here is derived from numbers the engine produced;
 * nothing is generated or guessed. Uses locale + the user's saved data, so it lives outside core/.
 */
import { emi, schedule, type ScheduleResult } from './core/amortize'
import { compact, duration, fmtDate, loanType, pct } from './locale'
import type { Loan } from './store/loans'
import { currentBenchmark, loanEmi, loanSchedule } from './store/loans'

export type Health = 'Good' | 'Watch' | 'Expensive' | 'Action recommended' | 'Not rated'

export interface HealthResult {
  status: Health
  tone: 'good' | 'watch' | 'bad' | 'neutral'
  reasons: string[]
}

export function loanHealth(l: Loan): HealthResult {
  const s = loanSchedule(l)
  const reasons: string[] = []
  const e = loanEmi(l)
  const firstInterest = l.principal * (l.rate / 1200)
  if (e <= firstInterest) {
    return {
      status: 'Action recommended',
      tone: 'bad',
      reasons: [
        `Your EMI (${compact(e)}) does not cover this month's interest (${compact(firstInterest)}), so the balance would grow. Ask your lender to raise the EMI or confirm the current terms.`,
      ],
    }
  }
  let status: Health = 'Not rated'
  let tone: HealthResult['tone'] = 'neutral'
  const q = l.bestQuote
  if (q && q > 0) {
    const gap = l.rate - q
    const alt = schedule({ principal: l.principal, annualRate: q, months: s.months })
    const worth = s.totalInterest - alt.totalInterest
    const basis = `the best rate you've been quoted (${pct(q)})`
    if (gap <= 0.25) {
      status = 'Good'
      tone = 'good'
      reasons.push(`Your rate of ${pct(l.rate)} is ${gap <= 0 ? 'at or below' : `within ${pct(gap)} of`} ${basis}.`)
    } else if (gap <= 0.75) {
      status = 'Watch'
      tone = 'watch'
      reasons.push(`Your rate is ${pct(gap)} above ${basis}. Over the remaining term that gap is worth about ${compact(worth)} in interest. Ask your lender to match it.`)
    } else {
      status = 'Expensive'
      tone = 'bad'
      reasons.push(`Your rate is ${pct(gap)} above ${basis} — about ${compact(worth)} of extra interest over the remaining term. A balance transfer is worth checking once you include switching costs.`)
    }
  } else {
    reasons.push(`Add the best rate you've been quoted for a similar ${loanType(l.type).label.toLowerCase()} (edit this loan) to see whether yours is competitive.`)
  }
  const remainingTotal = s.totalPayments
  if (s.totalInterest > l.principal * 0.6)
    reasons.push(`You will still pay about ${compact(s.totalInterest)} in interest — ${pct((s.totalInterest / remainingTotal) * 100, 0)} of everything left to pay.`)
  if (l.rateType === 'floating') {
    const b = currentBenchmark()
    reasons.push(`This is a floating-rate loan. The ${b.name} is ${pct(b.value)} (as of ${fmtDate(b.asOf)}); if your rate is linked to it, changes reach you at your next reset.`)
  }
  return { status, tone, reasons }
}

/** Short factual observations about a fresh loan or offer. */
export function loanInsights(principal: number, rate: number, months: number, s: ScheduleResult, charges = 0): string[] {
  const out: string[] = []
  if (s.totalInterest > principal) out.push(`You would pay more in interest (${compact(s.totalInterest)}) than you borrow (${compact(principal)}).`)
  const firstYear = s.rows.slice(0, 12)
  const fyI = firstYear.reduce((a, r) => a + r.interest, 0)
  const fyP = firstYear.reduce((a, r) => a + r.payment, 0)
  if (fyP > 0 && fyI / fyP > 0.5) out.push(`In the first year, ${pct((fyI / fyP) * 100, 0)} of what you pay is interest. Early prepayments save the most.`)
  const up = schedule({ principal, annualRate: rate + 1, months })
  const extra = up.totalInterest - s.totalInterest
  if (extra > principal * 0.08)
    out.push(`A 1% rise in the rate would add about ${compact(up.emi - s.emi)} a month, or ${compact(extra)} over the full term. This loan is sensitive to rate changes.`)
  const plus10 = schedule({ principal, annualRate: rate, months, emi: Math.ceil(s.emi * 1.1) })
  if (months >= 60 && s.months - plus10.months >= 12)
    out.push(`Paying 10% more each month (${compact(Math.ceil(s.emi * 0.1))}) would finish ${duration(s.months - plus10.months)} sooner and save ${compact(s.totalInterest - plus10.totalInterest)}.`)
  if (charges > 0 && charges > s.totalInterest * 0.1)
    out.push(`Charges are ${pct((charges / (charges + s.totalInterest)) * 100, 0)} of your cost of borrowing — negotiate them as hard as the rate.`)
  return out
}

/** Text for how much a rate change moves the EMI. */
export function rateRiskLine(principal: number, rate: number, months: number, delta: number): string {
  const a = emi(principal, rate, months)
  const b = emi(principal, rate + delta, months)
  return `${delta > 0 ? '+' : ''}${pct(delta)} → EMI ${b > a ? 'up' : 'down'} ${compact(Math.abs(b - a))}`
}
