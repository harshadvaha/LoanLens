import type { ReactNode } from 'react'
import { compact, money, pct } from '../locale'

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${className ?? ''}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

/** The product's signature: principal vs interest vs charges, always in the same colours. */
export function CostBar({ principal, interest, charges = 0, thin, showLegend = true }: { principal: number; interest: number; charges?: number; thin?: boolean; showLegend?: boolean }) {
  const total = principal + interest + charges || 1
  const w = (x: number) => `${(Math.max(0, x) / total) * 100}%`
  const label = `Principal ${money(principal)} (${pct((principal / total) * 100, 0)}), interest ${money(interest)} (${pct((interest / total) * 100, 0)})${charges ? `, charges ${money(charges)}` : ''}`
  return (
    <div className="stack-s">
      <div className={`costbar${thin ? ' thin' : ''}`} role="img" aria-label={label}>
        <span className="p" style={{ width: w(principal) }} />
        <span className="i" style={{ width: w(interest) }} />
        {charges > 0 && <span className="c" style={{ width: w(charges) }} />}
      </div>
      {showLegend && (
        <div className="legend" aria-hidden="true">
          <span>
            <i style={{ background: 'var(--principal)' }} />
            Principal {compact(principal)} · {pct((principal / total) * 100, 0)}
          </span>
          <span>
            <i style={{ background: 'var(--interest)' }} />
            Interest {compact(interest)} · {pct((interest / total) * 100, 0)}
          </span>
          {charges > 0 && (
            <span>
              <i style={{ background: 'repeating-linear-gradient(135deg, var(--charges) 0 2px, transparent 2px 4px)' }} />
              Charges {compact(charges)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export function Insight({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'good' | 'watch' | 'bad' | 'neutral' }) {
  return <p className={`insight ${tone === 'bad' ? '' : tone}`}>{children}</p>
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'good' | 'watch' | 'bad' | 'neutral' | 'solid' }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

export function PageHead({ eyebrow, title, lede, children }: { eyebrow?: string; title: string; lede?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1 className="page-title">{title}</h1>
      {lede && <p className="lede">{lede}</p>}
      {children}
    </header>
  )
}

export function Section({ title, sub, children, id, actions }: { title: string; sub?: ReactNode; children: ReactNode; id?: string; actions?: ReactNode }) {
  return (
    <section className="section stack" id={id} aria-labelledby={id ? `${id}-t` : undefined}>
      <div className="row between" style={{ alignItems: 'flex-end' }}>
        <div>
          <h2 className="h2" id={id ? `${id}-t` : undefined}>
            {title}
          </h2>
          {sub && <p className="muted small">{sub}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function Assumptions({ items }: { items: ReactNode[] }) {
  return (
    <details className="disclosure">
      <summary>Assumptions behind these numbers</summary>
      <ul className="small muted" style={{ margin: '4px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </details>
  )
}

export function Source({ label, url, asOf, prefix = 'Source' }: { label: string; url: string; asOf?: string; prefix?: string }) {
  return (
    <span className="tiny muted">
      {prefix}:{' '}
      <a href={url} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
      {asOf && <> · as of {asOf}</>}
    </span>
  )
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="panel stack-s" style={{ padding: 22, borderStyle: 'dashed', background: 'transparent' }}>
      <p className="h3">{title}</p>
      {children && <p className="muted small">{children}</p>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  )
}

export function Arrow() {
  return (
    <svg className="arrow" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

/** "₹2.44L" for savings, signed. */
export function Delta({ value, goodWhenPositive = true, fmt = compact }: { value: number; goodWhenPositive?: boolean; fmt?: (n: number) => string }) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.5) return <span className="muted">—</span>
  const good = goodWhenPositive ? value > 0 : value < 0
  return <span className={good ? 'good-c' : 'bad-c'}>{(value > 0 ? '+' : '') + fmt(value)}</span>
}
