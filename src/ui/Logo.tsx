import { useId } from 'react'

/**
 * LoanLens mark: a lens that holds the loan. White = principal, coral = interest,
 * split by the falling balance curve. Same colours as the cost bar used across the app.
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7470FF" />
          <stop offset="1" stopColor="#4036CC" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}c`}>
          <path d="M9 32 Q32 5 55 32 Q32 59 9 32Z" />
        </clipPath>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${id}g)`} />
      <rect width="64" height="64" rx="15" fill={`url(#${id}s)`} />
      <g clipPath={`url(#${id}c)`}>
        <rect width="64" height="64" fill="#fff" />
        <path d="M6 21 C 24 22.5, 38 34, 58 54 L58 64 L6 64Z" fill="#FF7E52" />
      </g>
    </svg>
  )
}

export function Wordmark() {
  return (
    <span className="brand-name">
      Loan<span>Lens</span>
    </span>
  )
}

/** Static SVG string for the favicon (kept in sync with LogoMark). */
export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7470FF"/><stop offset="1" stop-color="#4036CC"/></linearGradient><clipPath id="c"><path d="M9 32 Q32 5 55 32 Q32 59 9 32Z"/></clipPath></defs><rect width="64" height="64" rx="15" fill="url(#g)"/><g clip-path="url(#c)"><rect width="64" height="64" fill="#fff"/><path d="M6 21 C 24 22.5, 38 34, 58 54 L58 64 L6 64Z" fill="#FF7E52"/></g></svg>`
