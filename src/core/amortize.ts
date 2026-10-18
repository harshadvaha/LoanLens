/**
 * Core loan mathematics. Currency- and country-agnostic.
 *
 * Conventions (all stated in the UI's "Assumptions" panel):
 *  - Reducing-balance, monthly compounding: monthly rate = annual % / 12 / 100.
 *  - Money is simulated in integer paise (1/100 of the currency unit), so every
 *    schedule reconciles exactly: sum(principal) === loan, and
 *    sum(payments) - loan === sum(interest).
 *  - The computed EMI is rounded UP to a whole currency unit (lenders round EMI),
 *    so the last instalment is usually slightly smaller than the rest.
 *  - Interest each month = round(opening balance × monthly rate), to the paisa.
 *  - Events are keyed by "after N instalments": at = 0 means today, before the
 *    first instalment; at = 12 means after the 12th instalment.
 */

export type AdjustMode = 'tenure' | 'emi'

export interface Prepayment {
  at: number
  amount: number
}

export interface RateChange {
  at: number
  rate: number // new annual %
}

export interface ScheduleInput {
  principal: number
  annualRate: number
  /** Contracted remaining term in months. */
  months: number
  /** If omitted, computed from principal/rate/months (and balloon). */
  emi?: number
  /** Amount due as a single final payment on top of the last instalment (car-loan style). */
  balloon?: number
  prepayments?: Prepayment[]
  rateChanges?: RateChange[]
  /** Flat amount added to every instalment. */
  extraMonthly?: number
  /** Increase the instalment by this % every 12 instalments. */
  annualStepUpPct?: number
  /** What a prepayment reduces. Default 'tenure'. */
  prepayMode?: AdjustMode
  /** What a rate change adjusts. Default 'emi' keeps tenure (recomputes EMI). */
  rateChangeMode?: AdjustMode
}

export interface ScheduleRow {
  month: number // 1-based instalment number
  rate: number
  opening: number
  payment: number // instalment actually paid this month (incl. extra, excl. prepayment)
  interest: number
  principal: number
  prepayment: number // applied before this instalment
  closing: number
}

export interface ScheduleResult {
  rows: ScheduleRow[]
  emi: number // starting instalment (excluding extraMonthly)
  months: number
  totalInterest: number
  totalPrincipal: number
  totalPayments: number // instalments + balloon
  totalPrepayments: number
  totalOutflow: number // everything paid to the lender from today
  /** True if an instalment did not cover the month's interest and was raised to do so. */
  emiAdjustedForNegativeAmortization: boolean
  hitTermCap: boolean
}

const MAX_MONTHS = 1200
const toPaise = (x: number) => Math.round(x * 100)
const toRupees = (p: number) => p / 100

export function monthlyRate(annualRatePct: number): number {
  return annualRatePct / 12 / 100
}

/** Exact (unrounded) EMI. Supports a balloon/residual due with the last instalment. */
export function emiExact(principal: number, annualRate: number, months: number, balloon = 0): number {
  if (months <= 0) return 0
  const r = monthlyRate(annualRate)
  if (r === 0) return (principal - balloon) / months
  const f = Math.pow(1 + r, months)
  return ((principal - balloon / f) * r * f) / (f - 1)
}

/** EMI rounded up to a whole currency unit, as lenders quote it. */
export function emi(principal: number, annualRate: number, months: number, balloon = 0): number {
  return Math.ceil(emiExact(principal, annualRate, months, balloon) - 1e-9)
}

/** Months needed to repay `principal` with instalment `payment`. Infinity if it never repays. */
export function tenureFor(principal: number, annualRate: number, payment: number): number {
  const r = monthlyRate(annualRate)
  if (payment <= 0) return Infinity
  if (r === 0) return Math.ceil(principal / payment)
  if (payment <= principal * r) return Infinity
  return Math.ceil(-Math.log(1 - (principal * r) / payment) / Math.log(1 + r) - 1e-9)
}

/** Principal that a given instalment can service. */
export function principalFor(payment: number, annualRate: number, months: number): number {
  const r = monthlyRate(annualRate)
  if (r === 0) return payment * months
  const f = Math.pow(1 + r, months)
  return (payment * (f - 1)) / (r * f)
}

