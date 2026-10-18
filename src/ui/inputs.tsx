import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { compact, locale, words } from '../locale'

const nf = new Intl.NumberFormat(locale.numberLocale, { maximumFractionDigits: 0 })

/* ---------- slider helpers ---------- */

/** Round to a "nice" amount so a log slider lands on 37,00,000 rather than 37,13,482. */
export function niceAmount(v: number): number {
  if (v <= 0) return 0
  if (v < 1000) return Math.round(v / 100) * 100
  const mag = 10 ** Math.floor(Math.log10(v))
  const s = mag / (v < 3 * mag ? 20 : 10)
  return Math.round(v / s) * s
}

const LOG_STEPS = 1000
/** Map a value to a 0..1000 slider position on a log scale (0 is allowed at position 0). */
export function toLogPos(v: number, min: number, max: number): number {
  if (v <= 0 || v <= min) return 0
  if (v >= max) return LOG_STEPS
  const lo = Math.max(min, max / 1000, 1)
  const p = Math.round(((Math.log(Math.max(v, lo)) - Math.log(lo)) / (Math.log(max) - Math.log(lo))) * LOG_STEPS)
  return min <= 0 ? Math.max(1, p) : p
}
export function fromLogPos(pos: number, min: number, max: number): number {
  if (pos <= 0) return Math.max(0, min)
  if (pos >= LOG_STEPS) return max
  const lo = Math.max(min, max / 1000, 1)
  const v = Math.exp(Math.log(lo) + (pos / LOG_STEPS) * (Math.log(max) - Math.log(lo)))
  return Math.min(max, Math.max(min, niceAmount(v)))
}

/** A styled range track. Pure control; label comes from the field it belongs to. */
function Range({
  value,
  min,
  max,
  step,
  onChange,
  ariaLabel,
  valueText,
  log,
  ends,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (n: number) => void
  ariaLabel: string
  valueText?: string
  log?: boolean
  ends?: [string, string]
}) {
  // For log sliders keep our own position: values snap to round amounts, and re-deriving the position
  // from the snapped value would pull the thumb back (it would stick when nudged with the keyboard).
  const [logPos, setLogPos] = useState(() => toLogPos(value, min, max))
  useEffect(() => {
    if (log && fromLogPos(logPos, min, max) !== value) setLogPos(toLogPos(value, min, max))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, min, max, log])
  const pos = log ? logPos : Math.min(max, Math.max(min, value))
  const lo = log ? 0 : min
  const hi = log ? LOG_STEPS : max
  const fill = hi > lo ? ((pos - lo) / (hi - lo)) * 100 : 0
  /** Arrow keys on a log slider jump to the next distinct round amount. */
  const nudge = (dir: 1 | -1, big: boolean) => {
    let p = logPos
    const start = fromLogPos(p, min, max)
    let seen = 0
    while (p > 0 || dir > 0) {
      p += dir
      if (p < 0 || p > LOG_STEPS) return
      const v = fromLogPos(p, min, max)
      if (v !== start && (dir > 0 ? v > value : v < value)) {
        seen++
        if (!big || seen >= 10 || p === 0 || p === LOG_STEPS) {
          setLogPos(p)
          onChange(v)
          return
        }
      }
    }
  }
  return (
    <div className="range">
      <input
        type="range"
        className="range-input"
        min={lo}
        max={hi}
        step={log ? 1 : step}
        value={pos}
        aria-label={ariaLabel}
        aria-valuetext={valueText}
        style={{ ['--fill' as string]: `${fill}%` }}
        onKeyDown={(e) => {
          if (!log) return
          const k = e.key
          if (k === 'ArrowRight' || k === 'ArrowUp' || k === 'PageUp') (e.preventDefault(), nudge(1, k === 'PageUp'))
          else if (k === 'ArrowLeft' || k === 'ArrowDown' || k === 'PageDown') (e.preventDefault(), nudge(-1, k === 'PageDown'))
        }}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (log) {
            setLogPos(n)
            onChange(fromLogPos(n, min, max))
          }
          else {
            const d = step && step < 1 ? (String(step).split('.')[1]?.length ?? 2) : 0
            onChange(Number(n.toFixed(d)))
          }
        }}
      />
      {ends && (
        <div className="range-ends" aria-hidden="true">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      )}
    </div>
  )
}

