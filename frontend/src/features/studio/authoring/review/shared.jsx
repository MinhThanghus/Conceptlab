import { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, CircleCheck, CircleDashed } from 'lucide-react'
import { useT } from '../../../../i18n/index.jsx'
import { IconButton } from '../../../../components/ui/index.js'

/**
 * Context for the review editors: { setResult(fn), announce(text), openSam(index), lab, assetUrl(id) }.
 * The value is stable so memoized item editors only re-render when their own item changes.
 */
export const ReviewContext = createContext(null)
export const useReview = () => useContext(ReviewContext)

export function ReviewSection({ id, title, description, progress, children, footer }) {
  const { t } = useT()
  const complete = progress && progress.total > 0 && progress.done === progress.total
  return (
    <section id={`review-${id}`} className="card au-rsection" aria-labelledby={`review-${id}-title`}>
      <header className="au-rsection-head">
        <div className="au-rsection-text">
          <h3 id={`review-${id}-title`} tabIndex={-1}>
            {title}
          </h3>
          {description ? <p className="small muted">{description}</p> : null}
        </div>
        {progress && progress.total > 0 ? (
          <span className={`badge ${complete ? 'badge-success' : 'badge-outline'}`}>
            {complete ? <CircleCheck aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}
            {t('review.sectionCount', { done: progress.done, total: progress.total })}
          </span>
        ) : null}
      </header>
      {children}
      {footer ? <div className="au-rsection-foot">{footer}</div> : null}
    </section>
  )
}

/** One reviewable item with its "checked" box (state shown with icon + text, not colour only). */
export function ItemShell({ title, subtitle, confirmed, onConfirm, confirmLabel, actions, children, className }) {
  const { t } = useT()
  const id = useId().replace(/[:]/g, '')
  return (
    <article className={['au-item', confirmed ? 'is-confirmed' : '', className].filter(Boolean).join(' ')} aria-labelledby={`${id}-t`}>
      <header className="au-item-head">
        <div className="au-item-title-wrap">
          <p className="au-item-title" id={`${id}-t`}>
            {title}
          </p>
          {subtitle ? <p className="small muted au-item-subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="au-item-actions">{actions}</div> : null}
      </header>
      {children}
      {onConfirm ? (
        <footer className="au-item-foot">
          <label className="check au-confirm">
            <input type="checkbox" checked={Boolean(confirmed)} onChange={(e) => onConfirm(e.target.checked)} />
            <span>{confirmLabel || t('review.confirmItem')}</span>
          </label>
          <span className={['au-item-state', confirmed ? 'is-ok' : ''].filter(Boolean).join(' ')}>
            {confirmed ? <CircleCheck aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}
            {confirmed ? t('common.ai.confirmed') : t('review.notChecked')}
          </span>
        </footer>
      ) : null}
    </article>
  )
}

/** Up/down buttons; at the ends they stay focusable (aria-disabled) so keyboard focus is kept. */
export function MoveButtons({ index, count, name, onMove }) {
  const { t } = useT()
  const first = index === 0
  const last = index === count - 1
  return (
    <>
      <IconButton
        icon={ArrowUp}
        size="sm"
        label={t('review.moveUp', { name })}
        aria-disabled={first || undefined}
        className={first ? 'is-inert' : undefined}
        onClick={() => !first && onMove(index, index - 1)}
      />
      <IconButton
        icon={ArrowDown}
        size="sm"
        label={t('review.moveDown', { name })}
        aria-disabled={last || undefined}
        className={last ? 'is-inert' : undefined}
        onClick={() => !last && onMove(index, index + 1)}
      />
    </>
  )
}

/**
 * Text input for a list of symbols ("L, g"). Keeps what the user types while focused and
 * commits the parsed list on every change.
 */
export function ListTextInput({ value, onChange, parse, format = (list) => (list || []).join(', '), className, ...rest }) {
  const [draft, setDraft] = useState(() => format(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(format(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <input
      className={['input', className].filter(Boolean).join(' ')}
      value={draft}
      onFocus={() => {
        focused.current = true
      }}
      onBlur={() => {
        focused.current = false
        setDraft(format(value))
      }}
      onChange={(e) => {
        setDraft(e.target.value)
        onChange(parse(e.target.value))
      }}
      {...rest}
    />
  )
}

/** Remember a per-browser flag (used for "topic checked", which the analysis schema has no field for). */
export function useStoredFlag(key) {
  const read = () => {
    try {
      return window.localStorage.getItem(key) === '1'
    } catch {
      return false
    }
  }
  const [value, setValue] = useState(read)
  useEffect(() => {
    setValue(read())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const set = (next) => {
    setValue(Boolean(next))
    try {
      if (next) window.localStorage.setItem(key, '1')
      else window.localStorage.removeItem(key)
    } catch {
      /* storage unavailable: the checkbox still works for this visit */
    }
  }
  return [value, set]
}

export function focusById(id) {
  window.requestAnimationFrame(() => {
    const el = document.getElementById(id)
    if (!el) return
    el.focus({ preventScroll: true })
    el.scrollIntoView({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  })
}
