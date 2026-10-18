/**
 * Decision calculators built on the amortisation core. Country-agnostic.
 */
import {
  emi,
  principalFor,
  schedule,
  tenureFor,
  type AdjustMode,
  type Prepayment,
  type ScheduleInput,
  type ScheduleResult,
} from './amortize'
import { irr, trueCost, upfrontCosts, type Charges, type TrueCost } from './cost'

const r2 = (x: number) => Math.round(x * 100) / 100

/* ------------------------------------------------------------------ */
/* Scenario comparison against a baseline                              */
/* ------------------------------------------------------------------ */

export interface ScenarioResult {
  key: string
  label: string
  schedule: ScheduleResult
  interestSaved: number
  monthsSaved: number
  /** Cash paid today (lump sums at month 0). */
  cashToday: number
  /** First-month instalment. */
  firstPayment: number
}

export function compareToBase(base: ScheduleResult, key: string, label: string, s: ScheduleResult, cashToday = 0): ScenarioResult {
  return {
    key,
    label,
    schedule: s,
    interestSaved: r2(base.totalInterest - s.totalInterest),
    monthsSaved: base.months - s.months,
    cashToday,
    firstPayment: s.rows.find((r) => r.payment > 0)?.payment ?? 0,
  }
}

export interface OptimizerInput {
  base: ScheduleInput
  lumpSum: number
  extraMonthly: number
  annualStepUpPct: number
  prepayMode: AdjustMode
  /** Extra scheduled prepayments (e.g. annual bonus). */
  scheduled?: Prepayment[]
}

export function optimizerScenarios(o: OptimizerInput): { base: ScheduleResult; scenarios: ScenarioResult[] } {
  const base = schedule(o.base)
  const mk = (p: Partial<ScheduleInput>) => schedule({ ...o.base, prepayMode: o.prepayMode, ...p })
  const lump: Prepayment[] = o.lumpSum > 0 ? [{ at: 0, amount: o.lumpSum }] : []
  const sched = o.scheduled ?? []
  const out: ScenarioResult[] = []
  if (o.lumpSum > 0 || sched.length)
    out.push(compareToBase(base, 'lump', 'Prepayments only', mk({ prepayments: [...lump, ...sched] }), o.lumpSum))
  if (o.extraMonthly > 0) out.push(compareToBase(base, 'extra', 'Higher EMI only', mk({ extraMonthly: o.extraMonthly })))
  if (o.annualStepUpPct > 0)
    out.push(compareToBase(base, 'stepup', 'Yearly EMI step-up only', mk({ annualStepUpPct: o.annualStepUpPct })))
  const active = [o.lumpSum > 0 || sched.length > 0, o.extraMonthly > 0, o.annualStepUpPct > 0].filter(Boolean).length
  if (active >= 2)
    out.push(
      compareToBase(
        base,
        'combined',
        'All of the above',
        mk({ prepayments: [...lump, ...sched], extraMonthly: o.extraMonthly, annualStepUpPct: o.annualStepUpPct }),
        o.lumpSum,
      ),
    )
  return { base, scenarios: out }
}

/** Extra monthly amount needed to finish in `targetMonths` (from today). */
export function extraForTarget(principal: number, annualRate: number, currentEmi: number, targetMonths: number): number {
  if (targetMonths <= 0) return Infinity
  return Math.max(0, emi(principal, annualRate, targetMonths) - currentEmi)
}

/* ------------------------------------------------------------------ */
/* Prepayment: reduce tenure vs reduce EMI                             */
/* ------------------------------------------------------------------ */

export interface PrepaymentAnalysis {
  base: ScheduleResult
  tenure: ScenarioResult
  emi: ScenarioResult
  /** New instalment under the reduce-EMI option, after the first prepayment. */
  newEmi: number
  /** Annualised return earned by the prepaid money (IRR of saved instalments), tenure option. */
  effectiveReturn: number
}

export function analysePrepayment(base: ScheduleInput, prepayments: Prepayment[]): PrepaymentAnalysis {
  const b = schedule(base)
  const t = schedule({ ...base, prepayments, prepayMode: 'tenure' })
  const e = schedule({ ...base, prepayments, prepayMode: 'emi' })
  const firstAt = Math.min(...prepayments.map((p) => p.at))
  const newEmi = e.rows.find((r) => r.month > firstAt + 1)?.payment ?? e.rows[e.rows.length - 1]?.payment ?? 0
  const today = prepayments.filter((p) => p.at === 0).reduce((s, p) => s + p.amount, 0)

  // Return on prepaid money: outflows = prepayments, inflows = instalments no longer paid.
  const n = Math.max(b.months, t.months) + 1
  const flows = new Array(n).fill(0)
  for (const p of prepayments) flows[p.at] -= p.amount
  for (let i = 0; i < n - 1; i++) flows[i + 1] += (b.rows[i]?.payment ?? 0) - (t.rows[i]?.payment ?? 0)
  const m = irr(flows)

  return {
    base: b,
    tenure: compareToBase(b, 'tenure', 'Reduce tenure (keep EMI)', t, today),
    emi: compareToBase(b, 'emi', 'Reduce EMI (keep tenure)', e, today),
    newEmi,
    effectiveReturn: Number.isNaN(m) ? NaN : m * 12 * 100,
  }
}

