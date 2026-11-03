import { Link } from 'react-router-dom'
import { Info, MessageSquareHeart } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { EmptyState, ErrorMessage } from '../../components/ui/index.js'
import Pagination from '../public/Pagination.jsx'
import { pageFrom, queryString, useClampedPage, useDocumentTitle, useFetch, useUrlFilters } from '../public/hooks.js'
import { AdminHeader, AdminNote, AdminTable, Cell, StarRating, TableSkeleton } from './adminShared.jsx'
import { asUtc } from './adminUtils.js'

const PAGE_SIZE = 25
const DEFAULTS = { page: '1' }

export default function AdminFeedbackPage() {
  const { t, fmt } = useT()
  useDocumentTitle(t('admin.feedback.metaTitle'))
  const [filters, setFilters] = useUrlFilters(DEFAULTS)
  const page = pageFrom(filters.page)
  const { data, error, loading, stale, initial, reload } = useFetch(`/api/admin/feedback${queryString({ page, page_size: PAGE_SIZE })}`)
  const items = data?.items || []
  const total = data?.total || 0
  const totalText = fmt.number(total, 0)
  // An old "?page=N" past the end jumps to the last real page instead of a false empty state.
  const correcting = useClampedPage({ page, total, pageSize: data?.page_size || PAGE_SIZE, itemCount: items.length, loading, setFilters })

  const columns = [
    { key: 'rating', label: t('admin.feedback.colRating') },
    { key: 'comment', label: t('admin.feedback.colComment') },
    { key: 'lab', label: t('admin.feedback.colLab') },
    { key: 'time', label: t('admin.feedback.colTime') },
  ]

  return (
    <div className="admin-page">
      <AdminHeader title={t('admin.feedback.title')} lead={t('admin.feedback.lead')} />
      <AdminNote icon={Info}>{t('admin.feedback.privacyNote')}</AdminNote>
      <div className="admin-count">
        {/* No count after a failed load: the total is unknown, never zero. */}
        <p aria-live="polite">{initial ? t('common.states.loading') : data ? t('admin.feedback.count', { count: total, n: totalText }) : null}</p>
      </div>
      {error ? (
        <ErrorMessage error={error} onRetry={reload} title={t('admin.common.loadError')} />
      ) : initial || correcting ? (
        <TableSkeleton rows={5} columns={4} />
      ) : !items.length ? (
        <EmptyState icon={MessageSquareHeart} title={t('admin.feedback.empty')}>
          <p>{t('admin.feedback.emptyBody')}</p>
        </EmptyState>
      ) : (
        <>
          <AdminTable caption={t('admin.feedback.caption')} columns={columns} stale={stale} busy={loading} className="admin-feedback-table">
            {items.map((item) => (
              <tr key={item.id} role="row">
                <Cell label={t('admin.feedback.colRating')} className="cell-first">
                  <StarRating value={item.rating} />
                </Cell>
                <Cell label={t('admin.feedback.colComment')} className="cell-wide">
                  {item.comment ? <p className="feedback-comment">{item.comment}</p> : <span className="feedback-empty">{t('admin.feedback.noComment')}</span>}
                </Cell>
                <Cell label={t('admin.feedback.colLab')} className="cell-wide">
                  <Link to={`/app/labs/${item.lab_id}`}>{item.lab_title || t('admin.feedback.untitled')}</Link>
                </Cell>
                <Cell label={t('admin.feedback.colTime')} className="nowrap cell-second">
                  <time dateTime={asUtc(item.created_at)}>{fmt.dateTime(asUtc(item.created_at))}</time>
                </Cell>
              </tr>
            ))}
          </AdminTable>
          <Pagination page={page} pageSize={data?.page_size || PAGE_SIZE} total={total} onChange={(p) => setFilters({ page: String(p) })} />
        </>
      )}
    </div>
  )
}
