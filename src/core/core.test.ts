import { describe, expect, it } from 'vitest'
import { byYear, emi, emiExact, principalFor, rateFor, schedule, tenureFor } from './amortize'
import { irr, trueCost, upfrontCosts } from './cost'
import { analysePrepayment, compareOffers, foreclosure, optimizerScenarios, rateRise, rateSensitivity, refinance } from './scenarios'
import { affordability, classify, stressTest } from './household'

const sumP = (xs: number[]) => Math.round(xs.reduce((s, x) => s + Math.round(x * 100), 0)) / 100

describe('EMI', () => {
  it('matches published reference values', () => {
    expect(emiExact(5_000_000, 8.5, 240)).toBeCloseTo(43391.16, 1)
    expect(emiExact(1_000_000, 10, 60)).toBeCloseTo(21247.04, 1)
    expect(emiExact(100_000, 12, 12)).toBeCloseTo(8884.88, 1)
  })
  it('rounds EMI up to a whole unit', () => {
    expect(emi(5_000_000, 8.5, 240)).toBe(43392)
  })
  it('handles zero interest', () => {
    expect(emiExact(120_000, 0, 12)).toBe(10_000)
    const s = schedule({ principal: 120_000, annualRate: 0, months: 12 })
    expect(s.totalInterest).toBe(0)
    expect(s.months).toBe(12)
  })
  it('inverse functions agree', () => {
    const e = emiExact(3_000_000, 9, 180)
    expect(principalFor(e, 9, 180)).toBeCloseTo(3_000_000, 2)
    expect(rateFor(3_000_000, e, 180)).toBeCloseTo(9, 4)
    expect(tenureFor(3_000_000, 9, Math.ceil(e))).toBe(180)
    expect(tenureFor(1_000_000, 12, 10_000)).toBe(Infinity) // EMI equals interest
  })
})

describe('amortisation', () => {
  const s = schedule({ principal: 5_000_000, annualRate: 8.5, months: 240 })
  it('ends exactly at zero within term', () => {
    expect(s.months).toBe(240)
    expect(s.rows[s.rows.length - 1].closing).toBe(0)
  })
  it('reconciles principal, interest and payments to the paisa', () => {
    expect(sumP(s.rows.map((r) => r.principal))).toBe(5_000_000)
    expect(sumP(s.rows.map((r) => r.interest))).toBe(s.totalInterest)
    expect(Math.round((s.totalPayments - 5_000_000) * 100) / 100).toBe(s.totalInterest)
  })
  it('every row balances', () => {
    for (const r of s.rows) {
      expect(Math.abs(Math.round((r.opening - r.prepayment - r.principal - r.closing) * 100))).toBe(0)
      expect(Math.abs(Math.round((r.payment - r.interest - r.principal) * 100))).toBe(0)
    }
  })
  it('first month interest is balance × monthly rate', () => {
    expect(s.rows[0].interest).toBeCloseTo((5_000_000 * 0.085) / 12, 2)
  })
  it('total interest close to the closed-form value (slightly lower: EMI is rounded up)', () => {
    const closed = 43391.16 * 240 - 5_000_000
    expect(s.totalInterest).toBeLessThan(closed)
    expect(closed - s.totalInterest).toBeLessThan(1000)
  })
  it('yearly grouping preserves totals', () => {
    const y = byYear(s.rows)
    expect(y).toHaveLength(20)
    expect(sumP(y.map((x) => x.interest))).toBe(s.totalInterest)
    expect(y[19].closing).toBe(0)
  })
  it('balloon is settled at contract end', () => {
    const b = schedule({ principal: 800_000, annualRate: 9, months: 60, balloon: 200_000 })
    expect(b.months).toBe(60)
    expect(b.rows[59].closing).toBe(0)
    expect(b.rows[59].payment).toBeGreaterThan(200_000)
    expect(b.emi).toBeLessThan(emi(800_000, 9, 60))
  })
})

