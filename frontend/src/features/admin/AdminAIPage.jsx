import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bot, CircleAlert, Lock } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { Badge, Button, EmptyState, ErrorMessage, SelectField } from '../../components/ui/index.js'
import Pagination from '../public/Pagination.jsx'
import { pageFrom, queryString, useClampedPage, useDocumentTitle, useFetch, useUrlFilters } from '../public/hooks.js'
import { AdminHeader, AdminNote, AdminTable, Cell, FeatureName, NoValue, TableSkeleton, useFeatureLabel, useLatency } from './adminShared.jsx'
import { asUtc } from './adminUtils.js'

const PAGE_SIZE = 50
const DEFAULTS = { feature: '', status: '', page: '1' }

const missing = (value) => value === null || value === undefined

export default function AdminAIPage() {
  const { t, fmt, locale } = useT()
  const featureLabel = useFeatureLabel()
  const latency = useLatency()
  const timeOnly = useMemo(() => new Intl.DateTimeFormat(locale, { timeStyle: 'short' }), [locale])
  useDocumentTitle(t('admin.ai.metaTitle'))
  const [filters, setFilters, clearAll] = useUrlFilters(DEFAULTS)
  const status = ['ok', 'error'].includes(filters.status) ? filters.status : ''
  const feature = (filters.feature || '').slice(0, 40)
  const page = pageFrom(filters.page)
  const path = `/api/admin/ai-calls${queryString({ feature, status, page, page_size: PAGE_SIZE })}`
  const { data, error, loading, stale, initial, reload } = useFetch(path)
  const statsReq = useFetch('/api/admin/stats')
  const items = data?.items || []
  const total = data?.total || 0
  const totalText = fmt.number(total, 0)
  const hasFilters = Boolean(feature || status)
  // An old "?page=N" past the end jumps to the last real page instead of a false empty state.
  const correcting = useClampedPage({ page, total, pageSize: data?.page_size || PAGE_SIZE, itemCount: items.length, loading, setFilters })

  const knownFeatures = (statsReq.data?.ai_by_feature || []).map((row) => row.feature).filter(Boolean)
  const featureOptions = [...new Set([...knownFeatures, ...(feature ? [feature] : [])])].sort()

  const columns = [
    { key: 'time', label: t('admin.ai.time') },
    { key: 'feature', label: t('admin.ai.feature') },
    { key: 'model', label: t('admin.ai.model') },
    { key: 'result', label: t('admin.ai.result') },
    { key: 'latency', label: t('admin.ai.latency'), className: 'num' },
    { key: 'in', label: t('admin.ai.tokensIn'), className: 'num' },
    { key: 'out', label: t('admin.ai.tokensOut'), className: 'num' },
    { key: 'lab', label: t('admin.ai.lab') },
  ]

  return (
    <div className="admin-page">
      <AdminHeader title={t('admin.ai.title')} lead={t('admin.ai.lead')} />
      <AdminNote icon={Lock}>{t('admin.ai.privacyNote')}</AdminNote>
      <div className="admin-filters" role="group" aria-label={t('admin.common.filters')}>
        <SelectField
          label={t('admin.ai.feature')}
          value={feature}
          onChange={(e) => setFilters({ feature: e.target.value })}
          options={[
            { value: '', label: t('admin.ai.allFeatures') },
            ...featureOptions.map((f) => {
              const name = featureLabel(f)
              return { value: f, label: name === f ? f : `${name} (${f})` }
            }),
          ]}
          className="admin-filter-wide"
        />
        <SelectField
          label={t('admin.ai.status')}
          value={status}
          onChange={(e) => setFilters({ status: e.target.value })}
          options={[
            { value: '', label: t('admin.ai.allStatuses') },
            { value: 'ok', label: t('admin.ai.ok') },
            { value: 'error', label: t('admin.ai.error') },
          ]}
        />
      </div>

      <div className="admin-count">
        {/* No count after a failed load: the total is unknown, never zero. */}
        <p aria-live="polite">{initial ? t('common.states.loading') : data ? t('admin.ai.count', { count: total, n: totalText }) : null}</p>
        {hasFilters && items.length ? (
          <Button size="sm" variant="ghost" onClick={clearAll}>
            {t('common.actions.clearFilters')}
          </Button>
        ) : null}
      </div>

      {error ? (
        <ErrorMessage error={error} onRetry={reload} title={t('admin.common.loadError')} />
      ) : initial || correcting ? (
        <TableSkeleton rows={8} columns={8} />
      ) : !items.length ? (
        <EmptyState
          icon={Bot}
          title={hasFilters ? t('admin.common.noResults') : t('admin.ai.empty')}
          action={hasFilters ? <Button onClick={clearAll}>{t('common.actions.clearFilters')}</Button> : null}
        >
          <p>{hasFilters ? t('admin.common.noResultsBody') : t('admin.ai.emptyBody')}</p>
        </EmptyState>
      ) : (
        <>
          <AdminTable caption={t('admin.ai.caption')} columns={columns} stale={stale} busy={loading} className="admin-ai-table">
            {items.map((call) => (
              <tr key={call.id} role="row">
                <Cell label={t('admin.ai.time')} className="nowrap ai-time">
                  <time dateTime={asUtc(call.created_at)}>
                    <span className="cell-line">{fmt.date(asUtc(call.created_at))}</span>{' '}
                    <span className="cell-sub">{call.created_at ? timeOnly.format(new Date(asUtc(call.created_at))) : null}</span>
                  </time>
                </Cell>
                <th scope="row" role="rowheader">
                  <FeatureName id={call.feature} />
                </th>
                <Cell label={t('admin.ai.model')} className="ai-model">
                  <span className="mono model-id">{call.model}</span>
                </Cell>
                <Cell label={t('admin.ai.result')} className="ai-result">
                  {call.status === 'ok' ? (
                    <span className="state-quiet">{t('admin.ai.ok')}</span>
                  ) : (
                    <Badge tone="danger" icon={CircleAlert}>
                      {t('admin.ai.error')}
                    </Badge>
                  )}
                  {call.error_code ? <span className="cell-sub mono">{call.error_code}</span> : null}
                  {call.http_status ? <span className="cell-sub">{t('admin.ai.httpStatus', { code: call.http_status })}</span> : null}
                </Cell>
                <Cell label={t('admin.ai.latency')} className="num ai-latency">
                  {latency(call.latency_ms)}
                </Cell>
                <Cell label={t('admin.ai.tokensIn')} className="num ai-in">
                  {missing(call.input_tokens) ? <NoValue>{t('admin.common.unknown')}</NoValue> : fmt.number(call.input_tokens, 0)}
                </Cell>
                <Cell label={t('admin.ai.tokensOut')} className="num ai-out">
                  {missing(call.output_tokens) ? <NoValue>{t('admin.common.unknown')}</NoValue> : fmt.number(call.output_tokens, 0)}
                </Cell>
                <Cell label={t('admin.ai.lab')} className="nowrap ai-lab">
                  {call.lab_id ? <Link to={`/app/labs/${call.lab_id}`}>{t('admin.ai.openLab')}</Link> : <NoValue>{t('admin.common.none')}</NoValue>}
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
