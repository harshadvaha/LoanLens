/**
 * Independent verification of the loan engine.
 *
 * Everything here is re-derived from first principles in plain floating point, without importing
 * the engine's helpers, and compared against the engine across hundreds of random loans.
 * Hard-coded expected values were computed separately with numpy-financial (pmt / irr).
 */
import { describe, expect, it } from 'vitest'
import { emi, emiExact, principalFor, rateFor, schedule, tenureFor } from './amortize'
import { trueCost } from './cost'
import { analysePrepayment, compareOffers, optimizerScenarios, refinance } from './scenarios'
import { affordability } from './household'
import { locale } from '../locale'

/* ---------- reference implementations (float, no shared code) ---------- */
const refPmt = (P: number, annual: number, n: number) => {
  const r = annual / 1200
  return r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n))
}

/** Simulate a loan month by month in floats with the documented rules (EMI rounded up, events "after N instalments"). */
function refSim(o: {
  P: number
  rate: number
  n: number
  emi?: number
  prepay?: { at: number; amount: number }[]
  extra?: number
  stepUp?: number
  mode?: 'tenure' | 'emi'
}) {
  let bal = o.P
  let E = o.emi ?? Math.ceil(refPmt(o.P, o.rate, o.n) - 1e-9)
  const r = o.rate / 1200
  let interest = 0
  let paid = 0
  let pre = 0
  let m = 0
  while (bal > 1e-6 && m < 1200) {
    const p = (o.prepay ?? []).filter((x) => x.at === m).reduce((s, x) => s + x.amount, 0)
    if (p > 0) {
      const used = Math.min(p, bal)
      bal -= used
      pre += used
      if (bal <= 1e-6) break
      if (o.mode === 'emi') E = Math.ceil(refPmt(bal, o.rate, Math.max(1, o.n - m)) - 1e-9)
    }
    if (o.stepUp && m > 0 && m % 12 === 0) E = Math.ceil(E * (1 + o.stepUp / 100))
    const i = bal * r
    const pay = Math.min(E + (o.extra ?? 0), bal + i)
    interest += i
    paid += pay
    bal = bal + i - pay
    m++
  }
  return { months: m, interest, paid, pre }
}