describe('prepayment', () => {
  const base = { principal: 3_000_000, annualRate: 8.5, months: 180 }
  it('reduce-tenure saves more interest than reduce-EMI', () => {
    const a = analysePrepayment(base, [{ at: 0, amount: 300_000 }])
    expect(a.tenure.interestSaved).toBeGreaterThan(a.emi.interestSaved)
    expect(a.tenure.monthsSaved).toBeGreaterThan(0)
    expect(a.emi.monthsSaved).toBe(0)
    expect(a.newEmi).toBeLessThan(a.base.emi)
    expect(a.newEmi).toBe(emi(2_700_000, 8.5, 180))
  })
  it('prepaid money earns about the loan rate', () => {
    const a = analysePrepayment(base, [{ at: 0, amount: 300_000 }])
    expect(a.effectiveReturn).toBeCloseTo(8.5, 0)
  })
  it('multiple prepayments accumulate', () => {
    const one = analysePrepayment(base, [{ at: 0, amount: 100_000 }])
    const many = analysePrepayment(base, [
      { at: 0, amount: 100_000 },
      { at: 12, amount: 100_000 },
      { at: 24, amount: 200_000 },
    ])
    expect(many.tenure.interestSaved).toBeGreaterThan(one.tenure.interestSaved)
    expect(many.tenure.schedule.totalPrepayments).toBe(400_000)
    expect(sumP(many.tenure.schedule.rows.map((r) => r.principal + r.prepayment))).toBe(3_000_000)
  })
  it('prepayment larger than balance closes the loan', () => {
    const s = schedule({ ...base, prepayments: [{ at: 0, amount: 5_000_000 }] })
    expect(s.totalPrepayments).toBe(3_000_000)
    expect(s.totalInterest).toBe(0)
  })
  it('extra EMI and step-up shorten the loan', () => {
    const { base: b, scenarios } = optimizerScenarios({
      base,
      lumpSum: 200_000,
      extraMonthly: 5000,
      annualStepUpPct: 5,
      prepayMode: 'tenure',
    })
    expect(scenarios.map((s) => s.key)).toEqual(['lump', 'extra', 'stepup', 'combined'])
    for (const s of scenarios) expect(s.schedule.months).toBeLessThan(b.months)
    const combined = scenarios.find((s) => s.key === 'combined')!
    expect(combined.interestSaved).toBeGreaterThan(Math.max(...scenarios.filter((s) => s.key !== 'combined').map((s) => s.interestSaved)))
  })
})

describe('rate changes', () => {
  it('keep-tenure recomputes EMI at the reset', () => {
    const s = schedule({ principal: 3_000_000, annualRate: 8, months: 180, rateChanges: [{ at: 12, rate: 8.5 }], rateChangeMode: 'emi' })
    expect(s.months).toBe(180)
    expect(s.rows[12].payment).toBeGreaterThan(s.rows[11].payment)
  })
  it('keep-EMI extends tenure', () => {
    const s = schedule({ principal: 3_000_000, annualRate: 8, months: 180, rateChanges: [{ at: 12, rate: 8.5 }], rateChangeMode: 'tenure' })
    expect(s.months).toBeGreaterThan(180)
  })
  it('flags and repairs negative amortisation', () => {
    const s = schedule({ principal: 3_000_000, annualRate: 8, months: 300, rateChanges: [{ at: 0, rate: 13 }], rateChangeMode: 'tenure' })
    expect(s.emiAdjustedForNegativeAmortization).toBe(true)
    expect(s.rows[s.rows.length - 1].closing).toBe(0)
  })
  it('rate-rise options are coherent', () => {
    const r = rateRise(3_000_000, 8, 8.5, 180)
    const [keepEmi, keepTen, prepay] = r.options
    expect(keepEmi.months).toBeGreaterThan(180)
    expect(keepTen.emi).toBeGreaterThan(r.before.emi)
    expect(prepay.cashToday).toBeGreaterThan(0)
    expect(prepay.months).toBeLessThanOrEqual(180)
  })
  it('sensitivity is monotonic', () => {
    const rows = rateSensitivity(5_000_000, 240, 8.25)
    for (let i = 1; i < rows.length; i++) expect(rows[i].emi).toBeGreaterThan(rows[i - 1].emi)
    expect(rows.find((r) => r.rate === 8.25)!.deltaEmi).toBe(0)
  })
})

describe('fees, tax and all-in rate', () => {
  it('applies tax only to lender charges', () => {
    const u = upfrontCosts(1_000_000, { processingFee: 1, processingFeeIsPct: true, otherCharges: 5000, insurance: 20_000 }, 18)
    expect(u.processing).toBe(10_000)
    expect(u.taxOnCharges).toBe(2700)
    expect(u.total).toBe(10_000 + 5000 + 2700 + 20_000)
  })
  it('all-in rate equals nominal with no fees and exceeds it with fees', () => {
    const none = trueCost({ principal: 1_000_000, annualRate: 10, months: 60 }, { processingFee: 0, processingFeeIsPct: false, otherCharges: 0, insurance: 0 }, 18)
    expect(none.allInRate).toBeCloseTo(10, 1)
    const fees = trueCost({ principal: 1_000_000, annualRate: 10, months: 60 }, { processingFee: 2, processingFeeIsPct: true, otherCharges: 0, insurance: 0 }, 18)
    expect(fees.allInRate).toBeGreaterThan(10.7)
    expect(fees.totalOutflow).toBeCloseTo(1_000_000 + fees.interest + 23_600, 2)
  })
  it('irr of a simple flow', () => {
    expect(irr([-100, 110])).toBeCloseTo(0.1, 6)
  })
})

