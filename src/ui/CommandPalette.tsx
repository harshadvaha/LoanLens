import { useEffect, useMemo, useRef, useState } from 'react'
import { compact, loanType, pct } from '../locale'
import { TOOLS } from '../pages/toolList'
import { useStore } from '../store/loans'
import { navigate } from './router'

export interface PaletteItem {
  id: string
  group: string
  label: string
  sub?: string
  icon?: string
  keywords?: string
  run: () => void
}

const SEARCH = 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5'

function Icon({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

/** Raycast-style launcher: ⌘K / Ctrl+K from anywhere. Searches pages, tools, saved loans and actions. */
export function CommandPalette({ open, onClose, pages, actions }: { open: boolean; onClose: () => void; pages: PaletteItem[]; actions: PaletteItem[] }) {
  const store = useStore()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)

  const all = useMemo<PaletteItem[]>(() => {
    const tools: PaletteItem[] = TOOLS.filter((t) => t.id).map((t) => ({
      id: 'tool-' + t.id,
      group: 'Tools',
      label: t.title,
      sub: t.sub,
      icon: 'M14 6a4 4 0 0 0 5 5l-9 9-3-3 9-9a4 4 0 0 0-2-2z',
      run: () => navigate('/tools/' + t.id),
    }))
    const loans: PaletteItem[] = store.loans.map((l) => ({
      id: 'loan-' + l.id,
      group: 'Your loans',
      label: l.name || loanType(l.type).label,
      sub: `${compact(l.principal)} · ${pct(l.rate)}`,
      icon: 'M4 6h16M4 12h16M4 18h10',
      keywords: loanType(l.type).label,
      run: () => navigate('/loans/' + l.id),
    }))
    return [...pages, ...loans, ...tools, ...actions]
  }, [pages, actions, store.loans])

  const results = useMemo(() => {
    const terms = q.toLowerCase().trim().split(/\s+/).filter(Boolean)
    if (!terms.length) return all
    return all
      .map((it) => {
        const hay = `${it.label} ${it.sub ?? ''} ${it.keywords ?? ''} ${it.group}`.toLowerCase()
        if (!terms.every((t) => hay.includes(t))) return null
        const score = it.label.toLowerCase().startsWith(terms[0]) ? 0 : it.label.toLowerCase().includes(terms[0]) ? 1 : 2
        return { it, score }
      })
      .filter((x): x is { it: PaletteItem; score: number } => !!x)
      .sort((a, b) => a.score - b.score)
      .map((x) => x.it)
  }, [q, all])

  useEffect(() => {
    if (open) {
      setQ('')
      setSel(0)
      requestAnimationFrame(() => input.current?.focus())
    }
  }, [open])
  useEffect(() => setSel(0), [q])
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  if (!open) return null

  const choose = (it?: PaletteItem) => {
    if (!it) return
    onClose()
    it.run()
  }

  let lastGroup = ''
  return (
    <>
      <div className="palette-backdrop" onClick={onClose} />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search LoanLens">
        <div className="palette-input">
          <Icon d={SEARCH} />
          <input
            ref={input}
            value={q}
            placeholder="Search pages, tools, loans…"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={results[sel] ? `pi-${results[sel].id}` : undefined}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(results.length - 1, s + 1)))
              else if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(0, s - 1)))
              else if (e.key === 'Enter') (e.preventDefault(), choose(results[sel]))
              else if (e.key === 'Escape') (e.preventDefault(), onClose())
            }}
          />
          <kbd>esc</kbd>
        </div>
        {results.length === 0 ? (
          <div className="palette-empty">No matches for “{q}”.</div>
        ) : (
          <ul className="palette-list" id="palette-list" role="listbox" ref={list}>
            {results.map((it, i) => {
              const head = it.group !== lastGroup ? it.group : null
              lastGroup = it.group
              return (
                <li key={it.id} role="presentation">
                  {head && (
                    <div className="palette-group" role="presentation">
                      {head}
                    </div>
                  )}
                  <div
                    id={`pi-${it.id}`}
                    role="option"
                    aria-selected={i === sel}
                    className="palette-item"
                    onMouseMove={() => i !== sel && setSel(i)}
                    onClick={() => choose(it)}
                  >
                    {it.icon && <Icon d={it.icon} />}
                    <span>{it.label}</span>
                    {it.sub && <small>{it.sub}</small>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <div className="palette-foot" aria-hidden="true">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
        </div>
      </div>
    </>
  )
}
