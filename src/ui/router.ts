/** Minimal hash router: works under any GitHub Pages path and survives refresh. */
import { useEffect, useSyncExternalStore } from 'react'

export interface Route {
  path: string
  parts: string[]
  query: URLSearchParams
}

function parse(): Route {
  const h = window.location.hash.replace(/^#/, '') || '/'
  const [p, q = ''] = h.split('?')
  const path = p.startsWith('/') ? p : '/' + p
  return { path, parts: path.split('/').filter(Boolean), query: new URLSearchParams(q) }
}

let current = parse()
const subs = new Set<() => void>()
window.addEventListener('hashchange', () => {
  current = parse()
  subs.forEach((s) => s())
})

export function useRoute(): Route {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => current,
  )
}

export function href(path: string, query?: Record<string, string | number | undefined>): string {
  const q = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
        .join('&')
    : ''
  return `#${path}${q ? '?' + q : ''}`
}

export function navigate(path: string, query?: Record<string, string | number | undefined>) {
  window.location.hash = href(path, query).slice(1)
}

/** Scroll to top and move focus to the page heading on route change (for keyboard and screen-reader users). */
export function usePageFocus(path: string) {
  useEffect(() => {
    window.scrollTo(0, 0)
    const h = document.querySelector<HTMLElement>('main h1')
    if (h) {
      h.setAttribute('tabindex', '-1')
      h.focus({ preventScroll: true })
    }
  }, [path])
}
