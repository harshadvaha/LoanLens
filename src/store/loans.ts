/**
 * The central loan model. Every tool reads from and writes to this shape,
 * so a loan entered once can be analysed, optimised, stress-tested or refinanced.
 * Persistence: localStorage only. Nothing leaves the browser.
 */
import { useSyncExternalStore } from 'react'
import { emi as calcEmi, schedule, tenureFor, type ScheduleInput } from '../core/amortize'
import type { Charges } from '../core/cost'
import type { LoanTypeId } from '../locale/types'
import { locale } from '../locale'

export interface Loan {
  id: string
  name: string
  kind: 'existing' | 'offer'
  type: LoanTypeId
  /** For an existing loan: current outstanding. For an offer: amount to borrow. */
  principal: number
  rate: number
  /** Remaining months (existing) or tenure (offer). */
  months: number
  /** Current EMI, if the user knows it. */
  emi?: number
  rateType: 'floating' | 'fixed'
  benchmark?: string
  spread?: number
  resetMonths?: number
  nextReset?: string
  balloon?: number
  charges: Charges
  /** % of amount prepaid or foreclosed charged by the lender (before tax). */
  prepayChargePct: number
  foreclosureChargePct: number
  /** Best rate the user has been quoted elsewhere for a similar loan (used for loan health). */
  bestQuote?: number
  // Existing-loan history (all optional).
  originalAmount?: number
  originalRate?: number
  originalMonths?: number
  startDate?: string
  notes?: string
  updatedAt: string
}

export interface Store {
  version: 1
  loans: Loan[]
  household: Household
  /** User-entered benchmark when the bundled value is out of date. */
  benchmarkOverride?: { value: number; asOf: string }
}

export interface Household {
  monthlyIncome: number
  existingEmis: number
  monthlyEssentials: number
  otherObligations: number
  dependents: number
  emergencyFund: number
  cashForPrepayment: number
  bufferMonths: number
  alternativeReturnPct: number
}

export const DEFAULT_HOUSEHOLD: Household = {
  monthlyIncome: 0,
  existingEmis: 0,
  monthlyEssentials: 0,
  otherObligations: 0,
  dependents: 0,
  emergencyFund: 0,
  cashForPrepayment: 0,
  bufferMonths: 6,
  alternativeReturnPct: 7,
}

const KEY = 'loanlens.v1'
let state: Store = load()
const listeners = new Set<() => void>()

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw)
      if (s && s.version === 1 && Array.isArray(s.loans)) return { ...s, household: { ...DEFAULT_HOUSEHOLD, ...s.household } }
    }
  } catch {
    /* storage unavailable or corrupt: start empty */
  }
  return { version: 1, loans: [], household: { ...DEFAULT_HOUSEHOLD } }
}

function commit(next: Store) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* private mode / quota: keep in memory */
  }
  listeners.forEach((l) => l())
}

export function useStore(): Store {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

export const getStore = () => state

export function newId() {
  return Math.random().toString(36).slice(2, 10)
}

export function saveLoan(loan: Loan) {
  const l = { ...loan, updatedAt: new Date().toISOString() }
  const exists = state.loans.some((x) => x.id === l.id)
  commit({ ...state, loans: exists ? state.loans.map((x) => (x.id === l.id ? l : x)) : [...state.loans, l] })
}

export function deleteLoan(id: string) {
  commit({ ...state, loans: state.loans.filter((x) => x.id !== id) })
}

export function setHousehold(h: Partial<Household>) {
  commit({ ...state, household: { ...state.household, ...h } })
}

export function setBenchmarkOverride(o: { value: number; asOf: string } | undefined) {
  commit({ ...state, benchmarkOverride: o })
}

/** The benchmark to use everywhere: the user's override if set, else the bundled value. */
export function currentBenchmark(s: Store = state) {
  const b = locale.benchmark
  const o = s.benchmarkOverride
  return o ? { ...b, value: o.value, asOf: o.asOf, overridden: true } : { ...b, overridden: false }
}

export function exportJson(): string {
  return JSON.stringify({ app: 'loanlens', exportedAt: new Date().toISOString(), ...state }, null, 2)
}

export function importJson(text: string, mode: 'merge' | 'replace'): { added: number } {
  const data = JSON.parse(text)
  if (!data || data.version !== 1 || !Array.isArray(data.loans)) throw new Error('This file is not a LoanLens backup.')
  const incoming: Loan[] = data.loans.filter((l: Loan) => l && typeof l.principal === 'number' && typeof l.rate === 'number')
  if (mode === 'replace') {
    commit({ version: 1, loans: incoming, household: { ...DEFAULT_HOUSEHOLD, ...data.household }, benchmarkOverride: data.benchmarkOverride })
    return { added: incoming.length }
  }
  const ids = new Set(state.loans.map((l) => l.id))
  const add = incoming.map((l) => (ids.has(l.id) ? { ...l, id: newId() } : l))
  commit({ ...state, loans: [...state.loans, ...add] })
  return { added: add.length }
}

/* ---------- derived helpers shared by all tools ---------- */

/** The EMI to use for a loan: what the user entered, else the computed one. */
export function loanEmi(l: Loan): number {
  return l.emi && l.emi > 0 ? l.emi : calcEmi(l.principal, l.rate, l.months, l.balloon ?? 0)
}

export function loanScheduleInput(l: Loan): ScheduleInput {
  return { principal: l.principal, annualRate: l.rate, months: l.months, emi: loanEmi(l), balloon: l.balloon }
}

export function loanSchedule(l: Loan) {
  return schedule(loanScheduleInput(l))
}

/** If the user's EMI implies a different remaining term than they entered, report it. */
export function impliedMonths(l: Loan): number {
  return tenureFor(l.principal, l.rate, loanEmi(l))
}
