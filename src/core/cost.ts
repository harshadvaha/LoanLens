/**
 * True cost of a loan: interest + charges + tax on charges, and an all-in
 * annualised rate derived from actual cash flows (IRR). Country-agnostic:
 * the tax rate on charges is passed in from the locale config.
 */
import { schedule, type ScheduleResult, type ScheduleInput } from './amortize'

export interface Charges {
  /** Processing fee; a % of principal if processingFeeIsPct, else an absolute amount. */
  processingFee: number
  processingFeeIsPct: boolean
  /** Legal, technical, valuation, documentation, admin — lender charges subject to tax. */
  otherCharges: number
  /** Insurance or bundled products paid upfront (premium usually already includes its own tax). */
  insurance: number
}

export const NO_CHARGES: Charges = { processingFee: 0, processingFeeIsPct: false, otherCharges: 0, insurance: 0 }

export interface UpfrontCosts {
  processing: number
  other: number
  taxOnCharges: number
  insurance: number
  total: number
}

const r2 = (x: number) => Math.round(x * 100) / 100

export function upfrontCosts(principal: number, c: Charges, taxOnChargesPct: number): UpfrontCosts {
  const processing = r2(c.processingFeeIsPct ? (principal * c.processingFee) / 100 : c.processingFee)
  const other = r2(c.otherCharges)
  const taxOnCharges = r2(((processing + other) * taxOnChargesPct) / 100)
  const insurance = r2(c.insurance)
  return { processing, other, taxOnCharges, insurance, total: r2(processing + other + taxOnCharges + insurance) }
}

/** Monthly IRR of a cash-flow series (index = month). Returns NaN if no sign change. */
export function irr(flows: number[]): number {
  const npv = (r: number) => flows.reduce((s, f, t) => s + f / Math.pow(1 + r, t), 0)
  let lo = -0.99
  let hi = 1
  let flo = npv(lo)
  const fhi = npv(hi)
  if (Number.isNaN(flo) || flo * fhi > 0) return NaN
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2
    const fm = npv(mid)
    if (Math.abs(fm) < 1e-7) return mid
    if (fm * flo > 0) {
      lo = mid
      flo = fm
    } else hi = mid
  }
  return (lo + hi) / 2
}

export interface TrueCost {
  borrowed: number
  upfront: UpfrontCosts
  schedule: ScheduleResult
  interest: number
  /** Interest + all charges + tax on charges + insurance. */
  costOfBorrowing: number
  /** Principal + cost of borrowing (+ prepayments are part of principal). */
  totalOutflow: number
  /** All-in annual rate: monthly IRR × 12, after charges. Comparable to the quoted (nominal) rate. */
  allInRate: number
  interestPctOfPrincipal: number
}

export function trueCost(input: ScheduleInput, charges: Charges, taxOnChargesPct: number): TrueCost {
  const s = schedule(input)
  const up = upfrontCosts(input.principal, charges, taxOnChargesPct)
  const flows: number[] = [input.principal - up.total]
  for (const row of s.rows) {
    if (row.prepayment && row.month === 1) flows[0] -= row.prepayment
    else if (row.prepayment) flows[row.month - 1] = (flows[row.month - 1] ?? 0) - row.prepayment
    flows[row.month] = (flows[row.month] ?? 0) - row.payment
  }
  const m = irr(flows.map((f) => f ?? 0))
  const cost = r2(s.totalInterest + up.total)
  return {
    borrowed: input.principal,
    upfront: up,
    schedule: s,
    interest: s.totalInterest,
    costOfBorrowing: cost,
    totalOutflow: r2(input.principal + cost),
    allInRate: Number.isNaN(m) ? NaN : m * 12 * 100,
    interestPctOfPrincipal: input.principal > 0 ? (s.totalInterest / input.principal) * 100 : 0,
  }
}
