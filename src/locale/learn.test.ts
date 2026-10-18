// Guards the illustrative numbers quoted in the Learn section so copy and maths can't drift apart.
import { describe, expect, it } from 'vitest'
import { emi, emiExact, rateFor, schedule } from '../core/amortize'
import { trueCost } from '../core/cost'

describe('learn-centre examples', () => {
  it('EMI example: ₹30L, 8.5%, 20y', () => {
    expect(emi(3_000_000, 8.5, 240)).toBeCloseTo(26035, -1)
    expect((3_000_000 * 8.5) / 1200).toBe(21250)
  })
  it('first year of a 20-year loan is ~80% interest', () => {
    const s = schedule({ principal: 3_000_000, annualRate: 8.5, months: 240 })
    const y1 = s.rows.slice(0, 12)
    const share = y1.reduce((a, r) => a + r.interest, 0) / y1.reduce((a, r) => a + r.payment, 0)
    expect(share).toBeGreaterThan(0.78)
    expect(share).toBeLessThan(0.84)
  })
  it('7% flat over 2 years ≈ 13% reducing', () => {
    const flatEmi = (100_000 * (1 + 0.07 * 2)) / 24
    expect(rateFor(100_000, flatEmi, 24)).toBeGreaterThan(12.5)
    expect(rateFor(100_000, flatEmi, 24)).toBeLessThan(13.5)
  })
  it('prepaying ₹3L on ₹30L/8.5%/15y saves ₹6–7L keeping EMI', () => {
    const b = schedule({ principal: 3_000_000, annualRate: 8.5, months: 180 })
    const p = schedule({ principal: 3_000_000, annualRate: 8.5, months: 180, prepayments: [{ at: 0, amount: 300_000 }] })
    const saved = b.totalInterest - p.totalInterest
    expect(saved).toBeGreaterThan(600_000)
    expect(saved).toBeLessThan(700_000)
  })
  it('10% with 2% fee over 5 years ≈ 10.8% all-in', () => {
    const t = trueCost({ principal: 1_000_000, annualRate: 10, months: 60 }, { processingFee: 2, processingFeeIsPct: true, otherCharges: 0, insurance: 0 }, 0)
    expect(t.allInRate).toBeGreaterThan(10.7)
    expect(t.allInRate).toBeLessThan(10.95)
  })
  it('tenure example: 15y vs 25y on ₹30L at 8.5%', () => {
    expect(emiExact(3_000_000, 8.5, 180)).toBeCloseTo(29542, -2)
    expect(emiExact(3_000_000, 8.5, 300)).toBeCloseTo(24157, -2)
    const i15 = schedule({ principal: 3_000_000, annualRate: 8.5, months: 180 }).totalInterest
    const i25 = schedule({ principal: 3_000_000, annualRate: 8.5, months: 300 }).totalInterest
    expect(i15 / 1e5).toBeCloseTo(23.2, 0)
    expect(i25 / 1e5).toBeCloseTo(42.5, 0)
  })
})
