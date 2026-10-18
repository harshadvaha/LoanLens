import { IN } from './in'
import type { LoanTypeId, LocaleConfig } from './types'

/** Active locale. A future country picker would switch this. */
export const locale: LocaleConfig = IN

export function loanType(id: LoanTypeId) {
  return locale.loanTypes.find((t) => t.id === id) ?? locale.loanTypes[locale.loanTypes.length - 1]
}

const nf0 = new Intl.NumberFormat(locale.numberLocale, { maximumFractionDigits: 0 })
const nf2 = new Intl.NumberFormat(locale.numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function num(n: number): string {
  return Number.isFinite(n) ? nf0.format(Math.round(n)) : '—'
}

export function money(n: number, decimals = false): string {
  if (!Number.isFinite(n)) return '—'
  const s = (decimals ? nf2 : nf0).format(Math.abs(decimals ? n : Math.round(n)))
  return `${n < 0 ? '−' : ''}${locale.currency.symbol}${s}`
}

/** ₹42.6L, ₹1.25Cr, ₹48.2k */
export function compact(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const a = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  for (const u of locale.compactUnits) {
    if (a >= u.value) {
      const v = a / u.value
      const d = v >= 100 ? 0 : v >= 10 ? 1 : 2
      return `${sign}${locale.currency.symbol}${trim(v.toFixed(d))}${u.short}`
    }
  }
  return `${sign}${locale.currency.symbol}${nf0.format(Math.round(a))}`
}

/** "50 lakh", "1.2 crore" — used as a reading aid under inputs. */
export function words(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return ''
  for (const u of locale.compactUnits) {
    if (n >= u.value && u.value >= 1e5) return `${trim((n / u.value).toFixed(2))} ${u.long}`
  }
  return ''
}

const trim = (s: string) => (s.includes('.') ? s.replace(/\.?0+$/, '') : s)

export function pct(n: number, d = 2): string {
  return Number.isFinite(n) ? `${trim(n.toFixed(d))}%` : '—'
}

export function duration(months: number): string {
  if (!Number.isFinite(months)) return 'never'
  const m = Math.round(Math.abs(months))
  const y = Math.floor(m / 12)
  const r = m % 12
  const parts: string[] = []
  if (y) parts.push(`${y} year${y === 1 ? '' : 's'}`)
  if (r || !y) parts.push(`${r} month${r === 1 ? '' : 's'}`)
  return parts.join(' ')
}

export function shortDuration(months: number): string {
  if (!Number.isFinite(months)) return '—'
  const y = Math.floor(months / 12)
  const r = months % 12
  return y ? `${y}y${r ? ` ${r}m` : ''}` : `${r}m`
}

export function fmtDate(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  return d.toLocaleDateString(locale.numberLocale, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Add n months to an ISO date (yyyy-mm-dd) and return "Mar 2041". */
export function monthLabel(startIso: string | undefined, offset: number): string {
  const d = startIso ? new Date(startIso + 'T00:00:00') : new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  return d.toLocaleDateString(locale.numberLocale, { month: 'short', year: 'numeric' })
}

export function monthsBetween(fromIso: string, to = new Date()): number {
  const f = new Date(fromIso + 'T00:00:00')
  return (to.getFullYear() - f.getFullYear()) * 12 + (to.getMonth() - f.getMonth())
}