/** Plain Newton/bisection IRR, written separately from the engine's. */
function refIrr(flows: number[]) {
  const f = (r: number) => flows.reduce((s, c, t) => s + c / (1 + r) ** t, 0)
  let lo = -0.5
  let hi = 0.5
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2
    if (f(lo) * f(mid) <= 0) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

/* Deterministic random numbers so failures are reproducible. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}
const rand = rng(20261018)
const between = (a: number, b: number) => a + (b - a) * rand()
const randomLoan = () => ({
  P: Math.round(between(20_000, 20_000_000) / 1000) * 1000,
  rate: Math.round(between(0, 30) * 20) / 20,
  n: Math.round(between(6, 360)),
})

/* ------------------------------------------------------------------ */

describe('EMI matches published bank-calculator values (numpy-financial pmt)', () => {
  const cases: [number, number, number, number][] = [
    [100_000, 10, 12, 8791.59],
    [5_000_000, 8.5, 240, 43391.16],
    [1_000_000, 9, 60, 20758.36],
    [500_000, 12, 48, 13166.92],
    [3_000_000, 8.5, 180, 29542.19],
  ]
  it.each(cases)('₹%d at %d%% for %d months → ₹%d', (P, r, n, expected) => {
    expect(emiExact(P, r, n)).toBeCloseTo(expected, 2)
    expect(emi(P, r, n)).toBe(Math.ceil(expected))
  })
})

describe('random loans: engine vs independent float simulation', () => {
  const loans = Array.from({ length: 300 }, randomLoan)

  it('exact EMI equals the closed-form annuity payment', () => {
    for (const l of loans) expect(emiExact(l.P, l.rate, l.n)).toBeCloseTo(refPmt(l.P, l.rate, l.n), 6)
  })

  it('present value of the EMIs equals the loan (the defining property)', () => {
    for (const l of loans) {
      const r = l.rate / 1200
      const e = emiExact(l.P, l.rate, l.n)
      const pv = r === 0 ? e * l.n : e * ((1 - (1 + r) ** -l.n) / r)
      expect(Math.abs(pv - l.P)).toBeLessThan(0.01)
    }
  })

  it('schedule: same number of months, interest within paisa rounding, and fully reconciles', () => {
    for (const l of loans) {
      const s = schedule({ principal: l.P, annualRate: l.rate, months: l.n })
      const ref = refSim(l)
      expect(s.months).toBe(ref.months)
      expect(s.months).toBeLessThanOrEqual(l.n)
      // Engine rounds interest to the paisa each month (as lenders do). A half-paisa error compounds at the
      // loan rate, so the provable bound is 0.005 × Σ(1+r)^k. For normal loans that is a few rupees.
      const r = l.rate / 1200
      const bound = r === 0 ? 1 : 0.005 * ((Math.pow(1 + r, s.months) - 1) / r) + 1
      expect(Math.abs(s.totalInterest - ref.interest)).toBeLessThan(bound)
      if (l.rate <= 15) expect(Math.abs(s.totalInterest - ref.interest)).toBeLessThan(10)
      // principal + interest = everything paid, exactly
      expect(Math.round((s.totalPrincipal + s.totalInterest) * 100)).toBe(Math.round(s.totalOutflow * 100))
      expect(s.totalPrincipal).toBeCloseTo(l.P, 2)
      expect(s.rows[s.rows.length - 1].closing).toBe(0)
      // no row ever pays more than the standard EMI, and balances never go negative or up
      for (const row of s.rows) {
        expect(row.payment).toBeLessThanOrEqual(s.emi + 1e-9)
        expect(row.closing).toBeGreaterThanOrEqual(0)
        expect(row.closing).toBeLessThanOrEqual(row.opening)
      }
    }
  })

  it('prepayments (reduce tenure), extra EMI and yearly step-up match the reference', () => {
    for (const l of loans.slice(0, 150)) {
      const prepay = [
        { at: 0, amount: Math.round(l.P * 0.1) },
        { at: Math.min(l.n - 1, 24), amount: Math.round(l.P * 0.05) },
      ]
      const extra = Math.round(emi(l.P, l.rate, l.n) * 0.1)
      const s = schedule({ principal: l.P, annualRate: l.rate, months: l.n, prepayments: prepay, extraMonthly: extra, annualStepUpPct: 5 })
      const ref = refSim({ ...l, prepay, extra, stepUp: 5 })
      expect(Math.abs(s.months - ref.months)).toBeLessThanOrEqual(1)
      expect(Math.abs(s.totalInterest - ref.interest)).toBeLessThan(Math.max(5, ref.interest * 0.001))
      expect(s.totalPrepayments).toBeCloseTo(ref.pre, 0)
      expect(s.totalPrincipal).toBeCloseTo(l.P, 2)
    }
  })

  it('prepayments that reduce EMI keep the tenure and lower the EMI', () => {
    for (const l of loans.slice(0, 100).filter((x) => x.n > 30)) {
      const prepay = [{ at: 12, amount: Math.round(l.P * 0.2) }]
      const s = schedule({ principal: l.P, annualRate: l.rate, months: l.n, prepayments: prepay, prepayMode: 'emi' })
      const ref = refSim({ ...l, prepay, mode: 'emi' })
      // EMI is rounded up to the rupee, so very long, very high-rate loans can finish a month or two early
      expect(s.months).toBeLessThanOrEqual(l.n)
      expect(s.months).toBeGreaterThanOrEqual(l.n - (l.rate > 20 && l.n > 240 ? 3 : 1))
      expect(Math.abs(s.months - ref.months)).toBeLessThanOrEqual(1)
      expect(Math.abs(s.totalInterest - ref.interest)).toBeLessThan(Math.max(5, ref.interest * 0.002))
      expect(s.rows[13].payment).toBeLessThan(s.rows[5].payment)
    }
  })

  it('tenureFor is the exact number of instalments the schedule takes', () => {
    for (const l of loans.filter((x) => x.rate > 0)) {
      const E = Math.ceil(refPmt(l.P, l.rate, l.n) * 1.15)
      const s = schedule({ principal: l.P, annualRate: l.rate, months: l.n, emi: E })
      expect(tenureFor(l.P, l.rate, E)).toBe(s.months)
    }
  })

  it('rateFor and principalFor invert the EMI formula', () => {
    for (const l of loans.filter((x) => x.rate > 0.5)) {
      const e = refPmt(l.P, l.rate, l.n)
      expect(rateFor(l.P, e, l.n)).toBeCloseTo(l.rate, 4)
      expect(principalFor(e, l.rate, l.n)).toBeCloseTo(l.P, 2)
    }
  })
})

describe('all-in rate (APR-style IRR after charges)', () => {
  it('₹10L, 10%, 5 years, 2% fee + 18% GST → 11.04% (numpy-financial irr)', () => {
    const t = trueCost({ principal: 1_000_000, annualRate: 10, months: 60 }, { processingFee: 2, processingFeeIsPct: true, otherCharges: 0, insurance: 0 }, 18)
    expect(t.upfront.total).toBeCloseTo(23_600, 2)
    expect(t.allInRate).toBeCloseTo(11.036, 2)
  })

  it('with no charges, the all-in rate equals the quoted rate (EMI rounding aside)', () => {
    for (let k = 0; k < 60; k++) {
      const l = randomLoan()
      if (l.rate < 1) continue
      const t = trueCost({ principal: l.P, annualRate: l.rate, months: l.n }, { processingFee: 0, processingFeeIsPct: false, otherCharges: 0, insurance: 0 }, 18)
      expect(Math.abs(t.allInRate - l.rate)).toBeLessThan(0.05)
    }
  })

  it('matches an independently computed IRR on random loans with fees', () => {
    for (let k = 0; k < 60; k++) {
      const l = randomLoan()
      if (l.rate < 1) continue
      const fee = Math.round(l.P * 0.015)
      const t = trueCost({ principal: l.P, annualRate: l.rate, months: l.n }, { processingFee: fee, processingFeeIsPct: false, otherCharges: 5000, insurance: 0 }, 18)
      const flows = [l.P - (fee + 5000) * 1.18, ...t.schedule.rows.map((r) => -r.payment)]
      expect(t.allInRate).toBeCloseTo(refIrr(flows) * 1200, 2)
      expect(t.allInRate).toBeGreaterThan(l.rate)
    }
  })

  it('GST applies to processing and other charges but not to insurance', () => {
    const t = trueCost({ principal: 1_000_000, annualRate: 10, months: 60 }, { processingFee: 10_000, processingFeeIsPct: false, otherCharges: 5_000, insurance: 20_000 }, locale.chargeTax.pct)
    expect(t.upfront.taxOnCharges).toBeCloseTo(15_000 * 0.18, 2)
    expect(t.upfront.total).toBeCloseTo(10_000 + 5_000 + 2_700 + 20_000, 2)
    expect(t.costOfBorrowing).toBeCloseTo(t.interest + t.upfront.total, 2)
  })
})

describe('flat rate conversion', () => {
  it('7% flat for 24 months ≈ 13% reducing (same EMI)', () => {
    const P = 100_000
    const flatEmi = (P * (1 + 0.07 * 2)) / 24
    const r = rateFor(P, flatEmi, 24)
    expect(r).toBeGreaterThan(12.9)
    expect(r).toBeLessThan(13.3)
    expect(refPmt(P, r, 24)).toBeCloseTo(flatEmi, 4)
  })
})

describe('scenario tools agree with direct simulation', () => {
  it('prepayment analysis: interest saved = base interest − interest with prepayment', () => {
    const base = { principal: 3_000_000, annualRate: 8.5, months: 180 }
    const a = analysePrepayment(base, [{ at: 0, amount: 300_000 }])
    const b = schedule(base)
    const t = schedule({ ...base, prepayments: [{ at: 0, amount: 300_000 }] })
    expect(a.tenure.interestSaved).toBeCloseTo(b.totalInterest - t.totalInterest, 2)
    expect(a.tenure.interestSaved).toBeGreaterThan(a.emi.interestSaved) // reducing tenure saves more
  })

  it('optimizer: every scenario saves interest vs continuing, and "all" saves the most', () => {
    const { base, scenarios } = optimizerScenarios({
      base: { principal: 3_000_000, annualRate: 8.5, months: 180 },
      lumpSum: 200_000,
      extraMonthly: 3000,
      annualStepUpPct: 5,
      scheduled: [12, 24, 36].map((at) => ({ at, amount: 100_000 })),
      prepayMode: 'tenure',
    })
    for (const s of scenarios) {
      expect(s.interestSaved).toBeGreaterThan(0)
      expect(s.schedule.totalPrincipal).toBeCloseTo(base.totalPrincipal, 2)
    }
    const all = scenarios.find((s) => s.key === 'combined')!
    for (const s of scenarios) expect(all.interestSaved).toBeGreaterThanOrEqual(s.interestSaved - 0.01)
  })

  it('refinance: break-even month is the first month the independently computed net position turns positive', () => {
    const i = {
      balance: 4_000_000,
      currentRate: 9.5,
      remainingMonths: 200,
      newRate: 8.4,
      newMonths: 200,
      newLenderCharges: { processingFee: 10_000, processingFeeIsPct: false, otherCharges: 15_000, insurance: 0 },
      foreclosureChargePct: 0,
      taxOnChargesPct: 18,
    }
    const r = refinance(i)
    const costs = 25_000 * 1.18
    const cur = schedule({ principal: i.balance, annualRate: 9.5, months: 200 })
    const nxt = schedule({ principal: i.balance, annualRate: 8.4, months: 200 })
    let cc = 0
    let cn = 0
    let be: number | null = null
    for (let t = 0; t < 200; t++) {
      cc += cur.rows[t].payment
      cn += nxt.rows[t].payment
      const net = cc - cn + (cur.rows[t].closing - nxt.rows[t].closing) - costs
      if (be === null && net >= 0) be = t + 1
    }
    expect(r.switchingCosts).toBeCloseTo(costs, 2)
    expect(r.breakEvenMonth).toBe(be)
    expect(r.netSaving).toBeCloseTo(cur.totalInterest - nxt.totalInterest - costs, 1)
  })

  it('refinance into a much longer tenure is not shown as an early win', () => {
    const r = refinance({
      balance: 2_000_000,
      currentRate: 9,
      remainingMonths: 120,
      newRate: 8.8,
      newMonths: 240,
      newLenderCharges: { processingFee: 0, processingFeeIsPct: false, otherCharges: 0, insurance: 0 },
      foreclosureChargePct: 0,
      taxOnChargesPct: 18,
    })
    expect(r.monthlySaving).toBeGreaterThan(0) // lower EMI…
    expect(r.netSaving).toBeLessThan(0) // …but more interest overall
  })

  it('offer comparison ranks by total cost of borrowing, not by headline rate', () => {
    const c = compareOffers(
      [
        { id: 'a', name: 'Low rate, high fee', principal: 1_000_000, rate: 10, months: 36, charges: { processingFee: 3, processingFeeIsPct: true, otherCharges: 0, insurance: 0 } },
        { id: 'b', name: 'Higher rate, no fee', principal: 1_000_000, rate: 10.5, months: 36, charges: { processingFee: 0, processingFeeIsPct: false, otherCharges: 0, insurance: 0 } },
      ],
      18,
    )
    const costs = c.results.map((r) => r.cost.costOfBorrowing)
    expect(costs[0]).toBeLessThanOrEqual(costs[1])
    expect(c.results[0].offer.id).toBe('b')
  })
})

describe('affordability', () => {
  it('comfortable EMI ≤ lender ceiling, and the loan is what that EMI services', () => {
    const p = locale.affordability
    const r = affordability({ monthlyIncome: 150_000, existingEmis: 10_000, monthlyEssentials: 50_000, otherObligations: 5_000, dependents: 2, emergencyFund: 300_000 }, 8.5, 240, p)
    const [lender, comfy, cons] = r.levels
    expect(comfy.emi).toBeLessThanOrEqual(lender.emi)
    expect(cons.emi).toBeLessThanOrEqual(comfy.emi)
    expect(lender.emi).toBe(Math.floor((150_000 * p.lenderCapPct) / 100 - 10_000))
    expect(Math.abs(refPmt(comfy.loan, 8.5, 240) - comfy.emi)).toBeLessThan(10) // loan rounded down to ₹1,000
  })
  it('no surplus → no comfortable EMI', () => {
    const r = affordability({ monthlyIncome: 50_000, existingEmis: 20_000, monthlyEssentials: 35_000, otherObligations: 0, dependents: 0, emergencyFund: 0 }, 9, 120, locale.affordability)
    expect(r.levels[1].emi).toBe(0)
    expect(r.levels[1].loan).toBe(0)
  })
})

describe('edge cases do not break the engine', () => {
  it('0% interest splits the loan evenly', () => {
    const s = schedule({ principal: 120_000, annualRate: 0, months: 12 })
    expect(s.emi).toBe(10_000)
    expect(s.totalInterest).toBe(0)
    expect(s.months).toBe(12)
  })
  it('a 1-month loan pays principal + one month of interest', () => {
    const s = schedule({ principal: 100_000, annualRate: 12, months: 1 })
    expect(s.months).toBe(1)
    expect(s.totalInterest).toBeCloseTo(1000, 2)
  })
  it('an EMI below the monthly interest is raised rather than looping forever', () => {
    const s = schedule({ principal: 1_000_000, annualRate: 12, months: 60, emi: 5000 })
    expect(s.emiAdjustedForNegativeAmortization).toBe(true)
    expect(s.hitTermCap).toBe(false)
    expect(s.rows[s.rows.length - 1].closing).toBe(0)
  })
  it('a prepayment larger than the balance closes the loan without overpaying', () => {
    const s = schedule({ principal: 100_000, annualRate: 10, months: 24, prepayments: [{ at: 6, amount: 10_000_000 }] })
    expect(s.totalPrincipal).toBeCloseTo(100_000, 2)
    expect(s.months).toBe(7)
  })
  it('balloon: final payment settles the residual and everything reconciles', () => {
    const s = schedule({ principal: 1_000_000, annualRate: 9, months: 48, balloon: 300_000 })
    expect(s.months).toBe(48)
    expect(s.rows[47].payment).toBeGreaterThan(300_000)
    expect(s.totalPrincipal).toBeCloseTo(1_000_000, 2)
    expect(emi(1_000_000, 9, 48, 300_000)).toBeLessThan(emi(1_000_000, 9, 48))
  })
  it('crore-scale loans stay exact (no float drift in paise simulation)', () => {
    const s = schedule({ principal: 50_000_000, annualRate: 8.75, months: 360 })
    expect(s.totalPrincipal).toBe(50_000_000)
    expect(Math.round((s.totalPrincipal + s.totalInterest) * 100)).toBe(Math.round(s.totalOutflow * 100))
  })
})
