import { Link } from 'react-router-dom'

/**
 * The mark: a pendulum on a pear card, its red bob caught mid-swing over the dashed path it
 * keeps. It is the first lab every demo opens with, drawn in the same three inks.
 */
export function LogoMark({ size = 38 }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="18" fill="var(--color-accent)" />
      <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="17.25" fill="none" stroke="var(--color-accent-deep)" strokeWidth="1.5" />
      <path d="M19 14.5h26" stroke="var(--color-ink)" strokeWidth="4" strokeLinecap="round" />
      <path d="M20.5 39.4A26 26 0 0 0 43.5 39.4" fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" strokeDasharray="0.5 4.5" />
      <path d="M32 15.5 42.6 37.2" stroke="var(--color-ink)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="43.5" cy="39.4" r="7.25" fill="var(--color-accent-3)" stroke="var(--color-ink)" strokeWidth="2.4" />
    </svg>
  )
}

export function Logo({ to = '/' }) {
  return (
    <Link to={to} className="brand" aria-label="ConceptLab AI">
      <LogoMark />
      <span className="brand-text" aria-hidden="true">
        ConceptLab <span className="brand-ai">AI</span>
      </span>
    </Link>
  )
}
