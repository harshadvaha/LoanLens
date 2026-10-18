import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { locale, words } from '../locale'

const nf = new Intl.NumberFormat(locale.numberLocale, { maximumFractionDigits: 0 })

interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  aside?: ReactNode
  children: (id: string, describedBy: string | undefined) => ReactNode
}

export function Field({ label, hint, error, aside, children }: FieldProps) {
  const id = useId()
  const hintId = `${id}-h`
  return (
    <div className="field">
      <div className="field-label">
        <label htmlFor={id}>{label}</label>
        {aside}
      </div>
      {children(id, hint || error ? hintId : undefined)}
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
    <Field label={label} hint={hint ?? words(value)} error={error} aside={aside}>
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
}) {
  const [text, setText] = useState(String(value))
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
    </Field>
  )
}

/** Tenure as years + months. Value is total months. */
export function TenureInput({ label, months, onChange, maxYears = 40, hint }: { label: ReactNode; months: number; onChange: (m: number) => void; maxYears?: number; hint?: ReactNode }) {
  const y = Math.floor(months / 12)
  const m = months % 12
  const error = months <= 0 ? 'Enter a tenure' : months > maxYears * 12 ? `Up to ${maxYears} years` : null
  return (
    <Field label={label} hint={hint} error={error}>
      {(id, d) => (
        <div className="grid-2">
          <div className={`input-wrap${error ? ' invalid' : ''}`}>
            <input
              id={id}
              aria-describedby={d}
              aria-label={typeof label === 'string' ? `${label}, years` : 'Years'}
              inputMode="numeric"
              value={y || (m ? '0' : '')}
              onChange={(e) => onChange(Math.min(99, parseInt(e.target.value.replace(/\D/g, '') || '0', 10)) * 12 + m)}
            />
            <span className="affix">yrs</span>
          </div>
          <div className={`input-wrap${error ? ' invalid' : ''}`}>
            <input
              aria-label={typeof label === 'string' ? `${label}, months` : 'Months'}
              inputMode="numeric"
              value={m || ''}
              placeholder="0"
              onChange={(e) => onChange(y * 12 + Math.min(11, parseInt(e.target.value.replace(/\D/g, '') || '0', 10)))}
            />
            <span className="affix">mo</span>
          </div>
        </div>
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
        min={min}
        max={Math.max(min + step, max)}
        step={step}
        value={Math.min(value, Math.max(min + step, max))}
        aria-valuetext={display(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  )
}

export function TextInput({ label, value, onChange, placeholder, hint }: { label: ReactNode; value: string; onChange: (s: string) => void; placeholder?: string; hint?: ReactNode }) {
  return (
    <Field label={label} hint={hint}>
      {(id, d) => (
        <div className="input-wrap">
          <input id={id} aria-describedby={d} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
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
    <DecimalInput label={label} value={value} onChange={(v) => onChange(v, true)} suffix="% of loan" max={20} aside={toggle} hint={hint} />
  ) : (
    <MoneyInput label={label} value={value} onChange={(v) => onChange(v, false)} aside={toggle} hint={hint} />
  )
}
