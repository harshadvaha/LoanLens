import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { href, usePageFocus, useRoute } from './ui/router'
import Home from './pages/Home'
import NewLoan from './pages/NewLoan'
import { LoanDetail, LoanForm, MyLoans } from './pages/MyLoans'
import Optimize from './pages/Optimize'
import Prepay from './pages/Prepay'
import Compare from './pages/Compare'
import Refinance from './pages/Refinance'

const Rates = lazy(() => import('./pages/Rates'))
const Tools = lazy(() => import('./pages/Tools'))
const Learn = lazy(() => import('./pages/Learn'))

const I = {
  home: 'M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  calc: 'M5 3h14v18H5zM8 7h8M8 12h2m3 0h3M8 16h2m3 0h3',
  loans: 'M4 6h16M4 12h16M4 18h10',
  opt: 'M4 18 10 12l4 4 6-8M14 8h6v6',
  cmp: 'M8 4v16M16 4v16M4 8h8M12 16h8',
  ref: 'M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4',
  rate: 'M5 19 19 5M7 7h.01M17 17h.01',
  tools: 'M14 6a4 4 0 0 0 5 5l-9 9-3-3 9-9a4 4 0 0 0-2-2z',
  learn: 'M4 5h7a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5h-7v14h7z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  prepay: 'M12 3v18M5 10l7-7 7 7',
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

const NAV: { group?: string; path: string; label: string; icon: string }[] = [
  { path: '/', label: 'Home', icon: I.home },
  { group: 'Calculate', path: '/new', label: 'New loan', icon: I.calc },
  { path: '/compare', label: 'Compare offers', icon: I.cmp },
  { group: 'Your loans', path: '/loans', label: 'My loans', icon: I.loans },
  { path: '/optimize', label: 'Optimise', icon: I.opt },
  { path: '/prepay', label: 'Prepayment', icon: I.prepay },
  { path: '/refinance', label: 'Refinance', icon: I.ref },
  { group: 'Understand', path: '/rates', label: 'Interest rates', icon: I.rate },
  { path: '/tools', label: 'Tools', icon: I.tools },
  { path: '/learn', label: 'Learn', icon: I.learn },
]

const isActive = (current: string, p: string) => (p === '/' ? current === '/' : current === p || current.startsWith(p + '/'))

function Brand() {
  return (
    <a className="brand" href={href('/')} aria-label="LoanLens home">
      <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="6" fill="var(--ink)" />
        <rect x="6" y="19" width="13" height="5" fill="var(--paper)" />
        <rect x="19" y="19" width="7" height="5" fill="var(--interest)" />
        <rect x="6" y="9" width="20" height="2" fill="var(--paper)" />
      </svg>
      <span className="brand-name">LoanLens</span>
    </a>
  )
}

export default function App() {
  const route = useRoute()
  const [more, setMore] = useState(false)
  usePageFocus(route.path)
  useEffect(() => setMore(false), [route.path])

  const p = route.parts
  let page: ReactNode
  switch (p[0]) {
    case undefined:
      page = <Home />
      break
    case 'new':
      page = <NewLoan />
      break
    case 'loans':
      page = !p[1] ? <MyLoans /> : p[1] === 'new' ? <LoanForm /> : p[2] === 'edit' ? <LoanForm id={p[1]} /> : <LoanDetail id={p[1]} />
      break
    case 'optimize':
      page = <Optimize />
      break
    case 'prepay':
      page = <Prepay />
      break
    case 'compare':
      page = <Compare />
      break
    case 'refinance':
      page = <Refinance />
      break
    case 'rates':
      page = <Rates />
      break
    case 'tools':
      page = <Tools id={p[1]} />
      break
    case 'learn':
      page = <Learn />
      break
    default:
      page = (
        <div className="stack">
          <h1 className="page-title">Page not found</h1>
          <a href={href('/')}>Go to the start</a>
        </div>
      )
  }

  const tabs = [
    { path: '/', label: 'Home', icon: I.home },
    { path: '/new', label: 'Calculate', icon: I.calc },
    { path: '/loans', label: 'My loans', icon: I.loans },
    { path: '/optimize', label: 'Optimise', icon: I.opt },
  ]
  const moreActive = !tabs.some((t) => isActive(route.path, t.path))

  return (
    <div className="shell">
      <a href="#main" className="sr-only" onClick={(e) => (e.preventDefault(), document.querySelector<HTMLElement>('main h1')?.focus())}>
        Skip to content
      </a>
      <nav className="sidebar" aria-label="Main">
        <Brand />
        {NAV.map((n) => (
          <div key={n.path}>
            {n.group && <div className="nav-group">{n.group}</div>}
            <a className="nav-link" href={href(n.path)} aria-current={isActive(route.path, n.path) ? 'page' : undefined}>
              <Icon d={n.icon} />
              {n.label}
            </a>
          </div>
        ))}
        <div className="sidebar-foot">
          Your numbers stay in this browser. No sign-in, no tracking, no lender commissions.
        </div>
      </nav>

      <header className="topbar">
        <Brand />
        <a className="btn btn-s" href={href('/learn')}>
          Learn
        </a>
      </header>

      <main className="main" id="main">
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <div className="fade-in" key={route.path}>
            {page}
          </div>
        </Suspense>
        <footer className="footer">
          <p>
            <strong style={{ color: 'var(--ink-2)' }}>Your calculations stay in your browser.</strong> Nothing you enter is sent anywhere. LoanLens does not sell loans
            or receive commissions from lenders.
          </p>
          <p>
            This tool is for financial education and calculation. Loan terms, rates, taxes and regulations vary. Verify important decisions with the lender and a
            relevant professional.
          </p>
        </footer>
      </main>

      <nav className="tabbar" aria-label="Main">
        {tabs.map((t) => (
          <a key={t.path} className="tab" href={href(t.path)} aria-current={isActive(route.path, t.path) ? 'page' : undefined}>
            <Icon d={t.icon} />
            {t.label}
          </a>
        ))}
        <button className="tab" type="button" aria-expanded={more} aria-current={moreActive ? 'page' : undefined} onClick={() => setMore(true)}>
          <Icon d={I.more} />
          More
        </button>
      </nav>
      {more && (
        <>
          <div className="sheet-backdrop" onClick={() => setMore(false)} />
          <div className="sheet" role="dialog" aria-label="More sections">
            {NAV.filter((n) => !tabs.some((t) => t.path === n.path)).map((n) => (
              <a key={n.path} className="nav-link" href={href(n.path)} aria-current={isActive(route.path, n.path) ? 'page' : undefined}>
                <Icon d={n.icon} />
                {n.label}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