const plain = (l: ReactNode, fallback: string) => (typeof l === 'string' ? l : fallback)

interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  aside?: ReactNode
  /** A render function for the control, optionally followed by extra nodes (sliders, presets). */
  children: FieldRender | (FieldRender | ReactNode | false | undefined)[]
}
type FieldRender = (id: string, describedBy: string | undefined) => ReactNode

export function Field({ label, hint, error, aside, children }: FieldProps) {
  const id = useId()
  const hintId = `${id}-h`
  return (
    <div className="field">
      <div className="field-label">
        <label htmlFor={id}>{label}</label>
        {aside}
      </div>
      {(() => {
        const [render, ...rest] = Array.isArray(children) ? children : [children]
        return (
          <>
            {(render as FieldRender)(id, hint || error ? hintId : undefined)}
            {rest as ReactNode[]}
          </>
        )
      })()}
      {error ? (
        <span className="field-error" id={hintId} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="field-hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  )
}

/** Amount input with live Indian digit grouping and a words hint ("50 lakh"). */
export function MoneyInput({
  label,
  value,
  onChange,
  hint,
  min = 0,
  max,
  required,
  aside,
  prefix = locale.currency.symbol,
  range,
  presets,
}: {
  label: ReactNode
  value: number
  onChange: (n: number) => void
  hint?: ReactNode
  min?: number
  max?: number
  required?: boolean
  aside?: ReactNode
  prefix?: string
  /** Show a log-scale slider between these amounts. */
  range?: [number, number]
  /** One-tap amounts shown as chips. */
  presets?: number[]
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(value ? nf.format(value) : '')
  const caret = useRef<number | null>(null)

  useEffect(() => {
    const parsed = parseInt(text.replace(/\D/g, '') || '0', 10)
    if (parsed !== value) setText(value ? nf.format(value) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    if (caret.current !== null && ref.current && document.activeElement === ref.current) {
      ref.current.setSelectionRange(caret.current, caret.current)
      caret.current = null
    }
  })

  const error =
    required && !value ? 'Enter an amount' : value < min ? `Must be at least ${nf.format(min)}` : max !== undefined && value > max ? `Must be at most ${nf.format(max)}` : null

  return (
    <Field label={label} hint={hint} error={error} aside={aside}>
      {(id, d) => (
        <div className={`input-wrap${error ? ' invalid' : ''}`}>
          <span className="affix">{prefix}</span>
          <input
            ref={ref}
            id={id}
            aria-describedby={d}
            aria-invalid={!!error}
            inputMode="numeric"
            autoComplete="off"
            value={text}
            onChange={(e) => {
              const raw = e.target.value
              const pos = e.target.selectionStart ?? raw.length
              const digitsBefore = raw.slice(0, pos).replace(/\D/g, '').length
              const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 13)
              const n = digits ? parseInt(digits, 10) : 0
              const formatted = digits ? nf.format(n) : ''
              let seen = 0
              let p = 0
              while (p < formatted.length && seen < digitsBefore) {
                if (/\d/.test(formatted[p])) seen++
                p++
              }
              caret.current = p
              setText(formatted)
              onChange(n)
            }}
          />
          {words(value) && <span className="affix words">{words(value)}</span>}
        </div>
      )}
      {range && range[1] > range[0] && (
        <Range
          log
          value={value}
          min={range[0]}
          max={range[1]}
          ariaLabel={`${plain(label, 'Amount')} slider`}
          valueText={compact(value)}
          ends={[compact(range[0]), compact(range[1]) + '+']}
          onChange={(v) => {
            setText(v ? nf.format(v) : '')
            onChange(v)
          }}
        />
      )}
      {presets && presets.length > 0 && (
        <div className="presets" role="group" aria-label={`${plain(label, 'Amount')} presets`}>
          {presets.map((p) => (
            <button key={p} type="button" className="preset" aria-pressed={value === p} onClick={() => onChange(p)}>
              {compact(p)}
            </button>
          ))}
        </div>
      )}
    </Field>
  )
}

/** Decimal input (rates, percentages). Keeps what the user types; reports a number. */
export function DecimalInput({
  label,
  value,
  onChange,
  suffix = '%',
  hint,
  min = 0,
  max = 100,
  step,
  aside,
  range,
  noSlider,
}: {
  label: ReactNode
  value: number
  onChange: (n: number) => void
  suffix?: string
  hint?: ReactNode
  min?: number
  max?: number
  step?: number
  aside?: ReactNode
  /** Slider bounds. Defaults to [min, max] (capped at 30) whenever a step is given. */
  range?: [number, number]
  noSlider?: boolean
}) {
  const [text, setText] = useState(String(value))
  const sr = noSlider ? null : range ?? (step ? ([min, max >= 40 ? 30 : max] as [number, number]) : null)
  const sStep = step ?? (sr && sr[1] - sr[0] <= 12 ? 0.25 : 1)
  const fmt = (v: number) => `${v}${suffix && suffix.startsWith('%') ? '%' : suffix ? ' ' + suffix : ''}`
  useEffect(() => {
    if (parseFloat(text) !== value && !(text === '' && value === 0)) setText(String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  const n = parseFloat(text)
  const error = text === '' ? null : Number.isNaN(n) ? 'Enter a number' : n < min ? `Must be at least ${min}` : n > max ? `Must be at most ${max}` : null
  return (
    <Field label={label} hint={hint} error={error} aside={aside}>
      {(id, d) => (
        <div className={`input-wrap${error ? ' invalid' : ''}`}>
          <input
            id={id}
            aria-describedby={d}
            aria-invalid={!!error}
            inputMode="decimal"
            autoComplete="off"
            value={text}
            onChange={(e) => {
              const t = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
              setText(t)
              const v = parseFloat(t)
              if (!Number.isNaN(v) && v >= min && v <= max) onChange(v)
              else if (t === '') onChange(0)
            }}
            onKeyDown={(e) => {
              if (!step) return
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault()
                const v = Math.min(max, Math.max(min, Math.round(((parseFloat(text) || 0) + (e.key === 'ArrowUp' ? step : -step)) * 100) / 100))
                setText(String(v))
                onChange(v)
              }
            }}
          />
          {suffix && <span className="affix">{suffix}</span>}
        </div>
      )}
      {sr && (
        <Range
          value={value}
          min={sr[0]}
          max={sr[1]}
          step={sStep}
          ariaLabel={`${plain(label, 'Value')} slider`}
          valueText={fmt(value)}
          ends={[fmt(sr[0]), fmt(sr[1])]}
          onChange={(v) => {
            setText(String(v))
            onChange(v)
          }}
        />
      )}
    </Field>
  )
}

/** Tenure as years + months, with a years slider. Value is total months. */
export function TenureInput({
  label,
  months,
  onChange,
  maxYears = 40,
  hint,
  minYears = 1,
}: {
  label: ReactNode
  months: number
  onChange: (m: number) => void
  maxYears?: number
  hint?: ReactNode
  minYears?: number
}) {
  const y = Math.floor(months / 12)
  const m = months % 12
  const error = months <= 0 ? 'Enter a tenure' : months > maxYears * 12 ? `Up to ${maxYears} years` : null
  const name = plain(label, 'Tenure')
  return (
    <Field label={label} hint={hint} error={error}>
      {(id, d) => (
        <div className="tenure">
          <div className={`input-wrap${error ? ' invalid' : ''}`}>
            <input
              id={id}
              aria-describedby={d}
              aria-label={`${name}, years`}
              inputMode="numeric"
              value={y || (m ? '0' : '')}
              onChange={(e) => onChange(Math.min(99, parseInt(e.target.value.replace(/\D/g, '') || '0', 10)) * 12 + m)}
            />
            <span className="affix">yrs</span>
          </div>
          <div className={`input-wrap${error ? ' invalid' : ''}`}>
            <input
              aria-label={`${name}, months`}
              inputMode="numeric"
              value={m || ''}
              placeholder="0"
              onChange={(e) => onChange(y * 12 + Math.min(11, parseInt(e.target.value.replace(/\D/g, '') || '0', 10)))}
            />
            <span className="affix">mo</span>
          </div>
        </div>
      )}
      {maxYears > minYears && (
        <Range
          value={Math.min(maxYears, Math.max(minYears, y))}
          min={minYears}
          max={maxYears}
          step={1}
          ariaLabel={`${name} slider, years`}
          valueText={`${y} years${m ? ` ${m} months` : ''}`}
          ends={[`${minYears} yr`, `${maxYears} yrs`]}
          onChange={(v) => onChange(v * 12 + (v >= maxYears ? 0 : m))}
        />
      )}
    </Field>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Chips<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="chip" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Select<T extends string>({ label, value, options, onChange, hint }: { label: ReactNode; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; hint?: ReactNode }) {
  return (
    <Field label={label} hint={hint}>
      {(id, d) => (
        <div className="input-wrap select-wrap">
          <select id={id} aria-describedby={d} value={value} onChange={(e) => onChange(e.target.value as T)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </Field>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
  hint,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (n: number) => void
  display: (n: number) => string
  hint?: ReactNode
}) {
  const id = useId()
  return (
    <div className="slider">
      <div className="slider-top">
        <label htmlFor={id} className="field-label">
          {label}
        </label>
        <span className="slider-val">{display(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        className="range-input"
        min={min}
        max={Math.max(min + step, max)}
        step={step}
        value={Math.min(value, Math.max(min + step, max))}
        aria-valuetext={display(value)}
        style={{ ['--fill' as string]: `${((Math.min(Math.max(value, min), Math.max(min + step, max)) - min) / (Math.max(min + step, max) - min)) * 100}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  )
}

export function TextInput({ label, value, onChange, placeholder, hint, type = 'text' }: { label: ReactNode; value: string; onChange: (s: string) => void; placeholder?: string; hint?: ReactNode; type?: 'text' | 'date' | 'month' }) {
  return (
    <Field label={label} hint={hint}>
      {(id, d) => (
        <div className="input-wrap">
          <input id={id} type={type} aria-describedby={d} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        </div>
      )}
    </Field>
  )
}

/** Fee input that can be a fixed amount or a % of the loan. */
export function FeeInput({
  label,
  value,
  isPct,
  onChange,
  base,
  hint,
}: {
  label: ReactNode
  value: number
  isPct: boolean
  onChange: (v: number, isPct: boolean) => void
  base: number
  hint?: ReactNode
}) {
  const toggle = (
    <span className="seg" style={{ padding: 1 }}>
      <button type="button" aria-pressed={!isPct} onClick={() => onChange(isPct ? Math.round((base * value) / 100) : value, false)} style={{ padding: '1px 8px', fontSize: 12 }}>
        {locale.currency.symbol}
      </button>
      <button type="button" aria-pressed={isPct} onClick={() => onChange(isPct ? value : base ? Math.round((value / base) * 10000) / 100 : 0, true)} style={{ padding: '1px 8px', fontSize: 12 }}>
        %
      </button>
    </span>
  )
  return isPct ? (
    <DecimalInput label={label} value={value} onChange={(v) => onChange(v, true)} suffix="% of loan" max={20} step={0.05} range={[0, 5]} aside={toggle} hint={hint} />
  ) : (
    <MoneyInput label={label} value={value} onChange={(v) => onChange(v, false)} aside={toggle} hint={hint} range={[0, Math.max(50_000, niceAmount(base * 0.05))]} />
  )
}

/** Shared slider bounds so the same kind of number behaves the same everywhere. */
export const RANGES = {
  outstanding: [10_000, 50_000_000] as [number, number],
  emi: [1_000, 500_000] as [number, number],
  income: [10_000, 2_000_000] as [number, number],
  expense: [0, 500_000] as [number, number],
  savings: [0, 10_000_000] as [number, number],
  charges: [0, 500_000] as [number, number],
  rate: [4, 30] as [number, number],
  chargePct: [0, 6] as [number, number],
}
