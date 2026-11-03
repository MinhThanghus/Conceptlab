import { Info, RefreshCw } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { Alert, Button, ErrorMessage } from '../../components/ui/index.js'
import { ALL_SUBJECTS } from '../labs/labOptions.js'
import { useDocumentTitle, useFetch } from '../public/hooks.js'
import { AdminHeader, AdminNote, AdminTable, BarList, Cell, FeatureName, NoValue, useLatency } from './adminShared.jsx'
import { asUtc, prepTimeParts } from './adminUtils.js'

const ROLES = ['teacher', 'student', 'researcher', 'admin']
const STATUSES = ['draft', 'published', 'archived']
const SPACES = ['school2lab', 'paper2explorer']

function sum(obj = {}) {
  return Object.values(obj || {}).reduce((acc, n) => acc + (Number(n) || 0), 0)
}

const missing = (value) => value === null || value === undefined

/** A row of figures parted by hairlines: label, value in tabular numerals, an optional unit and note. */
function Figures({ count, children }) {
  return (
    <div className={`admin-figures admin-figures-${count}`}>
      <dl className="admin-figures-grid">{children}</dl>
    </div>
  )
}

function Figure({ label, value, unit, note }) {
  const { t } = useT()
  const empty = missing(value) || value === ''
  return (
    <div className="admin-figure">
      <dt>{label}</dt>
      <dd className={['admin-figure-value', empty && 'is-empty'].filter(Boolean).join(' ')}>
        {empty ? t('admin.common.noValue') : value}
        {!empty && unit ? <small>{unit}</small> : null}
      </dd>
      {note ? <dd className="admin-figure-note">{note}</dd> : null}
    </div>
  )
}

function UsageTable({ rows, nameKey, caption }) {
  const { t, fmt } = useT()
  const latency = useLatency()
  if (!rows?.length) return <p className="admin-bars-empty">{t('admin.dashboard.noAiCalls')}</p>
  const columns = [
    { key: 'name', label: nameKey === 'feature' ? t('admin.ai.feature') : t('admin.ai.model') },
    { key: 'calls', label: t('admin.ai.calls'), className: 'num' },
    { key: 'errors', label: t('admin.ai.errors'), className: 'num' },
    { key: 'latency', label: t('admin.ai.avgLatency'), className: 'num' },
    { key: 'in', label: t('admin.ai.tokensIn'), className: 'num' },
    { key: 'out', label: t('admin.ai.tokensOut'), className: 'num' },
  ]
  return (
    <AdminTable caption={caption} columns={columns} layout="pin" className="admin-usage">
      {rows.map((row) => {
        const name = row[nameKey]
        const errors = Number(row.errors) || 0
        const calls = Number(row.calls) || 0
        const tokensIn = row.input_tokens ?? row.tokens ?? null
        const tokensOut = row.output_tokens ?? null
        return (
          <tr key={name} role="row">
            <th scope="row" role="rowheader">
              {nameKey === 'feature' ? <FeatureName id={name} /> : <span className="cell-title mono">{name}</span>}
            </th>
            <Cell className="num">{fmt.number(calls, 0)}</Cell>
            <Cell className={['num', errors && 'has-errors'].filter(Boolean).join(' ')}>
              {fmt.number(errors, 0)}
              {errors && calls ? <span className="cell-sub">{fmt.percent(errors / calls, 0)}</span> : null}
            </Cell>
            <Cell className="num">{latency(row.avg_latency_ms)}</Cell>
            <Cell className="num">{missing(tokensIn) ? <NoValue>{t('admin.common.unknown')}</NoValue> : fmt.number(tokensIn, 0)}</Cell>
            <Cell className="num">{missing(tokensOut) ? <NoValue>{t('admin.common.unknown')}</NoValue> : fmt.number(tokensOut, 0)}</Cell>
          </tr>
        )
      })}
    </AdminTable>
  )
}

