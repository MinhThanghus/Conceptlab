import { useState } from 'react'
import { UserCheck, UserX, Users } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { patch } from '../../lib/api.js'
import { Alert, Badge, Button, ConfirmDialog, EmptyState, ErrorMessage, SelectField, useToast } from '../../components/ui/index.js'
import Pagination from '../public/Pagination.jsx'
import SearchField from '../public/SearchField.jsx'
import { pageFrom, queryString, useClampedPage, useDebouncedSearch, useDocumentTitle, useFetch, useUrlFilters } from '../public/hooks.js'
import { AdminHeader, AdminTable, Cell, TableSkeleton, useAdminErrorText } from './adminShared.jsx'
import { asUtc } from './adminUtils.js'

const PAGE_SIZE = 25
const ROLES = ['teacher', 'student', 'researcher', 'admin']
const DEFAULTS = { q: '', role: '', page: '1' }

/** Email with an optional line break after "@" so long addresses wrap at a natural point. */
function EmailText({ email }) {
  const text = String(email || '')
  const at = text.lastIndexOf('@')
  if (at < 1) return text
  return (
    <>
      {text.slice(0, at + 1)}
      <wbr />
      {text.slice(at + 1)}
    </>
  )
}

export default function AdminUsersPage() {
  const { t, fmt } = useT()
  const { user: me } = useAuth()
  const toast = useToast()
  const adminErrorText = useAdminErrorText()
  useDocumentTitle(t('admin.users.metaTitle'))
  const [filters, setFilters, clearAll] = useUrlFilters(DEFAULTS)
  const role = ROLES.includes(filters.role) ? filters.role : ''
  const q = (filters.q || '').trim()
  const page = pageFrom(filters.page)
  const [search, setSearch] = useDebouncedSearch(q, (value) => setFilters({ q: value }))
  const path = `/api/admin/users${queryString({ q, role, page, page_size: PAGE_SIZE })}`
  const { data, error, loading, stale, initial, reload, setData } = useFetch(path)
  const items = data?.items || []
  const total = data?.total || 0
  const totalText = fmt.number(total, 0)
  const hasFilters = Boolean(q || role)
  // An old "?page=N" past the end jumps to the last real page instead of a false empty state.
  const correcting = useClampedPage({ page, total, pageSize: data?.page_size || PAGE_SIZE, itemCount: items.length, loading, setFilters })

  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState('')
  const [pending, setPending] = useState(null) // { user, changes, kind }

  const apply = async (target, changes) => {
    setBusyId(target.id)
    setActionError('')
    try {
      const updated = await patch(`/api/admin/users/${target.id}`, changes)
      setData((current) => (current ? { ...current, items: current.items.map((u) => (u.id === updated.id ? updated : u)) } : current))
      toast.success(t('admin.users.updated', { name: updated.name }))
      setPending(null)
    } catch (err) {
      setActionError(adminErrorText(err))
      setPending(null)
    } finally {
      setBusyId(null)
    }
  }

  const requestRole = (target, nextRole) => {
    if (nextRole === target.role) return
    if (nextRole === 'admin' || target.role === 'admin') setPending({ user: target, changes: { role: nextRole }, kind: nextRole === 'admin' ? 'promote' : 'demote' })
    else apply(target, { role: nextRole })
  }
  const requestActive = (target, active) => {
    if (active) apply(target, { is_active: true })
    else setPending({ user: target, changes: { is_active: false }, kind: 'deactivate' })
  }

  const clearFilters = () => {
    setSearch('')
    clearAll()
  }

  const columns = [
    { key: 'user', label: t('admin.users.colUser') },
    { key: 'role', label: t('admin.users.colRole') },
    { key: 'status', label: t('admin.users.colStatus') },
    { key: 'labs', label: t('admin.users.colLabs'), className: 'num' },
    { key: 'dates', label: t('admin.users.colDates') },
    { key: 'actions', label: t('admin.users.colActions') },
  ]

  return (
    <div className="admin-page">
      <AdminHeader title={t('admin.users.title')} lead={t('admin.users.lead')} />
      <div className="admin-filters" role="group" aria-label={t('admin.common.filters')}>
        <SearchField label={t('admin.users.search')} value={search} onChange={setSearch} placeholder={t('admin.users.searchPlaceholder')} />
        <SelectField
          label={t('admin.users.role')}
          value={role}
          onChange={(e) => setFilters({ role: e.target.value })}
          options={[{ value: '', label: t('admin.users.allRoles') }, ...ROLES.map((r) => ({ value: r, label: t(`common.roles.${r}`) }))]}
        />
      </div>

      {actionError ? (
        <Alert
          tone="danger"
          role="alert"
          className="admin-action-alert"
          title={t('admin.users.actionFailed')}
          action={
            <Button size="sm" onClick={() => setActionError('')}>
              {t('common.actions.close')}
            </Button>
          }
        >
          {actionError}
        </Alert>
      ) : null}

      <div className="admin-count">
        {/* No count after a failed load: the total is unknown, never zero. */}
        <p aria-live="polite">{initial ? t('common.states.loading') : data ? t('admin.users.count', { count: total, n: totalText }) : null}</p>
        {hasFilters && items.length ? (
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            {t('common.actions.clearFilters')}
          </Button>
        ) : null}
      </div>

      {error ? (
        <ErrorMessage error={error} onRetry={reload} title={t('admin.common.loadError')} />
      ) : initial || correcting ? (
        <TableSkeleton rows={6} columns={6} />
      ) : !items.length ? (
        <EmptyState
          icon={Users}
          title={hasFilters ? t('admin.common.noResults') : t('admin.users.empty')}
          action={hasFilters ? <Button onClick={clearFilters}>{t('common.actions.clearFilters')}</Button> : null}
        >
          {hasFilters ? <p>{t('admin.common.noResultsBody')}</p> : null}
        </EmptyState>
      ) : (
        <>
          <AdminTable caption={t('admin.users.caption')} columns={columns} stale={stale} busy={loading}>
            {items.map((u) => {
              const self = u.id === me?.id
              const busy = busyId === u.id
              return (
                <tr key={u.id} role="row">
                  <th scope="row" role="rowheader">
                    <span className="cell-title">
                      {u.name}
                      {self ? <span className="self-tag">{t('admin.users.you')}</span> : null}
                    </span>
                    <span className="cell-sub">
                      <EmailText email={u.email} />
                    </span>
                    {u.school ? <span className="cell-sub">{u.school}</span> : null}
                  </th>
                  <Cell label={t('admin.users.colRole')} className="cell-wide">
                    <label className="visually-hidden" htmlFor={`role-${u.id}`}>
                      {t('admin.users.roleFor', { name: u.name })}
                    </label>
                    <select
                      id={`role-${u.id}`}
                      className="select"
                      value={u.role}
                      disabled={self || busy}
                      title={self ? t('admin.users.selfHint') : undefined}
                      onChange={(e) => requestRole(u, e.target.value)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`common.roles.${r}`)}
                        </option>
                      ))}
                    </select>
                  </Cell>
                  <Cell label={t('admin.users.colStatus')}>
                    {u.is_active ? (
                      <span className="state-quiet">{t('admin.users.active')}</span>
                    ) : (
                      <Badge tone="danger" icon={UserX}>
                        {t('admin.users.inactive')}
                      </Badge>
                    )}
                  </Cell>
                  <Cell label={t('admin.users.colLabs')} className="num">
                    {fmt.number(u.lab_count || 0, 0)}
                  </Cell>
                  <Cell label={t('admin.users.colDates')} className="cell-wide">
                    <span className="cell-line nowrap">{fmt.date(asUtc(u.created_at))}</span>
                    <span className="cell-sub">{u.last_login_at ? t('admin.users.lastSignIn', { when: fmt.relative(asUtc(u.last_login_at)) }) : t('admin.users.never')}</span>
                  </Cell>
                  <Cell className="cell-wide">
                    {self ? (
                      <span className="small muted">{t('admin.users.selfHint')}</span>
                    ) : u.is_active ? (
                      <Button size="sm" variant="ghost" icon={UserX} loading={busy} onClick={() => requestActive(u, false)} aria-label={t('admin.users.deactivateNamed', { name: u.name })}>
                        {t('admin.users.deactivate')}
                      </Button>
                    ) : (
                      <Button size="sm" icon={UserCheck} loading={busy} onClick={() => requestActive(u, true)} aria-label={t('admin.users.activateNamed', { name: u.name })}>
                        {t('admin.users.activate')}
                      </Button>
                    )}
                  </Cell>
                </tr>
              )
            })}
          </AdminTable>
          <Pagination page={page} pageSize={data?.page_size || PAGE_SIZE} total={total} onChange={(p) => setFilters({ page: String(p) })} />
        </>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        onClose={() => (busyId ? null : setPending(null))}
        onConfirm={() => pending && apply(pending.user, pending.changes)}
        loading={Boolean(busyId)}
        tone={pending?.kind === 'promote' ? 'primary' : 'danger'}
        title={pending ? t(`admin.users.confirm.${pending.kind}.title`, { name: pending.user.name }) : ''}
        confirmLabel={pending ? t(`admin.users.confirm.${pending.kind}.action`) : undefined}
      >
        {pending ? (
          <div className="stack-sm admin-confirm">
            <p>{t(`admin.users.confirm.${pending.kind}.body`, { name: pending.user.name, email: pending.user.email })}</p>
            <p className="small muted">{t('admin.users.audited')}</p>
          </div>
        ) : null}
      </ConfirmDialog>
    </div>
  )
}
