import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, Inbox } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { displayErrorField } from './errorFields.js'

const ALERT_ICONS = { info: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert, neutral: Info }

/** Inline message. Use role="alert" only for errors that appear in response to an action. */
export function Alert({ tone = 'info', title, children, action, role, className }) {
  const Icon = ALERT_ICONS[tone] || Info
  return (
    <div className={['alert', `alert-${tone}`, className].filter(Boolean).join(' ')} role={role}>
      <Icon aria-hidden="true" />
      <div style={{ flex: '1 1 14rem', minInlineSize: 0 }}>
        {title ? <p className="alert-title">{title}</p> : null}
        {children ? <div>{children}</div> : null}
      </div>
      {action ? <div style={{ flex: 'none', marginInlineStart: 'auto' }}>{action}</div> : null}
    </div>
  )
}

export function Spinner({ label, size = 20 }) {
  const { t } = useT()
  return (
    <span className="spinner-row" role="status">
      <LoaderCircle className="spin" size={size} aria-hidden="true" />
      <span>{label ?? t('common.states.loading')}</span>
    </span>
  )
}

/** Full-area loading placeholder shaped like content (prevents layout jump). */
export function LoadingBlock({ lines = 3, height }) {
  const { t } = useT()
  return (
    <div role="status" aria-label={t('common.a11y.loading')} className="stack-sm">
      {height ? <div className="skeleton" style={{ blockSize: height }} /> : null}
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton" style={{ blockSize: '1rem', inlineSize: `${90 - i * 12}%` }} />
      ))}
    </div>
  )
}

/**
 * Empty/zero state with a next action. `headingLevel` (default 3) lets a page whose whole
 * content is this state (e.g. "Lab not found") give it the page's <h1>.
 */
export function EmptyState({ icon: Icon = Inbox, title, children, action, headingLevel = 3 }) {
  const Heading = `h${Math.min(6, Math.max(1, Number(headingLevel) || 3))}`
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={26} aria-hidden="true" />
      </span>
      {title ? <Heading className="empty-title">{title}</Heading> : null}
      {children ? <div className="prose">{children}</div> : null}
      {action}
    </div>
  )
}

/** Translate an ApiError (or any error) into a user-facing sentence. */
export function useErrorText() {
  const { t, lang } = useT()
  return (error) => {
    if (!error) return ''
    if (error.name === 'AbortError') return ''
    const code = error.code || 'generic'
    const vars = { ...(error.extra || {}) }
    const text = t(`errors.${code}`, vars)
    if (text.startsWith('⟦') || text === code) return (lang === 'en' && error.message) || t('errors.generic')
    return text
  }
}

export function ErrorMessage({ error, onRetry, title }) {
  const { t, lang } = useT()
  const errorText = useErrorText()
  if (!error) return null
  const text = errorText(error)
  if (!text) return null
  return (
    <Alert
      tone="danger"
      role="alert"
      title={title}
      action={
        onRetry ? (
          <button type="button" className="btn btn-sm" onClick={onRetry}>
            {t('common.actions.retry')}
          </button>
        ) : null
      }
    >
      {text}
      {error.fields ? (
        <ul className="small" style={{ margin: '0.35rem 0 0', paddingInlineStart: '1.1rem' }}>
          {Object.entries(error.fields)
            .slice(0, 6)
            .map(([field, msg], index) => {
              const detail = displayErrorField(field, msg, lang, index)
              return (
              <li key={field}>
                <span>{detail.field}</span>: {detail.message}
              </li>
              )
            })}
        </ul>
      ) : null}
    </Alert>
  )
}

export function ProgressBar({ value, label }) {
  const pct = Math.round(Math.max(0, Math.min(1, value || 0)) * 100)
  return (
    <div className="stack-sm">
      {label ? <span className="small muted">{label}</span> : null}
      <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <span style={{ inlineSize: `${pct}%` }} />
      </div>
    </div>
  )
}