describe('comparison', () => {
  it('ranks by total cost, not headline rate', () => {
    const c = compareOffers(
      [
        { id: 'A', name: 'A', principal: 3_000_000, rate: 8.25, months: 60, charges: { processingFee: 120_000, processingFeeIsPct: false, otherCharges: 0, insurance: 0 } },
        { id: 'B', name: 'B', principal: 3_000_000, rate: 8.4, months: 60, charges: { processingFee: 25_000, processingFeeIsPct: false, otherCharges: 0, insurance: 0 } },
      ],
      18,
    )
    expect(c.lowestRate).toBe('A')
    expect(c.lowestCost).toBe('B')
    expect(c.rateMisleads).toBe(true)
    expect(c.lowestUpfront).toBe('B')
    expect(c.lowestEmi).toBe('A')
  })
})

describe('refinance', () => {
  const base = {
    balance: 3_000_000,
    currentRate: 9,
    remainingMonths: 180,
    newMonths: 180,
    newLenderCharges: { processingFee: 0.5, processingFeeIsPct: true, otherCharges: 10_000, insurance: 0 },
    foreclosureChargePct: 0,
    taxOnChargesPct: 18,
  }
  it('break-even exists for a meaningful rate drop', () => {
    const r = refinance({ ...base, newRate: 8.25 })
    expect(r.switchingCosts).toBeCloseTo((15_000 + 10_000) * 1.18, 2)
    expect(r.monthlySaving).toBeGreaterThan(0)
    expect(r.breakEvenMonth).not.toBeNull()
    expect(r.breakEvenMonth!).toBeLessThan(24)
    expect(r.netSaving).toBeGreaterThan(0)
  })
  it('no break-even when the new rate is not lower', () => {
    const r = refinance({ ...base, newRate: 9 })
    expect(r.breakEvenMonth).toBeNull()
    expect(r.netSaving).toBeLessThan(0)
  })
})

describe('foreclosure', () => {
  it('earns the loan rate before charges and less after', () => {
    const f0 = foreclosure({ balance: 500_000, rate: 9, remainingMonths: 36, chargePct: 0, taxOnChargesPct: 18, cashAvailable: 1_000_000, monthlyEssentials: 50_000, alternativeReturnPct: 7 })
    expect(f0.effectiveReturn).toBeCloseTo(9, 0)
    const f = foreclosure({ balance: 500_000, rate: 9, remainingMonths: 36, chargePct: 3, taxOnChargesPct: 18, cashAvailable: 600_000, monthlyEssentials: 50_000, alternativeReturnPct: 7 })
    expect(f.effectiveReturn).toBeLessThan(f0.effectiveReturn)
    expect(f.charges).toBeCloseTo(17_700, 2)
    expect(f.monthsOfExpensesLeft).toBeCloseTo((600_000 - 517_700) / 50_000, 5)
  })
})

describe('household', () => {
  const policy = { lenderCapPct: 50, comfortablePct: 35, comfortableSurplusPct: 60, conservativePct: 25, conservativeSurplusPct: 40, perDependentPct: 2.5, emergencyMonths: 6 }
  const h = { monthlyIncome: 150_000, existingEmis: 10_000, monthlyEssentials: 50_000, otherObligations: 5000, dependents: 2, emergencyFund: 300_000 }
  it('orders levels lender >= comfortable >= conservative', () => {
    const a = affordability(h, 8.5, 240, policy)
    const [l, c, k] = a.levels
    expect(l.emi).toBeGreaterThanOrEqual(c.emi)
    expect(c.emi).toBeGreaterThanOrEqual(k.emi)
    expect(c.loan).toBeLessThanOrEqual(principalFor(c.emi, 8.5, 240))
  })
  it('stress test classifies', () => {
    const p = { watchSharePct: 35, stretchedSharePct: 45, highRiskSharePct: 55, minBufferMonths: 3 }
    expect(classify(20, 10_000, 6, p)).toBe('Comfortable')
    expect(classify(40, 10_000, 6, p)).toBe('Watch')
    expect(classify(50, 10_000, 6, p)).toBe('Stretched')
    expect(classify(30, -1, 6, p)).toBe('High risk')
    const rows = stressTest({ balance: 3_000_000, rate: 8.5, months: 180 }, h, [{ key: 'b', label: 'b' }, { key: 'r', label: 'r', rateDelta: 1 }], p)
    expect(rows[1].emi).toBeGreaterThan(rows[0].emi)
  })
})
