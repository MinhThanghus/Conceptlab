import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n/index.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { Button, ErrorMessage, LinkButton, Segmented, SelectField } from '../../components/ui/index.js'
import { ALL_SUBJECTS, SPACES, gradesFor, subjectIcon } from '../labs/labOptions.js'
import Pagination from './Pagination.jsx'
import PublicLabCard, { LabCardSkeleton } from './PublicLabCard.jsx'
import SearchField from './SearchField.jsx'
import { pageFrom, queryString, useClampedPage, useDebouncedSearch, useDocumentTitle, useFetch, useUrlFilters } from './hooks.js'
import './banner.css'
import './gallery.css'

// Fetch enough lessons to organize a useful page by subject, while retaining server pagination.
const PAGE_SIZE = 60
const DEFAULTS = { space: '', subject: '', grade: '', q: '', page: '1' }

export default function GalleryPage() {
  const { t, fmt, lang } = useT()
  const { user } = useAuth()
  useDocumentTitle(t('gallery.meta.title'))
  const resultsRef = useRef(null)
  const [filters, setFilters, clearAll] = useUrlFilters(DEFAULTS)

  const space = SPACES.includes(filters.space) ? filters.space : ''
  // Existing public lessons can use any subject in either space.
  const subjects = ALL_SUBJECTS
  const grades = gradesFor(space)
  const subject = subjects.includes(filters.subject) ? filters.subject : ''
  const grade = grades.includes(filters.grade) ? filters.grade : ''
  const q = (filters.q || '').trim()
  const page = pageFrom(filters.page)
  const [search, setSearch] = useDebouncedSearch(q, (value) => setFilters({ q: value }))

  const path = `/api/public/labs${queryString({ space, subject, grade, q, page, page_size: PAGE_SIZE, lang })}`
  const { data, error, loading, stale, initial, reload } = useFetch(path, { scope: lang })
  const items = data?.items || []
  const total = data?.total || 0
  const hasFilters = Boolean(space || subject || grade || q)
  const pageSize = data?.page_size || PAGE_SIZE
  // "?page=9" from an old link while the gallery has one page: go to the last real page.
  const correcting = useClampedPage({ page, total, pageSize, itemCount: items.length, loading, setFilters })
  const createHref = user ? '/app/new' : '/register?next=%2Fapp%2Fnew'

  const changeSpace = (value) => {
    const nextGrades = gradesFor(value)
    setFilters({
      space: value,
      subject,
      grade: nextGrades.includes(grade) ? grade : '',
    })
  }
  const clearFilters = () => {
    setSearch('')
    clearAll()
  }
  const goToPage = (p) => {
    setFilters({ page: String(p) })
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    resultsRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
    resultsRef.current?.focus({ preventScroll: true })
  }
  // A failed load names itself in the heading (never "0 labs" above an error); the alert below says what to do.
  const resultsText = error
    ? t('gallery.loadError')
    : initial
      ? t('common.states.loading')
      : t('gallery.results', { count: total, n: fmt.number(total, 0) })
  const showList = !error && !initial && !correcting && items.length > 0
  const groupedItems = subjects
    .map((key) => ({ key, items: items.filter((lab) => (subjects.includes(lab.subject) ? lab.subject : 'other') === key) }))
    .filter((group) => group.items.length)

  return (
    <div className="gallery">
      <header className="pb-banner gl-banner">
        <div className="pb-sheet" aria-hidden="true">
          <i />
        </div>
        <div className="container gl-banner-inner">
          <div className="gl-head">
            <h1>{t('gallery.title')}</h1>
            <p className="pb-lead">{t('gallery.lead')}</p>
          </div>
          <LinkButton to={createHref} className="gl-create">
            {t('gallery.createOwn')}
          </LinkButton>

          <section className="gl-filters" aria-label={t('gallery.filters.label')}>
            <SearchField
              className="gl-search"
              label={t('gallery.filters.search')}
              value={search}
              onChange={setSearch}
              placeholder={t('gallery.filters.searchPlaceholder')}
            />
            <details className="gl-advanced">
              <summary>{t('gallery.filters.more')}{space || grade ? ` · ${t('gallery.filters.active')}` : ''}</summary>
              <div className="gl-advanced-fields">
              <div className="field gl-space">
              <span className="field-label" id="gallery-space-label">
                {t('gallery.filters.space')}
              </span>
              <Segmented
                label={t('gallery.filters.space')}
                value={space}
                onChange={changeSpace}
                options={[
                  { value: '', label: t('gallery.filters.allSpaces') },
                  { value: 'school2lab', label: t('common.spaces.school2lab') },
                  { value: 'paper2explorer', label: t('common.spaces.paper2explorer') },
                ]}
              />
            </div>
            <SelectField
              className="gl-select"
              label={t('gallery.filters.grade')}
              value={grade}
              onChange={(e) => setFilters({ grade: e.target.value })}
              options={[{ value: '', label: t('gallery.filters.allGrades') }, ...grades.map((g) => ({ value: g, label: t(`common.grades.${g}`) }))]}
            />
              </div>
            </details>
          </section>
        </div>
      </header>

      <section className="container gl-results" aria-labelledby="gallery-results-title" aria-busy={loading || undefined}>
        <nav className="gl-subjects" aria-label={t('gallery.filters.subject')}>
          <p className="gl-subjects-label">{t('gallery.browseBySubject')}</p>
          <div className="gl-subject-list">
            <button type="button" className={!subject ? 'is-selected' : ''} aria-pressed={!subject} onClick={() => setFilters({ subject: '' })}>
              {t('gallery.filters.allSubjects')}
            </button>
            {subjects.map((s) => {
              const Icon = subjectIcon(s)
              return <button type="button" key={s} className={subject === s ? 'is-selected' : ''} aria-pressed={subject === s} onClick={() => setFilters({ subject: s })}>
                <Icon aria-hidden="true" size={16} /> {t(`common.subjects.${s}`)}
              </button>
            })}
          </div>
        </nav>
        <div className="gl-results-head">
          <h2 id="gallery-results-title" ref={resultsRef} tabIndex={-1} className="gl-count">
            {resultsText}
          </h2>
          {/* Filters update the list without a page load: tell screen-reader users how many Labs match. */}
          <p className="visually-hidden" role="status">
            {loading || correcting ? '' : resultsText}
          </p>
          {hasFilters && showList ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              {t('common.actions.clearFilters')}
            </Button>
          ) : null}
        </div>

        {error ? (
          <ErrorMessage error={error} onRetry={reload} />
        ) : initial || correcting ? (
          <div className="gl-grid" role="status" aria-label={t('common.states.loading')}>
            {Array.from({ length: 6 }).map((_, i) => (
              <LabCardSkeleton key={i} />
            ))}
          </div>
        ) : items.length ? (
          <>
            <div className={['gl-groups', stale && 'is-stale'].filter(Boolean).join(' ')}>
              {groupedItems.map((group, groupIndex) => {
                const Icon = subjectIcon(group.key)
                return <section className="gl-group" key={group.key} aria-labelledby={`gl-group-${group.key}`}>
                  <div className="gl-group-head"><Icon aria-hidden="true" size={20} /><h3 id={`gl-group-${group.key}`}>{t(`common.subjects.${group.key}`)}</h3></div>
                  <ul className="gl-grid list-reset">
                    {group.items.map((lab, index) => (
                      <li key={lab.id}><PublicLabCard lab={lab} headingLevel={4} eager={groupIndex === 0 && index < 3} /></li>
                    ))}
                  </ul>
                </section>
              })}
            </div>
            <Pagination page={page} pageSize={pageSize} total={total} onChange={goToPage} />
          </>
        ) : hasFilters ? (
          <div className="gl-empty">
            <h3 className="gl-empty-title">{t('gallery.noResults.title')}</h3>
            <p>{t('gallery.noResults.body')}</p>
            <Button variant="primary" onClick={clearFilters}>
              {t('common.actions.clearFilters')}
            </Button>
          </div>
        ) : (
          <div className="gl-empty">
            <h3 className="gl-empty-title">{t('gallery.empty.title')}</h3>
            <p>{t('gallery.empty.body')}</p>
            <div className="gl-empty-actions">
              <LinkButton to={createHref} variant="primary">
                {t('gallery.empty.create')}
              </LinkButton>
              <Link to="/join" className="gl-empty-link">
                {t('gallery.empty.join')}
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
