import type { AffordabilityPolicy, StressPolicy } from '../core/household'

export type LoanTypeId = 'home' | 'car' | 'personal' | 'education' | 'twowheeler' | 'business' | 'lap' | 'gold' | 'other'

export interface LoanType {
  id: LoanTypeId
  label: string
  short: string
  secured: boolean
  defaultAmount: number
  defaultRate: number
  defaultMonths: number
  maxYears: number
  /** Whether a down payment and balloon/residual make sense for this type. */
  hasDownPayment: boolean
  hasBalloon: boolean
  /** Questions to ask the lender, specific to this type (in addition to common ones). */
  askLender: string[]
}

export interface Sourced {
  title: string
  body: string
  asOf: string
  source: { label: string; url: string }
}

export interface LocaleConfig {
  country: string
  currency: { code: string; symbol: string }
  numberLocale: string
  /** Name and rate of tax charged on lender fees (e.g. GST at 18% in India). */
  chargeTax: { label: string; pct: number }
  /** Unit words for compact amounts: India uses lakh/crore. */
  compactUnits: { value: number; short: string; long: string }[]
  benchmark: { name: string; value: number; change: number; asOf: string; source: { label: string; url: string }; note: string }
  loanTypes: LoanType[]
  commonAskLender: string[]
  floatingAskLender: string[]
  affordability: AffordabilityPolicy
  stress: StressPolicy
  regulatory: Sourced[]
  tax: Sourced[]
}
