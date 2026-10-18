/**
 * Affordability and stress testing. These use transparent rules of thumb,
 * passed in as a policy object so they can be tuned per country/user.
 * They are NOT lender eligibility rules.
 */
import { emi, principalFor } from './amortize'

export interface AffordabilityPolicy {
  /** Share of gross monthly income lenders commonly allow for all EMIs (FOIR-style). */
  lenderCapPct: number
  /** Comfortable: all EMIs within this share of income... */
  comfortablePct: number
  /** ...and the new EMI uses at most this share of monthly surplus. */
  comfortableSurplusPct: number
  conservativePct: number
  conservativeSurplusPct: number
  /** Reduce the comfortable share by this many percentage points per dependent. */
  perDependentPct: number
  /** Desired emergency fund, in months of essentials + EMIs. */
  emergencyMonths: number
}

export interface HouseholdInput {
  monthlyIncome: number
  existingEmis: number
  monthlyEssentials: number
  otherObligations: number
  dependents: number
  emergencyFund: number
}

export interface AffordabilityLevel {
  key: 'lender' | 'comfortable' | 'conservative'
  label: string
  emi: number
  loan: number
}

export interface AffordabilityResult {
  surplus: number
  levels: AffordabilityLevel[]
  emergencyTarget: number
  emergencyGap: number
  notes: string[]
}

export function affordability(h: HouseholdInput, rate: number, months: number, p: AffordabilityPolicy): AffordabilityResult {
  const surplus = h.monthlyIncome - h.existingEmis - h.monthlyEssentials - h.otherObligations
  const dep = Math.max(0, h.dependents) * p.perDependentPct
  const clamp = (x: number) => Math.max(0, Math.floor(x))
  const lenderEmi = clamp((h.monthlyIncome * p.lenderCapPct) / 100 - h.existingEmis)
  const comfortEmi = clamp(
    Math.min((h.monthlyIncome * (p.comfortablePct - dep)) / 100 - h.existingEmis, (surplus * p.comfortableSurplusPct) / 100),
  )
  const consEmi = clamp(
    Math.min((h.monthlyIncome * (p.conservativePct - dep)) / 100 - h.existingEmis, (surplus * p.conservativeSurplusPct) / 100),
  )
  const L = (e: number) => Math.floor(principalFor(e, rate, months) / 1000) * 1000
  const emergencyTarget = (h.monthlyEssentials + h.existingEmis + comfortEmi) * p.emergencyMonths
  const notes: string[] = []
  if (surplus <= 0) notes.push('Your essentials and existing EMIs already use all of your income, so no new EMI is comfortable.')
  if (lenderEmi > comfortEmi * 1.3 && comfortEmi > 0)
    notes.push('A lender may approve a noticeably larger loan than your budget comfortably supports.')
  if (h.emergencyFund < emergencyTarget) notes.push('Your emergency fund is below the target for the comfortable EMI.')
  return {
    surplus,
    levels: [
      { key: 'lender', label: 'Typical lender ceiling', emi: lenderEmi, loan: L(lenderEmi) },
      { key: 'comfortable', label: 'Comfortable', emi: comfortEmi, loan: L(comfortEmi) },
      { key: 'conservative', label: 'Conservative', emi: consEmi, loan: L(consEmi) },
    ],
    emergencyTarget,
    emergencyGap: Math.max(0, emergencyTarget - h.emergencyFund),
    notes,
  }
}

export type Comfort = 'Comfortable' | 'Watch' | 'Stretched' | 'High risk'

export interface StressScenario {
  key: string
  label: string
  rateDelta?: number
  incomeFactor?: number
  shock?: number
}

export interface StressRow {
  scenario: StressScenario
  emi: number
  income: number
  emiShare: number // all EMIs / income, %
  monthlyLeft: number
  bufferMonths: number
  level: Comfort
}

export interface StressPolicy {
  watchSharePct: number
  stretchedSharePct: number
  highRiskSharePct: number
  minBufferMonths: number
}

export function classify(emiShare: number, monthlyLeft: number, bufferMonths: number, p: StressPolicy): Comfort {
  if (monthlyLeft < 0 || emiShare >= p.highRiskSharePct) return 'High risk'
  if (emiShare >= p.stretchedSharePct || bufferMonths < 1) return 'Stretched'
  if (emiShare >= p.watchSharePct || bufferMonths < p.minBufferMonths) return 'Watch'
  return 'Comfortable'
}

export function stressTest(
  loan: { balance: number; rate: number; months: number },
  h: HouseholdInput,
  scenarios: StressScenario[],
  p: StressPolicy,
): StressRow[] {
  return scenarios.map((sc) => {
    const rate = loan.rate + (sc.rateDelta ?? 0)
    const e = emi(loan.balance, rate, loan.months)
    const income = h.monthlyIncome * (sc.incomeFactor ?? 1)
    const allEmis = e + h.existingEmis
    const outgo = allEmis + h.monthlyEssentials + h.otherObligations
    const monthlyLeft = income - outgo
    const fund = h.emergencyFund - (sc.shock ?? 0)
    const bufferMonths = outgo > 0 ? Math.max(0, fund) / outgo : Infinity
    const emiShare = income > 0 ? (allEmis / income) * 100 : 100
    return { scenario: sc, emi: e, income, emiShare, monthlyLeft, bufferMonths, level: classify(emiShare, monthlyLeft, bufferMonths, p) }
  })
}
