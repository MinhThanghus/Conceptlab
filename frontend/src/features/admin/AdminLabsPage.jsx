import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EyeOff, FlaskConical, Info, PencilRuler } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { post } from '../../lib/api.js'
import { Alert, Badge, Button, ConfirmDialog, EmptyState, ErrorMessage, SelectField, StatusBadge, useErrorText, useToast } from '../../components/ui/index.js'
import Pagination from '../public/Pagination.jsx'
import SearchField from '../public/SearchField.jsx'
import { sharePath } from '../public/classCode.js'
import { pageFrom, queryString, useClampedPage, useDebouncedSearch, useDocumentTitle, useFetch, useUrlFilters } from '../public/hooks.js'
import { AdminHeader, AdminNote, AdminTable, Cell, NoValue, TableSkeleton } from './adminShared.jsx'
import { asUtc } from './adminUtils.js'

const PAGE_SIZE = 25
const STATUSES = ['draft', 'published', 'archived']
const SPACES = ['school2lab', 'paper2explorer']
const DEFAULTS = { q: '', status: '', space: '', page: '1' }

const contentLang = (lab) => (['vi', 'en'].includes(lab.language) ? lab.language : undefined)

export default function AdminLabsPage() {
  const { t, fmt } = useT()
  const toast = useToast()
  const errorText = useErrorText()
  useDocumentTitle(t('admin.labs.metaTitle'))
  const [filters, setFilters, clearAll] = useUrlFilters(DEFAULTS)
  const status = STATUSES.includes(filters.status) ? filters.status : ''
  const space = SPACES.includes(filters.space) ? filters.space : ''
  const q = (filters.q || '').trim()
  const page = pageFrom(filters.page)
  const [search, setSearch] = useDebouncedSearch(q, (value) => setFilters({ q: value }))
  const path = `/api/admin/labs${queryString({ q, status, space, page, page_size: PAGE_SIZE })}`
  const { data, error, loading, stale, initial, reload, setData } = useFetch(path)
  const items = data?.items || []
  const total = data?.total || 0
  const totalText = fmt.number(total, 0)
  const hasFilters = Boolean(q || status || space)
  // An old "?page=N" past the end jumps to the last real page instead of a false empty state.
  const correcting = useClampedPage({ page, total, pageSize: data?.page_size || PAGE_SIZE, itemCount: items.length, loading, setFilters })

  const [target, setTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)

  const unpublish = async () => {
    if (!target) return
    setBusy(true)
    setActionError(null)
    try {
      const updated = await post(`/api/admin/labs/${target.id}/unpublish`)
      setData((current) => (current ? { ...current, items: current.items.map((lab) => (lab.id === updated.id ? updated : lab)) } : current))
      toast.success(t('admin.labs.unpublished', { title: target.title }))
      setTarget(null)
    } catch (err) {
      setActionError(err)
    } finally {
      setBusy(false)
    }
  }

  const clearFilters = () => {
    setSearch('')
    clearAll()
  }

  const columns = [
    { key: 'lab', label: t('admin.labs.colLab') },
    { key: 'owner', label: t('admin.labs.colOwner') },
    { key: 'subject', label: t('admin.labs.colSubject') },
    { key: 'status', label: t('admin.labs.colStatus') },
    { key: 'share', label: t('admin.labs.colShare') },
    { key: 'updated', label: t('admin.labs.colUpdated') },
    { key: 'actions', label: t('admin.labs.colActions') },
  ]

  return (
    <div className="admin-page">
      <AdminHeader title={t('admin.labs.title')} lead={t('admin.labs.lead')} />
      <AdminNote icon={Info}>{t('admin.labs.moderationNote')}</AdminNote>
      <div className="admin-filters" role="group" aria-label={t('admin.common.filters')}>
        <SearchField label={t('admin.labs.search')} value={search} onChange={setSearch} placeholder={t('admin.labs.searchPlaceholder')} />
        <SelectField
          label={t('admin.labs.status')}
          value={status}
          onChange={(e) => setFilters({ status: e.target.value })}
          options={[{ value: '', label: t('admin.labs.allStatuses') }, ...STATUSES.map((s) => ({ value: s, label: t(`common.status.${s}`) }))]}
        />
        <SelectField
          label={t('gallery.filters.space')}
          value={space}
          onChange={(e) => setFilters({ space: e.target.value })}
          options={[{ value: '', label: t('labs.my.allSpaces') }, ...SPACES.map((s) => ({ value: s, label: t(`common.spaces.${s}`) }))]}
        />
      </div>

      <div className="admin-count">
        {/* No count after a failed load: the total is unknown, never zero. */}
        <p aria-live="polite">{initial ? t('common.states.loading') : data ? t('admin.labs.count', { count: total, n: totalText }) : null}</p>
        {hasFilters && items.length ? (
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            {t('common.actions.clearFilters')}
          </Button>
        ) : null}
      </div>

      {error ? (
        <ErrorMessage error={error} onRetry={reload} title={t('admin.common.loadError')} />
      ) : initial || correcting ? (
        <TableSkeleton rows={6} columns={7} />
      ) : !items.length ? (
        <EmptyState
          icon={FlaskConical}
          title={hasFilters ? t('admin.common.noResults') : t('admin.labs.empty')}
          action={hasFilters ? <Button onClick={clearFilters}>{t('common.actions.clearFilters')}</Button> : null}
        >
          {hasFilters ? <p>{t('admin.common.noResultsBody')}</p> : null}
        </EmptyState>
      ) : (
        <>
          <AdminTable caption={t('admin.labs.caption')} columns={columns} stale={stale} busy={loading} className="admin-labs-table">
            {items.map((lab) => {
              const published = lab.status === 'published'
              return (
                <tr key={lab.id} role="row">
                  <th scope="row" role="rowheader">
                    <span className="cell-title" lang={contentLang(lab)}>
                      {lab.title}
                    </span>
                    {lab.topic ? (
                      <span className="cell-sub" lang={contentLang(lab)}>
                        {lab.topic}
                      </span>
                    ) : null}
                    <span className="cell-meta">
                      <span>{t(`common.spaces.${lab.space}`)}</span>
                      {lab.is_demo ? <Badge tone="warning">{t('gallery.card.demo')}</Badge> : null}
                    </span>
                  </th>
                  <Cell label={t('admin.labs.colOwner')}>{lab.owner?.name || <NoValue>{t('admin.common.unknown')}</NoValue>}</Cell>
                  <Cell label={t('admin.labs.colSubject')}>
                    <span className="cell-line">{t(`common.subjects.${lab.subject}`)}</span>
                    <span className="cell-sub">{t(`common.grades.${lab.grade}`)}</span>
                  </Cell>
                  <Cell label={t('admin.labs.colStatus')}>
                    <StatusBadge status={lab.status} />
                    {published ? <span className="cell-sub">{t(`common.visibility.${lab.visibility}`)}</span> : null}
                  </Cell>
                  {published && lab.share_code ? (
                    <Cell label={t('admin.labs.colShare')}>
                      <Link to={sharePath(lab.share_code)} target="_blank" rel="noopener">
                        <code>{lab.share_code}</code>
                        <span className="visually-hidden"> ({t('common.a11y.newWindow')})</span>
                      </Link>
                    </Cell>
                  ) : (
                    // A draft has no class code: the cell stays quiet on screen and says so to a screen reader.
                    <Cell className="cell-empty">
                      <span className="visually-hidden">{t('admin.common.none')}</span>
                    </Cell>
                  )}
                  <Cell label={t('admin.labs.colUpdated')} className="nowrap">
                    {fmt.relative(asUtc(lab.updated_at))}
                  </Cell>
                  <Cell className="cell-wide">
                    <div className="admin-actions">
                      <Link to={`/app/labs/${lab.id}`} className="btn btn-sm btn-ghost" title={t('admin.labs.openStudio')}>
                        <PencilRuler aria-hidden="true" />
                        <span className="visually-hidden">
                          {t('admin.labs.openStudio')}: {lab.title}
                        </span>
                      </Link>
                      {published ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={EyeOff}
                          onClick={() => {
                            setActionError(null)
                            setTarget(lab)
                          }}
                          aria-label={t('admin.labs.unpublishNamed', { title: lab.title })}
                        >
                          {t('admin.labs.unpublish')}
                        </Button>
                      ) : null}
                    </div>
                  </Cell>
                </tr>
              )
            })}
          </AdminTable>
          <Pagination page={page} pageSize={data?.page_size || PAGE_SIZE} total={total} onChange={(p) => setFilters({ page: String(p) })} />
        </>
      )}

      <ConfirmDialog
        open={Boolean(target)}
        onClose={() => (busy ? null : setTarget(null))}
        onConfirm={unpublish}
        loading={busy}
        tone="danger"
        title={t('admin.labs.confirmTitle', { title: target?.title || '' })}
        confirmLabel={t('admin.labs.unpublish')}
      >
        <div className="stack-sm admin-confirm">
          <p>{t('admin.labs.confirmBody', { code: target?.share_code || '' })}</p>
          <p className="small muted">{t('admin.labs.confirmAudit')}</p>
          {actionError ? (
            <Alert tone="danger" role="alert">
              {errorText(actionError)}
            </Alert>
          ) : null}
        </div>
      </ConfirmDialog>
    </div>
  )
}
