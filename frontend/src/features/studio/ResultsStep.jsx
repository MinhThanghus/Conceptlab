import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, RefreshCw, Share2, ShieldCheck, Star, TriangleAlert, Users } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { get } from '../../lib/api.js'
import { Alert, Button, EmptyState, ErrorMessage, LoadingBlock, RichText, useToast } from '../../components/ui/index.js'
import { useLab } from '../lab/LabContext.jsx'
import { phaseComparison, questionRate, ratingShares } from '../explorer/resultsUtils.js'
import { copyText, shareUrlFor } from '../explorer/explorerUtils.js'
import { phaseLink } from './authoring/phaseLinks.js'
import { StepHeader } from './authoring/StepHeader.jsx'
import './authoring/authoring.css'

const PHASES = ['practice', 'pre', 'post']
const LOW_RATE = 0.5

/** One figure of the results row: its label, the number, a short note (no icon). */
function StatTile({ label, value, note }) {
  const { t } = useT()
  const empty = value === null || value === undefined
  return (
    <div className="stat">
      <dt className="stat-label">{label}</dt>
      <dd className={['stat-value', empty && 'st-stat-empty'].filter(Boolean).join(' ')}>{empty ? t('results.noValue') : value}</dd>
      {note ? <dd className="stat-note">{note}</dd> : null}
    </div>
  )
}

/** Horizontal bar on a 0..1 scale; its value is always printed beside it (never colour only). */
function Bar({ value, tone = 'primary', label }) {
  const pct = Math.round(Math.max(0, Math.min(1, value || 0)) * 100)
  return (
    <span className={`st-bar st-bar-${tone}`} title={label}>
      <span className="st-bar-fill" style={{ inlineSize: `${pct}%` }} />
    </span>
  )
}

/**
 * The quiz records an attempt as "pre" or "post" when the learner opened the class link with
 * `?phase=pre|post`; this card hands the teacher those two links (spec §17 pilot: trước/sau).
 */
function PhaseLinks({ code }) {
  const { t } = useT()
  const toast = useToast()
  const base = shareUrlFor(code)
  if (!base) return null
  const copy = async (url) => {
    if (await copyText(url)) toast.success(t('results.phaseLinks.copied'))
    else toast.error(t('results.phaseLinks.copyFailed'))
  }
  return (
    <div className="au-phase-links stack-sm">
      <p className="small" style={{ margin: 0 }}>
        <strong>{t('results.phaseLinks.title')}</strong> {t('results.phaseLinks.lead')}
      </p>
      {['pre', 'post'].map((phase) => {
        const url = phaseLink(base, phase)
        const id = `res-phase-link-${phase}`
        return (
          <div key={phase} className="au-phase-link">
            <label htmlFor={id} className="small au-phase-label">
              {t(`results.phases.${phase}`)}
            </label>
            <input id={id} className="input input-sm mono" readOnly value={url} onFocus={(e) => e.target.select()} />
            <Button size="sm" icon={Copy} onClick={() => copy(url)}>
              {t('results.phaseLinks.copy')}
              <span className="visually-hidden"> {t(`results.phases.${phase}`)}</span>
            </Button>
          </div>
        )
      })}
      <p className="tiny muted" style={{ margin: 0 }}>
        {t('results.phaseLinks.note')}
      </p>
    </div>
  )
}

/**
 * Studio step "Kết quả lớp" (spec §17 pilot impact): anonymous aggregates only (attempts,
 * practice, before and after averages, per-question correct rates, feedback and the
 * questions learners asked the AI tutor). Students are never ranked or identified.
 */
