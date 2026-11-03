import { Star } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { useErrorText } from '../../components/ui/index.js'
import { latencyParts, parseFeature } from './adminUtils.js'
import './admin.css'

/** Friendly, translated name of an AI feature id ("Tạo phần tương tác: Mô phỏng"); unknown ids are shown as-is. */
export function useFeatureLabel() {
  const { t } = useT()
  return (feature) => {
    const parsed = parseFeature(feature)
    if (!parsed) return String(feature ?? '').trim() || t('admin.common.unknown')
    const label = t(`admin.features.${parsed.key}`)
    return parsed.kind ? `${label}: ${t(`blocks.types.${parsed.kind}`)}` : label
  }
}

/**
 * A feature in a table cell: its translated name over the logged id. An id the console has no name for
 * (a one-off script, a new feature) is shown once, as the id it is.
 */
export function FeatureName({ id }) {
  const label = useFeatureLabel()
  const raw = String(id ?? '').trim()
  if (!parseFeature(raw)) return <span className="cell-title mono">{label(raw)}</span>
  return (
    <>
      <span className="cell-title">{label(raw)}</span>
      <span className="cell-sub mono">{raw}</span>
    </>
  )
}

/** Translate admin guard errors in context (fallback: the generic error text). */
export function useAdminErrorText() {
  const { t } = useT()
  const errorText = useErrorText()
  return (error) => {
    if (error?.code === 'last_admin') return t('admin.guards.lastAdmin')
    if (error?.code === 'cannot_change_self') return t('admin.guards.self')
    return errorText(error)
  }
}

export function AdminHeader({ title, lead, actions }) {
  return (
    <header className="page-header admin-header">
      <div>
        <h1>{title}</h1>
        {lead ? <p>{lead}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </header>
  )
}

/** A quiet line of context under a page head (privacy, what an action does). */
export function AdminNote({ icon: Icon, children }) {
  return (
    <p className="admin-note">
      {Icon ? <Icon aria-hidden="true" /> : null}
      <span>{children}</span>
    </p>
  )
}

/** A value the data does not have, said in words (never a dash). */
export function NoValue({ children }) {
  return <span className="no-value">{children}</span>
}

/**
 * A table cell that carries its column name for the phone layout, where each row restacks
 * into a labelled block. The label is hidden from assistive tech: the column header already names it.
 */
export function Cell({ label, className, children, ...rest }) {
  return (
    <td role="cell" className={className} {...rest}>
      {label ? (
        <span className="cell-label" aria-hidden="true">
          {label}
        </span>
      ) : null}
      {children}
    </td>
  )
}

/**
 * Data table: sentence-case heads, horizontal rules only. `layout="stack"` restacks each row into a
 * labelled block on narrow screens so the row's name and its action stay in view; `layout="pin"` keeps
 * the table and pins the first column while it scrolls sideways (read-only tables).
 * Explicit table roles keep the semantics when CSS changes the display on phones.
 */
export function AdminTable({ caption, columns, layout = 'stack', stale, busy, className, children }) {
  return (
    <div className={['table-wrap', 'admin-table-wrap', stale && 'is-stale'].filter(Boolean).join(' ')} aria-busy={busy || undefined}>
      <table className={['table', 'admin-table', `admin-table-${layout}`, className].filter(Boolean).join(' ')} role="table">
        <caption className="visually-hidden">{caption}</caption>
        <thead role="rowgroup">
          <tr role="row">
            {columns.map((col) => (
              <th key={col.key} scope="col" role="columnheader" className={col.className}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">{children}</tbody>
      </table>
    </div>
  )
}

/** Loading placeholder in the shape of the table that is coming. */
export function TableSkeleton({ rows = 6, columns = 5 }) {
  const { t } = useT()
  return (
    <div className="admin-skeleton" role="status" aria-label={t('common.a11y.loading')}>
      <div className="admin-skeleton-head" aria-hidden="true">
        {Array.from({ length: columns }).map((_, c) => (
          <span key={c} className="skeleton" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="admin-skeleton-row" aria-hidden="true">
          {Array.from({ length: columns }).map((__, c) => (
            <span key={c} className="skeleton" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function StarRating({ value }) {
  const { t } = useT()
  const rating = Math.max(0, Math.min(5, Math.round(Number(value) || 0)))
  return (
    <span className="stars">
      <span className="stars-icons" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} className={n <= rating ? 'on' : 'off'} />
        ))}
      </span>
      <span className="stars-text">{t('admin.feedback.ratingOf', { value: rating })}</span>
    </span>
  )
}

/**
 * Horizontal bars for one series, in ink. The words carry identity; the count and the share sit in
 * their own aligned columns, so the bars never gate the data. With `zeroText(list)`, rows with nothing
 * in them fold into one line under the list, so the bars show only what exists.
 */
export function BarList({ items, label, emptyText, zeroText }) {
  const { fmt, t } = useT()
  const total = items.reduce((sum, item) => sum + (item.value || 0), 0)
  const max = Math.max(1, ...items.map((item) => item.value || 0))
  if (!total) return <p className="admin-bars-empty">{emptyText || t('admin.dashboard.noData')}</p>
  const shown = zeroText ? items.filter((item) => item.value) : items
  const folded = zeroText ? items.filter((item) => !item.value) : []
  return (
    <>
      <ul className="admin-bars list-reset" aria-label={label}>
        {shown.map((item) => (
          <li key={item.key} className={item.value ? undefined : 'is-zero'}>
            <span className="admin-bar-label">{item.label}</span>
            <span className="admin-bar-track" aria-hidden="true">
              {item.value ? <span className="admin-bar-fill" style={{ inlineSize: `${(item.value / max) * 100}%` }} /> : null}
            </span>
            <span className="admin-bar-count">{fmt.number(item.value, 0)}</span>
            <span className="admin-bar-share">{fmt.percent(item.value / total, 0)}</span>
          </li>
        ))}
      </ul>
      {folded.length ? (
        <p className="admin-bars-zero">{zeroText(folded.map((item) => item.label).join(', '))}</p>
      ) : null}
    </>
  )
}

/** "1,2 s" for one second or more, otherwise "850 ms" (a no-break space keeps the unit with its figure). */
export function useLatency() {
  const { fmt, t } = useT()
  return (ms) => {
    const parts = latencyParts(ms)
    return parts ? `${fmt.number(parts.value, parts.digits)} ${parts.unit}` : t('admin.common.unknown')
  }
}