function prepTime(minutes, t, fmt) {
  const parts = prepTimeParts(minutes)
  if (!parts) return null
  const n = fmt.number(parts.value, parts.digits)
  if (parts.unit === 'minutes') return t('admin.dashboard.minutes', { n })
  if (parts.unit === 'hours') return t('admin.dashboard.hours', { n })
  return t('admin.dashboard.days', { n })
}

/** First load: the figures and the two distribution columns, in their final shape. */
function DashboardSkeleton() {
  const { t } = useT()
  return (
    <div className="admin-dash-skeleton" role="status" aria-label={t('common.a11y.loading')}>
      <div className="admin-figures admin-figures-6" aria-hidden="true">
        <div className="admin-figures-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="admin-figure">
              <span className="skeleton sk-label" />
              <span className="skeleton sk-value" />
              <span className="skeleton sk-note" />
            </div>
          ))}
        </div>
      </div>
      <div className="admin-section" aria-hidden="true">
        <div className="admin-dist">
          {[7, 5].map((bars, g) => (
            <div key={g} className="admin-dist-group">
              <span className="skeleton sk-head" />
              {Array.from({ length: bars }).map((_, i) => (
                <span key={i} className="skeleton sk-bar" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function AdminDashboardPage() {
  const { t, fmt } = useT()
  useDocumentTitle(t('admin.dashboard.metaTitle'))
  const { data: stats, error, loading, reload, initial } = useFetch('/api/admin/stats')

  const header = (
    <AdminHeader
      title={t('admin.dashboard.title')}
      lead={stats?.generated_at ? t('admin.dashboard.generatedAt', { when: fmt.dateTime(asUtc(stats.generated_at)) }) : t('admin.dashboard.lead')}
      actions={
        <Button size="sm" icon={RefreshCw} onClick={reload} loading={loading && !initial}>
          {t('admin.dashboard.refresh')}
        </Button>
      }
    />
  )

  if (initial && !error)
    return (
      <div className="admin-page">
        {header}
        <DashboardSkeleton />
      </div>
    )
  if (error && !stats)
    return (
      <div className="admin-page">
        {header}
        <ErrorMessage error={error} onRetry={reload} title={t('admin.dashboard.loadError')} />
      </div>
    )

  const users = stats.users_by_role || {}
  const labs = stats.labs_by_status || {}
  const notAvailable = t('admin.dashboard.notEnough')
  const subjectItems = ALL_SUBJECTS.map((s) => ({ key: s, label: t(`common.subjects.${s}`), value: Number(stats.labs_by_subject?.[s]) || 0 })).sort(
    (a, b) => b.value - a.value,
  )
  const pre = stats.quiz_pre_avg_pct
  const post = stats.quiz_post_avg_pct
  const feedbackCount = Number(stats.feedback_count) || 0

  return (
    <div className={['admin-page', loading && 'is-refreshing'].filter(Boolean).join(' ')} aria-busy={loading || undefined}>
      {header}
      {error ? <ErrorMessage error={error} onRetry={reload} /> : null}

      <section aria-labelledby="dash-overview">
        <h2 id="dash-overview" className="visually-hidden">
          {t('admin.dashboard.overview')}
        </h2>
        <Figures count={6}>
          <Figure
            label={t('admin.dashboard.users')}
            value={fmt.number(sum(users), 0)}
            note={ROLES.map((r) => t(`admin.roleShort.${r}`, { count: Number(users[r]) || 0, n: fmt.number(users[r] || 0, 0) })).join(', ')}
          />
          <Figure
            label={t('admin.dashboard.labs')}
            value={fmt.number(sum(labs), 0)}
            note={t('admin.dashboard.labsNote', { published: fmt.number(labs.published || 0, 0), draft: fmt.number(labs.draft || 0, 0) })}
          />
          <Figure
            label={t('admin.dashboard.aiCalls')}
            value={fmt.number(stats.ai_calls_total || 0, 0)}
            note={t('admin.dashboard.aiWeek', { n: fmt.number(stats.ai_calls_last_7d || 0, 0) })}
          />
          <Figure
            label={t('admin.dashboard.aiSuccess')}
            value={missing(stats.ai_success_rate) ? null : fmt.percent(stats.ai_success_rate, 1)}
            note={stats.ai_calls_total ? t('admin.dashboard.aiSuccessNote') : t('admin.dashboard.noAiCalls')}
          />
          <Figure
            label={t('admin.dashboard.feedback')}
            value={missing(stats.feedback_avg) ? null : fmt.number(stats.feedback_avg, 1)}
            unit={'/ 5'}
            note={t('admin.dashboard.feedbackCount', { count: feedbackCount, n: fmt.number(feedbackCount, 0) })}
          />
          <Figure label={t('admin.dashboard.storage')} value={fmt.bytes(stats.storage_bytes || 0)} note={t('admin.dashboard.storageNote')} />
        </Figures>
      </section>

      <section className="admin-section" aria-labelledby="dash-labs">
        <h2 id="dash-labs">{t('admin.dashboard.labsTitle')}</h2>
        <div className="admin-dist">
          <div className="admin-dist-group">
            <h3>{t('admin.dashboard.bySubject')}</h3>
            <BarList label={t('admin.dashboard.bySubject')} items={subjectItems} zeroText={(list) => t('admin.dashboard.noLabsIn', { list })} />
          </div>
          <div className="admin-dist-side">
            <div className="admin-dist-group">
              <h3>{t('admin.dashboard.byStatus')}</h3>
              <BarList label={t('admin.dashboard.byStatus')} items={STATUSES.map((s) => ({ key: s, label: t(`common.status.${s}`), value: Number(labs[s]) || 0 }))} />
            </div>
            <div className="admin-dist-group">
              <h3>{t('admin.dashboard.bySpace')}</h3>
              <BarList
                label={t('admin.dashboard.bySpace')}
                items={SPACES.map((s) => ({ key: s, label: t(`common.spaces.${s}`), value: Number(stats.labs_by_space?.[s]) || 0 }))}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="admin-section" aria-labelledby="dash-ai">
        <h2 id="dash-ai">{t('admin.dashboard.aiTitle')}</h2>
        <p className="admin-section-lead">{t('admin.dashboard.aiLead')}</p>
        <div className="admin-dist-group">
          <h3>{t('admin.dashboard.byModel')}</h3>
          <UsageTable rows={stats.ai_by_model} nameKey="model" caption={t('admin.dashboard.byModel')} />
        </div>
        <div className="admin-dist-group">
          <h3>{t('admin.dashboard.byFeature')}</h3>
          <UsageTable rows={stats.ai_by_feature} nameKey="feature" caption={t('admin.dashboard.byFeature')} />
        </div>
      </section>

      <section className="admin-section" aria-labelledby="dash-pilot">
        <h2 id="dash-pilot">{t('admin.dashboard.pilotTitle')}</h2>
        <Alert tone="neutral" title={t('admin.dashboard.pilotNoteTitle')}>
          {t('admin.dashboard.pilotNote')}
        </Alert>
        <Figures count={4}>
          <Figure
            label={t('admin.dashboard.reviewRatio')}
            value={missing(stats.review_confirmed_ratio) ? null : fmt.percent(stats.review_confirmed_ratio, 0)}
            note={missing(stats.review_confirmed_ratio) ? notAvailable : t('admin.dashboard.reviewRatioNote')}
          />
          <Figure
            label={t('admin.dashboard.prepTime')}
            value={prepTime(stats.avg_prep_minutes, t, fmt)}
            note={missing(stats.avg_prep_minutes) ? notAvailable : t('admin.dashboard.prepTimeNote')}
          />
          <Figure
            label={t('admin.dashboard.quizPre')}
            value={missing(pre) ? null : `${fmt.number(pre, 0)}%`}
            note={missing(pre) ? notAvailable : t('admin.dashboard.quizNote')}
          />
          <Figure
            label={t('admin.dashboard.quizPost')}
            value={missing(post) ? null : `${fmt.number(post, 0)}%`}
            note={missing(post) ? notAvailable : t('admin.dashboard.quizNote')}
          />
        </Figures>
        <AdminNote icon={Info}>{t('admin.dashboard.pilotCaveat')}</AdminNote>
      </section>
    </div>
  )
}
