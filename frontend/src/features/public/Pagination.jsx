import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import './pagination.css'

/** Page numbers to show: 1 … 4 5 [6] 7 8 … 20 (null = gap). */
export function pageWindow(page, pages, radius = 1) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const out = [1]
  const start = Math.max(2, page - radius)
  const end = Math.min(pages - 1, page + radius)
  if (start > 2) out.push(null)
  for (let p = start; p <= end; p += 1) out.push(p)
  if (end < pages - 1) out.push(null)
  out.push(pages)
  return out
}

/**
 * Server pagination: "Showing 13 to 24 of 40", previous and next, the page numbers.
 * Renders nothing when everything fits on one page. On a phone the steps keep only their
 * chevrons (the words stay for screen readers); on a wide screen only their words.
 */
export default function Pagination({ page, pageSize, total, onChange, label }) {
  const { t, fmt } = useT()
  const pages = Math.max(1, Math.ceil((total || 0) / (pageSize || 1)))
  if (!total || pages <= 1) return null
  const current = Math.min(Math.max(1, page), pages)
  const from = (current - 1) * pageSize + 1
  const to = Math.min(total, current * pageSize)
  const go = (p) => {
    if (p < 1 || p > pages || p === current) return
    onChange(p)
  }
  return (
    <nav className="pager" aria-label={label || t('gallery.pagination.label')}>
      <p className="pager-summary small muted">
        {t('gallery.pagination.summary', { from: fmt.number(from, 0), to: fmt.number(to, 0), total: fmt.number(total, 0) })}
      </p>
      <div className="pager-controls">
        <button type="button" className="btn btn-sm pager-step" onClick={() => go(current - 1)} disabled={current <= 1}>
          <ChevronLeft aria-hidden="true" />
          <span className="pager-text">{t('common.actions.previous')}</span>
        </button>
        <ol className="pager-pages list-reset">
          {pageWindow(current, pages).map((p, i) =>
            p === null ? (
              <li key={`gap-${i}`} className="pager-gap" aria-hidden="true">
                …
              </li>
            ) : (
              <li key={p}>
                <button
                  type="button"
                  className={['pager-page', p === current && 'current'].filter(Boolean).join(' ')}
                  aria-current={p === current ? 'page' : undefined}
                  aria-label={t('gallery.pagination.page', { page: p })}
                  onClick={() => go(p)}
                >
                  {fmt.number(p, 0)}
                </button>
              </li>
            ),
          )}
        </ol>
        <button type="button" className="btn btn-sm pager-step" onClick={() => go(current + 1)} disabled={current >= pages}>
          <span className="pager-text">{t('common.actions.next')}</span>
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}