export default function ResultsStep() {
  const { t, fmt } = useT()
  const { lab } = useLab()
  const [state, setState] = useState({ status: 'loading', data: null, error: null, at: null })

  const load = useCallback(
    (signal) => {
      setState((s) => ({ ...s, status: s.data ? 'refreshing' : 'loading', error: null }))
      get(`/api/labs/${lab.id}/results`, { signal })
        .then((data) => setState({ status: 'ready', data, error: null, at: new Date().toISOString() }))
        .catch((error) => {
          if (error?.name === 'AbortError') return
          setState((s) => ({ ...s, status: 'error', error }))
        })
    },
    [lab.id],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const data = state.data
  const blocksById = useMemo(() => Object.fromEntries((lab.spec?.blocks || []).map((b) => [b.id, b])), [lab.spec])
  const published = lab.status === 'published'
  const pct = (value) => (value === null || value === undefined || !Number.isFinite(Number(value)) ? null : fmt.percent(Number(value) / 100, 0))
  const phase = (key) => data?.by_phase?.[key] || { count: 0, avg_pct: null }
  const hasData = Boolean(data && (data.attempts_total || data.feedback_count || data.tutor_questions))

  const header = (
    <StepHeader
      step="results"
      title={t('results.title')}
      description={t('results.lead')}
      actions={
        <>
          {state.at ? <span className="st-results-meta">{t('results.updatedAt', { time: fmt.relative(state.at) })}</span> : null}
          <Button size="sm" icon={RefreshCw} onClick={() => load()} loading={state.status === 'refreshing' || state.status === 'loading'}>
            {t('results.refresh')}
          </Button>
        </>
      }
    />
  )

  const privacy = (
    <Alert tone="info" title={t('results.neverRankedTitle')}>
      {t('results.neverRanked')}
    </Alert>
  )

  if (state.status === 'loading' && !data) {
    return (
      <div className="container page au-page st-res-page">
        {header}
        <div className="stack">
          <div className="stat-grid st-res-stats">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="stat">
                <LoadingBlock lines={2} />
              </div>
            ))}
          </div>
          <LoadingBlock lines={4} height="10rem" />
        </div>
      </div>
    )
  }

  if (state.status === 'error' && !data) {
    return (
      <div className="container page au-page st-res-page">
        {header}
        <ErrorMessage error={state.error} title={t('results.error')} onRetry={() => load()} />
      </div>
    )
  }

  if (!hasData) {
    return (
      <div className="container page au-page st-res-page">
        {header}
        {privacy}
        <div className="card">
          {published ? (
            <EmptyState
              icon={Users}
              title={t('results.emptyTitle')}
              action={
                <Link className="btn btn-primary" to={`/app/labs/${lab.id}/publish`}>
                  <Share2 aria-hidden="true" />
                  {t('results.showCode')}
                </Link>
              }
            >
              <p>{t('results.emptyBody', { code: lab.share_code || '' })}</p>
              {lab.share_code ? <PhaseLinks code={lab.share_code} /> : null}
            </EmptyState>
          ) : (
            <EmptyState
              icon={Share2}
              title={t('results.notPublishedTitle')}
              action={
                <Link className="btn btn-primary" to={`/app/labs/${lab.id}/publish`}>
                  <Share2 aria-hidden="true" />
                  {t('results.goPublish')}
                </Link>
              }
            >
              <p>{t('results.notPublishedBody')}</p>
            </EmptyState>
          )}
        </div>
      </div>
    )
  }

  const comparison = phaseComparison(data.by_phase)
  const questions = data.questions || []
  const shares = ratingShares(data.feedback_distribution)

  return (
    <div className={['container page au-page st-res-page', state.status === 'refreshing' && 'is-refreshing'].filter(Boolean).join(' ')} aria-busy={state.status === 'refreshing' || undefined}>
      {header}
      {privacy}
      {state.status === 'error' ? <ErrorMessage error={state.error} onRetry={() => load()} /> : null}
      {!published ? <Alert tone="warning">{t('results.notPublishedNow')}</Alert> : null}

      <section aria-labelledby="res-overview" className="stack">
        <h3 id="res-overview" className="visually-hidden">
          {t('results.overview')}
        </h3>
        <dl className="stat-grid st-res-stats">
          <StatTile label={t('results.stats.attempts')} value={fmt.number(data.attempts_total || 0, 0)} note={t('results.stats.attemptsNote')} />
          {PHASES.map((key) => {
            const p = phase(key)
            return (
              <StatTile
                key={key}
                label={t(`results.phases.${key}`)}
                value={p.count ? pct(p.avg_pct) : null}
                note={p.count ? t('results.stats.phaseNote', { count: p.count }) : t('results.stats.noAttempts')}
              />
            )
          })}
          <StatTile
            label={t('results.stats.feedback')}
            value={data.feedback_count ? t('results.feedback.outOf', { value: fmt.number(data.feedback_avg, 1) }) : null}
            note={t('results.feedback.count', { count: data.feedback_count || 0 })}
          />
          <StatTile label={t('results.stats.tutor')} value={fmt.number(data.tutor_questions || 0, 0)} note={t('results.stats.tutorNote')} />
        </dl>
      </section>

      <section className="card stack" aria-labelledby="res-compare-title">
        <h3 id="res-compare-title">{t('results.compare.title')}</h3>
        {comparison ? (
          <>
            <div className="st-compare" role="group" aria-label={t('results.compare.title')}>
              {[
                { key: 'pre', value: comparison.pre, count: comparison.preCount, tone: 'pre' },
                { key: 'post', value: comparison.post, count: comparison.postCount, tone: 'post' },
              ].map(({ key, value, count, tone }) => (
                <div key={key} className="st-compare-row">
                  <span className="st-compare-label">
                    {t(`results.phases.${key}`)}
                    <span className="small muted">{t('results.stats.phaseNote', { count })}</span>
                  </span>
                  <Bar value={value / 100} tone={tone} label={`${t(`results.phases.${key}`)}: ${pct(value)}`} />
                  <span className="st-compare-value">{pct(value)}</span>
                </div>
              ))}
              <div className="st-axis" aria-hidden="true">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>
            <p className="st-diff">
              {t('results.compare.diff', { value: `${comparison.diff > 0 ? '+' : comparison.diff < 0 ? '−' : '±'}${fmt.number(Math.abs(comparison.diff), 1)}` })}
            </p>
          </>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            {t('results.compare.needBoth')}
          </p>
        )}
        {published && lab.share_code ? <PhaseLinks code={lab.share_code} /> : null}
        <Alert tone="warning" title={t('results.compare.noteTitle')}>
          {t('results.compare.note')}
        </Alert>
      </section>

      <section className="card stack" aria-labelledby="res-questions-title">
        <div className="stack-sm">
          <h3 id="res-questions-title">{t('results.questions.title')}</h3>
          <p className="small muted" style={{ margin: 0 }}>
            {t('results.questions.lead')}
          </p>
        </div>
        {questions.length ? (
          <div className="table-wrap">
            <table className="table st-res-table">
              <caption className="visually-hidden">{t('results.questions.title')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('results.questions.question')}</th>
                  <th scope="col" className="num">
                    {t('results.questions.attempts')}
                  </th>
                  <th scope="col" className="num">
                    {t('results.questions.correct')}
                  </th>
                  <th scope="col">{t('results.questions.rate')}</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => {
                  const rate = questionRate(q)
                  const block = blocksById[q.block_id]
                  const low = rate !== null && q.attempts >= 3 && rate < LOW_RATE
                  return (
                    <tr key={`${q.block_id}-${q.question_id}`}>
                      <td>
                        {q.prompt ? <RichText text={q.prompt} className="st-q-prompt" /> : <span className="st-q-prompt">{q.question_id}</span>}
                        {block ? <span className="st-q-block">{block.title || t(`blocks.types.${block.type}`)}</span> : null}
                      </td>
                      <td className="num" data-label={t('results.questions.attempts')}>
                        {fmt.number(q.attempts || 0, 0)}
                      </td>
                      <td className="num" data-label={t('results.questions.correct')}>
                        {fmt.number(q.correct || 0, 0)}
                      </td>
                      <td data-label={t('results.questions.rate')}>
                        {rate === null ? (
                          <span className="muted">{t('results.questions.noRate')}</span>
                        ) : (
                          <div className="st-rate">
                            <Bar value={rate} label={t('results.questions.rateLabel', { value: fmt.percent(rate, 0) })} />
                            <span className="st-rate-value">{fmt.percent(rate, 0)}</span>
                            {low ? (
                              <span className="badge badge-warning">
                                <TriangleAlert aria-hidden="true" />
                                {t('results.questions.low')}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            {t('results.questions.empty')}
          </p>
        )}
      </section>

      <div className="grid-2">
        <section className="card stack" aria-labelledby="res-feedback-title">
          <h3 id="res-feedback-title">{t('results.feedback.title')}</h3>
          {data.feedback_count ? (
            <>
              <div className="st-rating">
                <span className="st-rating-value">{fmt.number(data.feedback_avg, 1)}</span>
                <span className="st-rating-meta">
                  <span className="st-stars" aria-hidden="true">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} size={18} className={n <= Math.round(data.feedback_avg || 0) ? 'on' : undefined} />
                    ))}
                  </span>
                  <span className="small muted">{t('results.feedback.averageOf', { count: data.feedback_count })}</span>
                </span>
              </div>
              <div className="stack-sm">
                <p className="small muted" style={{ margin: 0 }}>
                  {t('results.feedback.distribution')}
                </p>
                {shares.map(({ n, count, share }) => {
                  return (
                    <div key={n} className="st-dist-row">
                      <span className="st-dist-label">{t('results.feedback.stars', { n })}</span>
                      <Bar value={share} label={`${t('results.feedback.stars', { n })}: ${count}`} />
                      <span className="st-dist-value">
                        {fmt.number(count, 0)}
                        <span className="muted"> ({fmt.percent(share, 0)})</span>
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="stack-sm">
                <p className="small muted" style={{ margin: 0 }}>
                  {t('results.feedback.recent')}
                </p>
                {(data.recent_feedback || []).filter((f) => f.comment).length ? (
                  <ul className="list-reset st-comments">
                    {(data.recent_feedback || [])
                      .filter((f) => f.comment)
                      .map((f) => (
                        <li key={f.id}>
                          <span className="st-comment-meta">
                            <span className="badge badge-outline">
                              <Star aria-hidden="true" />
                              {f.rating}
                            </span>
                            <span className="small muted">{fmt.relative(f.created_at)}</span>
                          </span>
                          <p>{f.comment}</p>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="small muted" style={{ margin: 0 }}>
                    {t('results.feedback.noComments')}
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              {t('results.feedback.empty')}
            </p>
          )}
        </section>

        <section className="card stack" aria-labelledby="res-tutor-title">
          <h3 id="res-tutor-title">{t('results.tutor.title')}</h3>
          <p className="small muted" style={{ margin: 0 }}>
            {t('results.tutor.lead')}
          </p>
          {!lab.allow_tutor ? <Alert tone="info">{t('results.tutor.disabled')}</Alert> : null}
          <p className="st-tutor-count">{t('results.tutor.count', { count: data.tutor_questions || 0 })}</p>
          {(data.recent_tutor_questions || []).length ? (
            <ul className="list-reset st-questions">
              {data.recent_tutor_questions.map((question, i) => (
                <li key={i}>“{question}”</li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              {t('results.tutor.empty')}
            </p>
          )}
          <p className="st-note-line">
            <ShieldCheck size={14} aria-hidden="true" /> {t('results.tutor.anonymous')}
          </p>
        </section>
      </div>
    </div>
  )
}
