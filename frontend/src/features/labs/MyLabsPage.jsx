import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookOpen, Eye, GraduationCap, Library, School, SearchX } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { del, post } from '../../lib/api.js'
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorMessage,
  Segmented,
  SelectField,
  useErrorText,
  useToast,
} from '../../components/ui/index.js'
import Pagination from '../public/Pagination.jsx'
import SearchField from '../public/SearchField.jsx'
import { pageFrom, queryString, useDebouncedSearch, useDocumentTitle, useFetch, useUrlFilters } from '../public/hooks.js'
import { sharePath } from '../public/classCode.js'
import LabCard from './LabCard.jsx'
import LabCover from './LabCover.jsx'
import { SPACES } from './labOptions.js'
import './mylabs.css'

const PAGE_SIZE = 12
const DEFAULTS = { status: '', space: '', q: '', page: '1' }
const STATUSES = ['draft', 'published']

/** Three ways to start: a new lab in either space, or a class code. Links, not cards. */
function QuickStart() {
  const { t } = useT()
  const items = [
    { to: '/app/new?space=school2lab', icon: School, key: 'school' },
    { to: '/app/new?space=paper2explorer', icon: Library, key: 'paper' },
    { to: '/join', icon: GraduationCap, key: 'join' },
  ]
  return (
    <nav className="quick-start" aria-label={t('labs.my.quickStart')}>
      <ul className="list-reset quick-list">
        {items.map(({ to, icon: Icon, key }) => (
          <li key={key}>
            <Link to={to} className="quick-link">
              <span className="quick-title">
                <Icon aria-hidden="true" />
                {t(`labs.my.quick.${key}.title`)}
              </span>
              <span className="quick-desc">{t(`labs.my.quick.${key}.desc`)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** First run (no labs yet): clone a published sample lab, or read the guide. */
function FirstRun() {
  const { t } = useT()
  const navigate = useNavigate()
  const errorText = useErrorText()
  const { data, loading, error } = useFetch('/api/public/featured')
  const [cloning, setCloning] = useState(null)
  const [cloneError, setCloneError] = useState(null)
  const demos = Array.isArray(data) ? data.filter((lab) => lab?.share_code).slice(0, 4) : []

  const clone = async (lab) => {
    setCloning(lab.share_code)
    setCloneError(null)
    try {
      const copy = await post(`/api/share/${encodeURIComponent(lab.share_code)}/clone`)
      navigate(`/app/labs/${copy.id}`)
    } catch (err) {
      setCloneError(err)
      setCloning(null)
    }
  }

  return (
    <section className="card first-run" aria-labelledby="first-run-title">
      <div className="first-run-intro">
        <h2 id="first-run-title">{t('labs.firstRun.title')}</h2>
        <p>{t('labs.firstRun.body')}</p>
      </div>

      <h3 className="first-run-subtitle">{t('labs.firstRun.demosTitle')}</h3>
      {cloneError ? <ErrorMessage error={cloneError} title={t('labs.firstRun.cloneError')} /> : null}
      {loading ? (
        <div className="demo-list" role="status" aria-label={t('common.states.loading')}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="demo-row" aria-hidden="true">
              <div className="skeleton demo-cover" />
              <div className="demo-text">
                <div className="skeleton" style={{ blockSize: '1.1rem', inlineSize: '60%' }} />
                <div className="skeleton" style={{ blockSize: '0.9rem', inlineSize: '30%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : demos.length ? (
        <ul className="demo-list list-reset">
          {demos.map((lab) => (
            <li key={lab.id} className="demo-row">
              <div className="demo-cover">
                <LabCover lab={lab} compact />
              </div>
              <div className="demo-text">
                <p className="demo-title">{lab.title}</p>
                <p className="demo-meta">
                  <span>{t(`common.subjects.${lab.subject}`)}</span>
                  <span>{t(`common.grades.${lab.grade}`)}</span>
                </p>
              </div>
              <div className="demo-actions">
                <Link to={sharePath(lab.share_code)} className="btn btn-sm btn-ghost">
                  <Eye aria-hidden="true" />
                  {t('labs.firstRun.preview')}
                  <span className="visually-hidden">: {lab.title}</span>
                </Link>
                <Button
                  size="sm"
                  loading={cloning === lab.share_code}
                  disabled={Boolean(cloning) && cloning !== lab.share_code}
                  onClick={() => clone(lab)}
                >
                  {t('labs.firstRun.clone')}
                  <span className="visually-hidden">: {lab.title}</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{error ? errorText(error) : t('labs.firstRun.noDemos')}</p>
      )}
      <p className="first-run-guide">
        <BookOpen aria-hidden="true" />
        <span>
          {t('labs.firstRun.guideText')} <Link to="/guide">{t('labs.firstRun.guideLink')}</Link>
        </span>
      </p>
    </section>
  )
}

/** The table's head row; on phones each row becomes a block and this row is hidden. */
function LabTableHead() {
  const { t } = useT()
  return (
    <thead>
      <tr>
        <th scope="col">{t('labs.table.lab')}</th>
        <th scope="col">{t('labs.my.status')}</th>
        <th scope="col">{t('labs.table.subject')}</th>
        <th scope="col">{t('labs.table.content')}</th>
        <th scope="col">{t('labs.table.updated')}</th>
        <th scope="col">{t('labs.card.classCode')}</th>
        <th scope="col">
          <span className="visually-hidden">{t('labs.table.actions')}</span>
        </th>
      </tr>
    </thead>
  )
}

export default function MyLabsPage() {
  const { t, fmt } = useT()
  const { user, ai } = useAuth()
  const toast = useToast()
  const errorText = useErrorText()
  useDocumentTitle(t('labs.my.metaTitle'))
  const resultsRef = useRef(null)
  const [filters, setFilters, clearAll] = useUrlFilters(DEFAULTS)
  const status = STATUSES.includes(filters.status) ? filters.status : ''
  const space = SPACES.includes(filters.space) ? filters.space : ''
  const q = (filters.q || '').trim()
  const page = pageFrom(filters.page)
  const [search, setSearch] = useDebouncedSearch(q, (value) => setFilters({ q: value }))
  const hasFilters = Boolean(status || space || q)

  const path = `/api/labs${queryString({ status, space, q, page, page_size: PAGE_SIZE })}`
  const { data, error, loading, stale, initial, reload } = useFetch(path)
  const items = data?.items || []
  const total = data?.total || 0

  const [duplicating, setDuplicating] = useState(null)
  const [newId, setNewId] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const clearFilters = () => {
    setSearch('')
    clearAll()
  }
  const goToPage = (p) => {
    setFilters({ page: String(p) })
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    resultsRef.current?.focus({ preventScroll: true })
  }

  const duplicate = async (lab) => {
    setDuplicating(lab.id)
    try {
      const copy = await post(`/api/labs/${lab.id}/duplicate`)
      setNewId(copy.id)
      toast.success(t('labs.toast.duplicated', { title: copy.title }))
      if (page !== 1 || hasFilters) clearFilters()
      else reload()
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setDuplicating(null)
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await del(`/api/labs/${toDelete.id}`)
      toast.success(t('labs.toast.deleted', { title: toDelete.title }))
      setToDelete(null)
      if (items.length === 1 && page > 1) setFilters({ page: String(page - 1) })
      else reload()
    } catch (err) {
      setDeleteError(err)
    } finally {
      setDeleting(false)
    }
  }

  const role = user?.role && user.role !== 'admin' ? user.role : 'teacher'
  const firstRun = !initial && !error && total === 0 && !hasFilters

  return (
    <div className="container page my-labs">
      <header className="my-labs-header">
        <h1>{t('labs.my.greeting', { name: user?.name || '' })}</h1>
        <p>{t(`labs.my.subline.${role}`)}</p>
      </header>

      {ai && !ai.configured ? (
        <Alert tone="warning" className="my-labs-ai">
          {t('common.ai.notConfigured')} {t('labs.my.aiOffHint')}
        </Alert>
      ) : null}

      <QuickStart />

      {firstRun ? (
        <FirstRun />
      ) : (
        <section className="my-labs-list" aria-labelledby="my-labs-title" aria-busy={loading || undefined}>
          <div className="my-labs-list-head">
            <h2 id="my-labs-title">{t('labs.my.listTitle')}</h2>
            <p ref={resultsRef} tabIndex={-1} className="my-labs-count-text" aria-live="polite">
              {initial ? t('common.states.loading') : t('labs.my.count', { count: total, n: fmt.number(total, 0) })}
            </p>
          </div>
          <div className="my-labs-filters" role="group" aria-label={t('labs.my.filtersLabel')}>
            <div className="field">
              <span className="field-label">{t('labs.my.status')}</span>
              <Segmented
                label={t('labs.my.status')}
                value={status}
                onChange={(value) => setFilters({ status: value })}
                options={[
                  { value: '', label: t('labs.my.allStatuses') },
                  { value: 'draft', label: t('common.status.draft') },
                  { value: 'published', label: t('common.status.published') },
                ]}
              />
            </div>
            <SelectField
              label={t('gallery.filters.space')}
              value={space}
              onChange={(e) => setFilters({ space: e.target.value })}
              options={[
                { value: '', label: t('labs.my.allSpaces') },
                { value: 'school2lab', label: t('common.spaces.school2lab') },
                { value: 'paper2explorer', label: t('common.spaces.paper2explorer') },
              ]}
            />
            <SearchField label={t('labs.my.search')} value={search} onChange={setSearch} placeholder={t('labs.my.searchPlaceholder')} />
            {hasFilters ? (
              <Button variant="ghost" onClick={clearFilters} className="my-labs-clear">
                {t('common.actions.clearFilters')}
              </Button>
            ) : null}
          </div>

          {error ? (
            <ErrorMessage error={error} onRetry={reload} title={t('labs.my.loadError')} />
          ) : initial ? (
            <div className="table-wrap" role="status" aria-label={t('common.states.loading')}>
              <table className="table lab-table">
                <LabTableHead />
                <tbody aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <tr key={i} className="lab-row">
                      <td className="lab-cell-title">
                        <div className="skeleton" style={{ blockSize: '1.1rem', inlineSize: '70%' }} />
                        <div className="skeleton" style={{ blockSize: '0.85rem', inlineSize: '45%', marginBlockStart: 'var(--space-xs)' }} />
                      </td>
                      {[0, 1, 2, 3, 4, 5].map((j) => (
                        <td key={j} className="lab-cell-skeleton">
                          <div className="skeleton" style={{ blockSize: '0.9rem', inlineSize: '70%' }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : items.length ? (
            <>
              <div className={['table-wrap', stale && 'is-stale'].filter(Boolean).join(' ')}>
                <table className="table lab-table">
                  <caption className="visually-hidden">{t('labs.my.listTitle')}</caption>
                  <LabTableHead />
                  <tbody>
                    {items.map((lab) => (
                      <LabCard
                        key={lab.id}
                        lab={lab}
                        isNew={lab.id === newId}
                        duplicating={duplicating === lab.id}
                        onDuplicate={duplicate}
                        onDelete={(target) => {
                          setDeleteError(null)
                          setToDelete(target)
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pageSize={data?.page_size || PAGE_SIZE} total={total} onChange={goToPage} />
            </>
          ) : (
            <EmptyState
              icon={SearchX}
              title={t('labs.my.noResults')}
              action={<Button onClick={clearFilters}>{t('common.actions.clearFilters')}</Button>}
            >
              <p>{t('labs.my.noResultsBody')}</p>
            </EmptyState>
          )}
        </section>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => (deleting ? null : setToDelete(null))}
        onConfirm={confirmDelete}
        loading={deleting}
        tone="danger"
        title={t('labs.delete.title', { title: toDelete?.title || '' })}
        confirmLabel={t('labs.delete.confirm')}
      >
        <div className="stack-sm">
          <p style={{ margin: 0 }}>{t('labs.delete.body')}</p>
          <ul className="delete-list">
            <li>{t('labs.delete.items.content')}</li>
            <li>{t('labs.delete.items.sources', { count: toDelete?.source_count || 0 })}</li>
            <li>{t('labs.delete.items.results')}</li>
            {toDelete?.status === 'published' && toDelete?.share_code ? <li>{t('labs.delete.items.code', { code: toDelete.share_code })}</li> : null}
          </ul>
          <p style={{ margin: 0 }}>
            <strong>{t('labs.delete.irreversible')}</strong> {t('labs.delete.tip')}
          </p>
          {deleteError ? <ErrorMessage error={deleteError} /> : null}
        </div>
      </ConfirmDialog>
    </div>
  )
}