/* ------------------------------------------------------------------ */
/* Refinance / balance transfer                                        */
/* ------------------------------------------------------------------ */

export interface RefinanceInput {
  balance: number
  currentRate: number
  remainingMonths: number
  currentEmi?: number
  newRate: number
  newMonths: number
  /** New lender's processing fee etc. and old lender's foreclosure charge, before tax. */
  newLenderCharges: Charges
  foreclosureChargePct: number
  taxOnChargesPct: number
}

export interface RefinanceResult {
  current: ScheduleResult
  next: ScheduleResult
  switchingCosts: number
  monthlySaving: number
  interestSaved: number
  netSaving: number
  /** First month after which switching is ahead, counting outstanding balance. null = never within the term. */
  breakEvenMonth: number | null
  /** Net position (₹ ahead) after each month: positive = switching is better so far. */
  netByMonth: number[]
}

export function refinance(i: RefinanceInput): RefinanceResult {
  const current = schedule({ principal: i.balance, annualRate: i.currentRate, months: i.remainingMonths, emi: i.currentEmi })
  const next = schedule({ principal: i.balance, annualRate: i.newRate, months: i.newMonths })
  const up = upfrontCosts(i.balance, i.newLenderCharges, i.taxOnChargesPct)
  const foreclosure = (i.balance * i.foreclosureChargePct) / 100
  const switchingCosts = r2(up.total + foreclosure * (1 + i.taxOnChargesPct / 100))

  const horizon = Math.max(current.months, next.months)
  const netByMonth: number[] = []
  let cumCur = 0
  let cumNew = 0
  let breakEven: number | null = null
  for (let t = 1; t <= horizon; t++) {
    const c = current.rows[t - 1]
    const n = next.rows[t - 1]
    cumCur += c?.payment ?? 0
    cumNew += n?.payment ?? 0
    const balCur = c?.closing ?? 0
    const balNew = n?.closing ?? 0
    // Ahead = what you have NOT paid + the debt you no longer owe, minus switching costs.
    const net = r2(cumCur - cumNew + (balCur - balNew) - switchingCosts)
    netByMonth.push(net)
    if (breakEven === null && net >= 0) breakEven = t
  }
  return {
    current,
    next,
    switchingCosts,
    monthlySaving: r2(current.emi - next.emi),
    interestSaved: r2(current.totalInterest - next.totalInterest),
    netSaving: r2(current.totalInterest - next.totalInterest - switchingCosts),
    breakEvenMonth: breakEven,
    netByMonth,
  }
}

/* ------------------------------------------------------------------ */
/* Offer comparison                                                    */
/* ------------------------------------------------------------------ */

export interface Offer {
  id: string
  name: string
  principal: number
  rate: number
  months: number
  charges: Charges
}

export interface OfferResult {
  offer: Offer
  cost: TrueCost
}

export interface Comparison {
  results: OfferResult[] // sorted by cost of borrowing, ascending
  lowestCost: string
  lowestEmi: string
  lowestUpfront: string
  lowestRate: string
  samePrincipal: boolean
  sameTenure: boolean
  /** True when the lowest headline rate is NOT the cheapest overall. */
  rateMisleads: boolean
}

export function compareOffers(offers: Offer[], taxOnChargesPct: number): Comparison {
  const results = offers.map((o) => ({
    offer: o,
    cost: trueCost({ principal: o.principal, annualRate: o.rate, months: o.months }, o.charges, taxOnChargesPct),
  }))
  results.sort((a, b) => a.cost.costOfBorrowing - b.cost.costOfBorrowing)
  const by = (f: (r: OfferResult) => number) => results.reduce((best, r) => (f(r) < f(best) ? r : best)).offer.id
  const lowestCost = results[0].offer.id
  const lowestRate = by((r) => r.offer.rate)
  return {
    results,
    lowestCost,
    lowestEmi: by((r) => r.cost.schedule.emi),
    lowestUpfront: by((r) => r.cost.upfront.total),
    lowestRate,
    samePrincipal: new Set(offers.map((o) => o.principal)).size === 1,
    sameTenure: new Set(offers.map((o) => o.months)).size === 1,
    rateMisleads: lowestRate !== lowestCost,
  }
}

/* ------------------------------------------------------------------ */
/* Rate sensitivity and rate-rise strategies                           */
/* ------------------------------------------------------------------ */

export interface SensitivityRow {
  rate: number
  emi: number
  totalInterest: number
  deltaEmi: number
  deltaInterest: number
}

