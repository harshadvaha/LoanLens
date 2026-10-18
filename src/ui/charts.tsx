import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { YearRow } from '../core/amortize'
import { compact, money, monthLabel, shortDuration } from '../locale'

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(640)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function niceMax(v: number) {
  if (v <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => n <= x) ?? 10
  return step * p
}

const PAD = { l: 52, r: 12, t: 12, b: 26 }

interface Tip {
  x: number
  y: number
  content: ReactNode
}

/* ---------------- Balance over time (one or more loans/scenarios) ---------------- */

export interface Series {
  label: string
  color: string
  /** Balance at the end of each month; index 0 = opening balance. */
  values: number[]
  dashed?: boolean
}

export function BalanceChart({ series, startDate, height = 220, title }: { series: Series[]; startDate?: string; height?: number; title: string }) {
  const [ref, W] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const n = Math.max(...series.map((s) => s.values.length)) - 1
  const max = niceMax(Math.max(...series.flatMap((s) => s.values)))
  const iw = W - PAD.l - PAD.r
  const ih = height - PAD.t - PAD.b
  const x = (i: number) => PAD.l + (n ? (i / n) * iw : 0)
  const y = (v: number) => PAD.t + ih - (v / max) * ih
  const yearStep = n > 240 ? 60 : n > 120 ? 24 : n > 36 ? 12 : 6
  const ticks: number[] = []
  for (let i = 0; i <= n; i += yearStep) ticks.push(i)
  const path = (vals: number[]) => {
    const step = Math.max(1, Math.floor(vals.length / iw))
    let d = ''
    for (let i = 0; i < vals.length; i += step) d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(vals[i]).toFixed(1)}`
    d += `L${x(vals.length - 1).toFixed(1)},${y(vals[vals.length - 1]).toFixed(1)}`
    return d
  }
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    setHover(Math.max(0, Math.min(n, Math.round(((px - PAD.l) / iw) * n))))
  }
  const tip: Tip | null =
    hover === null
      ? null
      : {
          x: x(hover),
          y: PAD.t,
          content: (
            <>
              <div style={{ opacity: 0.75 }}>
                {startDate ? monthLabel(startDate, hover) : `Month ${hover}`} · after {shortDuration(hover)}
              </div>
              {series.map((s) => (
                <div key={s.label}>
                  {s.label}: {money(s.values[Math.min(hover, s.values.length - 1)] ?? 0)}
                </div>
              ))}
            </>
          ),
        }
  return (
    <div className="chart-wrap" ref={ref}>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-label={`${title}. ${series.map((s) => `${s.label}: paid off after ${shortDuration(s.values.length - 1)}`).join('. ')}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        style={{ touchAction: 'pan-y' }}
      >
        <g className="axis">
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line className="gridline" x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} />
              <text x={PAD.l - 8} y={y(max * f) + 4} textAnchor="end">
                {compact(max * f)}
              </text>
            </g>
          ))}
          {ticks.map((t) => (
            <text key={t} x={x(t)} y={height - 6} textAnchor="middle">
              {startDate ? monthLabel(startDate, t).split(' ')[1] : `${t / 12}y`}
            </text>
          ))}
        </g>
        {series.map((s, i) => (
          <path key={s.label} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={i === 0 ? 2 : 2} strokeDasharray={s.dashed ? '5 4' : undefined} />
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + ih} stroke="var(--ink-3)" strokeWidth={1} />}
        {hover !== null &&
          series.map((s) => {
            const v = s.values[Math.min(hover, s.values.length - 1)]
            return v !== undefined ? <circle key={s.label} cx={x(hover)} cy={y(v)} r={3.5} fill={s.color} /> : null
          })}
      </svg>
      {tip && (
        <div className="chart-tip" style={{ left: `${(tip.x / W) * 100}%`, top: tip.y }}>
          {tip.content}
        </div>
      )}
      {series.length > 1 && (
        <div className="legend" style={{ marginTop: 6 }}>
          {series.map((s) => (
            <span key={s.label}>
              <i style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------- Principal vs interest per loan year ---------------- */

export function YearBars({ years, startDate, height = 220 }: { years: YearRow[]; startDate?: string; height?: number }) {
  const [ref, W] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const max = niceMax(Math.max(...years.map((y) => y.interest + y.principal + y.prepayment)))
  const iw = W - PAD.l - PAD.r
  const ih = height - PAD.t - PAD.b
  const bw = iw / years.length
  const gap = Math.min(4, bw * 0.25)
  const h = (v: number) => (v / max) * ih
  const labelEvery = Math.ceil(years.length / Math.max(4, Math.floor(iw / 44)))
  const yr = (i: number) => (startDate ? monthLabel(startDate, i * 12).split(' ')[1] : `Y${i + 1}`)
  const total = years.reduce((s, y) => s + y.interest, 0)
  return (
    <div className="chart-wrap" ref={ref}>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-label={`Principal and interest paid each loan year. Interest is highest in year 1 (${compact(years[0]?.interest ?? 0)}) and falls over time; total interest ${compact(total)}.`}
        onPointerLeave={() => setHover(null)}
      >
        <g className="axis">
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line className="gridline" x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih - f * ih} y2={PAD.t + ih - f * ih} />
              <text x={PAD.l - 8} y={PAD.t + ih - f * ih + 4} textAnchor="end">
                {compact(max * f)}
              </text>
            </g>
          ))}
        </g>
        {years.map((y, i) => {
          const x0 = PAD.l + i * bw + gap / 2
          const w = Math.max(1, bw - gap)
          const hp = h(y.principal + y.prepayment)
          const hi = h(y.interest)
          const base = PAD.t + ih
          return (
            <g key={y.year} onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} opacity={hover === null || hover === i ? 1 : 0.55}>
              <rect x={x0} y={base - hp} width={w} height={hp} fill="var(--principal)" />
              <rect x={x0} y={base - hp - hi} width={w} height={hi} fill="var(--interest)" />
              <rect x={PAD.l + i * bw} y={PAD.t} width={bw} height={ih} fill="transparent" />
              {i % labelEvery === 0 && (
                <text className="axis" x={x0 + w / 2} y={height - 6} textAnchor="middle" fill="var(--ink-3)" fontSize={11}>
                  {yr(i)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {hover !== null && years[hover] && (
        <div className="chart-tip" style={{ left: `${((PAD.l + (hover + 0.5) * bw) / W) * 100}%`, top: PAD.t }}>
          <div style={{ opacity: 0.75 }}>Loan year {years[hover].year}{startDate ? ` (from ${monthLabel(startDate, hover * 12)})` : ''}</div>
          <div>Principal: {money(years[hover].principal + years[hover].prepayment)}</div>
          <div>Interest: {money(years[hover].interest)}</div>
          <div>Balance after: {money(years[hover].closing)}</div>
        </div>
      )}
    </div>
  )
}

/* ---------------- Net position line (refinance break-even) ---------------- */

export function NetLine({ values, breakEven, height = 200, marker }: { values: number[]; breakEven: number | null; height?: number; marker?: number }) {
  const [ref, W] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const n = values.length
  const lo = Math.min(0, ...values)
  const hi = Math.max(0, ...values)
  const span = hi - lo || 1
  const iw = W - PAD.l - PAD.r
  const ih = height - PAD.t - PAD.b
  const x = (i: number) => PAD.l + (i / Math.max(1, n - 1)) * iw
  const y = (v: number) => PAD.t + ih - ((v - lo) / span) * ih
  let d = ''
  values.forEach((v, i) => (d += `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`))
  const yearStep = n > 240 ? 60 : n > 120 ? 24 : 12
  return (
    <div className="chart-wrap" ref={ref}>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-label={breakEven ? `Switching pays for itself after about ${shortDuration(breakEven)}.` : 'Switching does not pay for itself within the loan term.'}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const px = ((e.clientX - r.left) / r.width) * W
          setHover(Math.max(0, Math.min(n - 1, Math.round(((px - PAD.l) / iw) * (n - 1)))))
        }}
        onPointerLeave={() => setHover(null)}
        style={{ touchAction: 'pan-y' }}
      >
        <g className="axis">
          <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="var(--ink-3)" />
          <text x={PAD.l - 8} y={y(0) + 4} textAnchor="end">
            ₹0
          </text>
          <text x={PAD.l - 8} y={y(hi) + 4} textAnchor="end">
            {compact(hi)}
          </text>
          {lo < 0 && (
            <text x={PAD.l - 8} y={y(lo) + 4} textAnchor="end">
              {compact(lo)}
            </text>
          )}
          {Array.from({ length: Math.floor((n - 1) / yearStep) + 1 }, (_, k) => k * yearStep).map((t) => (
            <text key={t} x={x(Math.max(0, t - 1))} y={height - 6} textAnchor="middle">
              {t / 12}y
            </text>
          ))}
        </g>
        <path d={`${d}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill="var(--good)" opacity={0.08} />
        <path d={d} fill="none" stroke="var(--good)" strokeWidth={2} />
        {breakEven && <circle cx={x(breakEven - 1)} cy={y(values[breakEven - 1])} r={4.5} fill="var(--good)" />}
        {marker !== undefined && marker <= n && <line x1={x(marker - 1)} x2={x(marker - 1)} y1={PAD.t} y2={PAD.t + ih} stroke="var(--interest)" strokeDasharray="4 3" />}
        {hover !== null && <circle cx={x(hover)} cy={y(values[hover])} r={3.5} fill="var(--ink)" />}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${(x(hover) / W) * 100}%`, top: PAD.t }}>
          After {shortDuration(hover + 1)}: {values[hover] >= 0 ? 'ahead by ' : 'behind by '}
          {money(Math.abs(values[hover]))}
        </div>
      )}
    </div>
  )
}
