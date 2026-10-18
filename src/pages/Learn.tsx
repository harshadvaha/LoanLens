import { useState } from 'react'
import { fmtDate, locale } from '../locale'
import { TERMS } from '../locale/learn.in'
import { PageHead, Section, Source } from '../ui/bits'
import { Segmented } from '../ui/inputs'

export default function Learn() {
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'terms' | 'rules' | 'tax'>('terms')
  const terms = TERMS.filter((t) => !q || (t.term + t.plain).toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="stack-l" style={{ maxWidth: 860 }}>
      <PageHead eyebrow="Learn" title="How loans actually work" lede="Short, plain explanations with a worked example, why it matters, the common mistake, and what to ask your lender." />
      <Segmented
        label="Section"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'terms', label: 'Concepts' },
          { value: 'rules', label: 'Borrower rules (RBI)' },
          { value: 'tax', label: 'Tax' },
        ]}
      />
      {tab === 'terms' && (
        <div className="stack">
          <input className="text-input" placeholder="Search: spread, prepayment, APR…" aria-label="Search concepts" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 420 }} />
          <nav className="chips" aria-label="Jump to concept">
            {terms.map((t) => (
              <a key={t.id} className="chip" href={`#/learn`} onClick={(e) => (e.preventDefault(), document.getElementById(`t-${t.id}`)?.scrollIntoView({ behavior: 'smooth' }))} style={{ textDecoration: 'none' }}>
                {t.term.split(' (')[0]}
              </a>
            ))}
          </nav>
          <div>
            {terms.map((t) => (
              <article key={t.id} id={`t-${t.id}`} className="glossary-item">
                <h2 className="h2" style={{ fontSize: 20 }}>
                  {t.term}
                </h2>
                <p style={{ marginTop: 6 }}>{t.plain}</p>
                <dl>
                  <dt>Example</dt>
                  <dd>{t.example}</dd>
                  <dt>Why it matters</dt>
                  <dd>{t.why}</dd>
                  <dt>Common mistake</dt>
                  <dd>{t.mistake}</dd>
                  <dt>Ask the lender</dt>
                  <dd>“{t.ask}”</dd>
                </dl>
                {t.tool && (
                  <a className="small" href={`#${t.tool.to}`} style={{ display: 'inline-block', marginTop: 8 }}>
                    Try it: {t.tool.label} →
                  </a>
                )}
              </article>
            ))}
            {!terms.length && <p className="muted">Nothing matches “{q}”.</p>}
          </div>
        </div>
      )}
      {(tab === 'rules' || tab === 'tax') && (
        <div className="stack">
          <div className="callout warn small">
            <strong>Verify current rules before making a financial decision.</strong> Rules and tax law change. Each item shows the date of its source. This is general information, not
            personal tax or legal advice.
          </div>
          {(tab === 'rules' ? locale.regulatory : locale.tax).map((r) => (
            <Section key={r.title} title={r.title}>
              <p>{r.body}</p>
              <Source label={r.source.label} url={r.source.url} asOf={fmtDate(r.asOf)} />
            </Section>
          ))}
        </div>
      )}
    </div>
  )
}