/** Annual rate implied by principal, instalment and term (bisection). */
export function rateFor(principal: number, payment: number, months: number): number {
  if (payment * months <= principal) return 0
  let lo = 0
  let hi = 200
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (emiExact(principal, mid, months) > payment) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

export function schedule(input: ScheduleInput): ScheduleResult {
  const {
    principal,
    months,
    balloon = 0,
    prepayments = [],
    rateChanges = [],
    extraMonthly = 0,
    annualStepUpPct = 0,
    prepayMode = 'tenure',
    rateChangeMode = 'emi',
  } = input
  let rate = input.annualRate
  let baseEmi = input.emi ?? emi(principal, rate, months, balloon)
  const startEmi = baseEmi
  const balloonP = toPaise(balloon)
  const extraP = toPaise(extraMonthly)

  let bal = toPaise(principal)
  const rows: ScheduleRow[] = []
  let negAm = false
  let hitCap = false
  let totInt = 0
  let totPrin = 0
  let totPay = 0
  let totPre = 0

  const preAt = new Map<number, number>()
  for (const p of prepayments) {
    if (p.amount > 0 && p.at >= 0) preAt.set(p.at, (preAt.get(p.at) ?? 0) + toPaise(p.amount))
  }
  const rateAt = new Map<number, number>()
  for (const c of rateChanges) rateAt.set(c.at, c.rate)

  let m = 0
  while (bal > 0) {
    if (m >= MAX_MONTHS) {
      hitCap = true
      break
    }
    const remainingContract = Math.max(1, months - m)
    let prepaidNow = 0

    // Events that happen after m instalments, before instalment m+1.
    if (rateAt.has(m)) {
      rate = rateAt.get(m)!
      if (rateChangeMode === 'emi') baseEmi = emi(toRupees(bal), rate, remainingContract, balloon)
    }
    if (preAt.has(m)) {
      // A prepayment cannot exceed what is owed (excluding a balloon still due at the end).
      prepaidNow = Math.min(preAt.get(m)!, bal)
      bal -= prepaidNow
      totPre += prepaidNow
      if (bal <= 0) {
        rows.push(row(m + 1, rate, bal + prepaidNow, 0, 0, 0, prepaidNow, 0))
        totPrin += prepaidNow
        break
      }
      totPrin += prepaidNow
      if (prepayMode === 'emi') {
        baseEmi = emi(toRupees(bal), rate, remainingContract, Math.min(balloon, toRupees(bal)))
      }
    }
    if (annualStepUpPct > 0 && m > 0 && m % 12 === 0) {
      baseEmi = Math.ceil(baseEmi * (1 + annualStepUpPct / 100))
    }

    const r = monthlyRate(rate)
    const opening = bal
    const interest = Math.round(opening * r)
    let pay = toPaise(baseEmi) + extraP
    if (pay <= interest) {
      // Instalment would not even cover interest: lender would raise it. Recompute over remaining term.
      negAm = true
      baseEmi = emi(toRupees(bal), rate, remainingContract)
      pay = toPaise(baseEmi) + extraP
    }
    const owed = opening + interest
    // A balloon/residual is, by definition, whatever is left at contract end: settle it in full.
    if (balloonP > 0 && m + 1 >= months) pay = owed
    pay = Math.min(pay, owed)
    const prin = pay - interest
    bal = opening - prin
    totInt += interest
    totPrin += prin
    totPay += pay
    m++
    rows.push(row(m, rate, opening + prepaidNow, pay, interest, prin, prepaidNow, bal))
  }

  return {
    rows,
    emi: startEmi,
    months: rows.length,
    totalInterest: toRupees(totInt),
    totalPrincipal: toRupees(totPrin),
    totalPayments: toRupees(totPay),
    totalPrepayments: toRupees(totPre),
    totalOutflow: toRupees(totPay + totPre),
    emiAdjustedForNegativeAmortization: negAm,
    hitTermCap: hitCap,
  }
}

function row(
  month: number,
  rate: number,
  openingP: number,
  payP: number,
  intP: number,
  prinP: number,
  preP: number,
  closeP: number,
): ScheduleRow {
  return {
    month,
    rate,
    opening: toRupees(openingP),
    payment: toRupees(payP),
    interest: toRupees(intP),
    principal: toRupees(prinP),
    prepayment: toRupees(preP),
    closing: toRupees(closeP),
  }
}

export interface YearRow {
  year: number
  months: ScheduleRow[]
  opening: number
  payments: number
  interest: number
  principal: number
  prepayment: number
  closing: number
}

/** Group a schedule into 12-instalment years (loan years, not calendar years). */
export function byYear(rows: ScheduleRow[]): YearRow[] {
  const out: YearRow[] = []
  for (let i = 0; i < rows.length; i += 12) {
    const chunk = rows.slice(i, i + 12)
    const sum = (k: keyof ScheduleRow) => chunk.reduce((s, r) => s + toPaise(r[k] as number), 0) / 100
    out.push({
      year: i / 12 + 1,
      months: chunk,
      opening: chunk[0].opening,
      payments: sum('payment'),
      interest: sum('interest'),
      principal: sum('principal'),
      prepayment: sum('prepayment'),
      closing: chunk[chunk.length - 1].closing,
    })
  }
  return out
}