export function rateSensitivity(principal: number, months: number, baseRate: number, steps = [-0.5, -0.25, 0, 0.25, 0.5, 1, 1.5, 2]): SensitivityRow[] {
  const base = schedule({ principal, annualRate: baseRate, months })
  return steps.map((d) => {
    const rate = r2(baseRate + d)
    const s = schedule({ principal, annualRate: rate, months })
    return {
      rate,
      emi: s.emi,
      totalInterest: s.totalInterest,
      deltaEmi: s.emi - base.emi,
      deltaInterest: r2(s.totalInterest - base.totalInterest),
    }
  })
}

export interface RateRiseOption {
  key: 'keepEmi' | 'keepTenure' | 'prepay'
  label: string
  emi: number
  months: number
  totalInterest: number
  cashToday: number
  feasible: boolean
}

export interface RateRiseResult {
  before: ScheduleResult
  options: RateRiseOption[]
}

export function rateRise(balance: number, oldRate: number, newRate: number, remainingMonths: number, currentEmi?: number): RateRiseResult {
  const e = currentEmi ?? emi(balance, oldRate, remainingMonths)
  const before = schedule({ principal: balance, annualRate: oldRate, months: remainingMonths, emi: e })
  const n = tenureFor(balance, newRate, e)
  const keepEmiS = Number.isFinite(n) ? schedule({ principal: balance, annualRate: newRate, months: n, emi: e }) : null
  const keepTen = schedule({ principal: balance, annualRate: newRate, months: remainingMonths })
  const neededPrepay = Math.max(0, Math.ceil(balance - principalFor(e, newRate, remainingMonths)))
  const prepayS = schedule({ principal: balance - neededPrepay, annualRate: newRate, months: remainingMonths, emi: e })
  return {
    before,
    options: [
      {
        key: 'keepEmi',
        label: 'Keep EMI, accept a longer tenure',
        emi: e,
        months: keepEmiS?.months ?? Infinity,
        totalInterest: keepEmiS?.totalInterest ?? Infinity,
        cashToday: 0,
        feasible: !!keepEmiS && keepEmiS.months <= 600,
      },
      { key: 'keepTenure', label: 'Keep tenure, pay a higher EMI', emi: keepTen.emi, months: keepTen.months, totalInterest: keepTen.totalInterest, cashToday: 0, feasible: true },
      {
        key: 'prepay',
        label: 'Prepay enough to keep both unchanged',
        emi: e,
        months: prepayS.months,
        totalInterest: prepayS.totalInterest,
        cashToday: neededPrepay,
        feasible: true,
      },
    ],
  }
}

/* ------------------------------------------------------------------ */
/* Foreclosure                                                          */
/* ------------------------------------------------------------------ */

export interface ForeclosureInput {
  balance: number
  rate: number
  remainingMonths: number
  emi?: number
  chargePct: number
  taxOnChargesPct: number
  cashAvailable: number
  monthlyEssentials: number
  alternativeReturnPct: number
}

export interface ForeclosureResult {
  closingAmount: number
  charges: number
  interestAvoided: number
  netBenefit: number
  /** Annualised return earned by using cash to close the loan. */
  effectiveReturn: number
  cashLeft: number
  monthsOfExpensesLeft: number
  affordable: boolean
  beatsAlternative: boolean
}

export function foreclosure(i: ForeclosureInput): ForeclosureResult {
  const s = schedule({ principal: i.balance, annualRate: i.rate, months: i.remainingMonths, emi: i.emi })
  const charges = r2(((i.balance * i.chargePct) / 100) * (1 + i.taxOnChargesPct / 100))
  const closingAmount = r2(i.balance + charges)
  const flows = [-closingAmount, ...s.rows.map((r) => r.payment)]
  const m = irr(flows)
  const effectiveReturn = Number.isNaN(m) ? NaN : m * 12 * 100
  const cashLeft = r2(i.cashAvailable - closingAmount)
  return {
    closingAmount,
    charges,
    interestAvoided: s.totalInterest,
    netBenefit: r2(s.totalInterest - charges),
    effectiveReturn,
    cashLeft,
    monthsOfExpensesLeft: i.monthlyEssentials > 0 ? cashLeft / i.monthlyEssentials : Infinity,
    affordable: cashLeft >= 0,
    beatsAlternative: effectiveReturn >= i.alternativeReturnPct,
  }
}

/* ------------------------------------------------------------------ */
/* Liquidity check for prepayments                                     */
/* ------------------------------------------------------------------ */

export interface Liquidity {
  cashAfter: number
  monthsCovered: number
  bufferTargetMonths: number
  shortfall: number
  status: 'ok' | 'thin' | 'short'
}

export function liquidityAfter(cashAvailable: number, spend: number, monthlyEssentials: number, bufferMonths: number): Liquidity {
  const cashAfter = cashAvailable - spend
  const monthsCovered = monthlyEssentials > 0 ? cashAfter / monthlyEssentials : Infinity
  const target = monthlyEssentials * bufferMonths
  const shortfall = Math.max(0, target - cashAfter)
  const status = cashAfter < 0 ? 'short' : shortfall > 0 ? 'thin' : 'ok'
  return { cashAfter, monthsCovered, bufferTargetMonths: bufferMonths, shortfall, status }
}
