import { useMemo, useRef, useState } from 'react'
import { CircleCheck, Images, RefreshCw, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { post } from '../../lib/api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { Alert, Button, ConfirmDialog, EmptyState, ErrorMessage, LinkButton, Segmented, Switch, TextArea, useToast } from '../../components/ui/index.js'
import { useLab } from '../lab/LabContext.jsx'
import { SourceThumb } from '../sources/SourceThumb.jsx'
import { pageImageUrl } from '../sources/sourceMeta.js'
import { blockIcon } from '../blocks/registry.js'
import { NextStepCard, StepHeader } from './authoring/StepHeader.jsx'
import { AiProgress } from './authoring/AiProgress.jsx'
import { useAiJob } from './authoring/aiJob.js'
import { allPages, defaultPages, formatPageRanges, parsePageRanges, togglePage } from './authoring/pageRanges.js'
import { analysisCounts, nameSourceRefs, normalizeResult } from './authoring/review.js'
import './authoring/authoring.css'

const MAX_SOURCES = 8 // AnalyzeIn.source_ids max_length
const MAX_THUMBS = 30
const MANY_PAGES = 30

function defaultEntry(source) {
  return { text: formatPageRanges(defaultPages(source.page_count)) }
}

function initialSelection(sources, analysis) {
  const ready = sources.filter((s) => s.status === 'ready')
  const previous = (analysis?.source_ids || []).filter((id) => ready.some((s) => s.id === id))
  const ids = previous.length ? previous : ready.map((s) => s.id)
  return new Set(ids.slice(0, MAX_SOURCES))
}

function PagePicker({ source, entry, onChange }) {
  const { t, fmt } = useT()
  const count = source.page_count || 0
  const parsed = parsePageRanges(entry.text, count || Infinity)
  const [thumbs, setThumbs] = useState(count > 0 && count <= 8)
  const errorText = parsed.error
    ? parsed.error.code === 'outOfRange'
      ? t('analyze.pages.errRange', { max: count })
      : parsed.error.code === 'tooMany'
        ? t('analyze.pages.errTooMany')
        : t('analyze.pages.errInvalid', { token: parsed.error.token })
    : null
  const selectedSet = new Set(parsed.pages)
  const inputId = `pages-${source.id}`
  return (
    <div className="au-pages">
      <div className="field">
        <label className="field-label" htmlFor={inputId}>
          {t('analyze.pages.label')}
        </label>
        <input
          id={inputId}
          className="input mono"
          value={entry.text}
          placeholder={t('analyze.pages.placeholder')}
          aria-invalid={errorText ? 'true' : undefined}
          aria-describedby={`${inputId}-hint`}
          onChange={(e) => onChange({ text: e.target.value })}
        />
        <span className="field-hint" id={`${inputId}-hint`}>
          {errorText ? (
            <span className="field-error">{errorText}</span>
          ) : (
            t('analyze.pages.hint', { selected: fmt.number(parsed.pages.length, 0), count: fmt.number(count, 0) })
          )}
        </span>
      </div>
      <div className="row" style={{ gap: '0.5rem' }}>
        <Button size="sm" onClick={() => onChange({ text: formatPageRanges(allPages(count)) })}>
          {t('analyze.pages.all')}
        </Button>
        <Button size="sm" variant="ghost" icon={Images} aria-expanded={thumbs} onClick={() => setThumbs((v) => !v)}>
          {thumbs ? t('analyze.pages.hideThumbs') : t('analyze.pages.showThumbs')}
        </Button>
      </div>
      {count > 20 && parsed.pages.length === Math.min(10, count) && entry.text === formatPageRanges(defaultPages(count)) ? (
        <p className="small au-warn" style={{ margin: 0 }}>
          <TriangleAlert size={16} aria-hidden="true" />
          {t('analyze.pages.longDoc', { count })}
        </p>
      ) : null}
      {parsed.pages.length > MANY_PAGES ? (
        <p className="small au-warn" style={{ margin: 0 }}>
          <TriangleAlert size={16} aria-hidden="true" />
          {t('analyze.pages.many', { count: parsed.pages.length })}
        </p>
      ) : null}
      {thumbs ? (
        <>
          <ul className="list-reset au-page-grid" aria-label={t('analyze.pages.thumbsLabel', { title: source.title })}>
            {allPages(Math.min(MAX_THUMBS, count)).map((n) => (
              <li key={n}>
                <button
                  type="button"
                  className="au-page-thumb"
                  aria-pressed={selectedSet.has(n)}
                  aria-label={t('analyze.pages.toggle', { n })}
                  onClick={() => onChange({ text: formatPageRanges(togglePage(parsed.pages, n)) })}
                >
                  <img src={pageImageUrl(source, n, 0.5)} alt="" loading="lazy" decoding="async" />
                  <span className="au-page-num">
                    {selectedSet.has(n) ? <CircleCheck aria-hidden="true" /> : null}
                    {n}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {count > MAX_THUMBS ? <p className="tiny muted" style={{ margin: 0 }}>{t('analyze.pages.thumbsLimit', { max: MAX_THUMBS })}</p> : null}
        </>
      ) : null}
    </div>
  )
}

function SourcePickRow({ source, checked, disabledReason, onToggle, entry, onPages }) {
  const { t, fmt } = useT()
  const id = `pick-${source.id}`
  const meta = [
    t(`common.sourceKinds.${source.kind}`),
    source.kind === 'pdf' && source.page_count ? t('sources.meta.pages', { count: source.page_count }) : null,
    source.kind === 'video' && source.duration_ms ? fmt.duration(source.duration_ms) : null,
    source.kind === 'data' && Array.isArray(source.data) ? t('sources.meta.values', { count: source.data.length }) : null,
  ]
    .filter(Boolean)
    .join(', ')
  return (
    <li className={['au-pick-row', checked ? 'is-checked' : '', disabledReason ? 'is-disabled' : ''].filter(Boolean).join(' ')}>
      <label className="au-pick-label" htmlFor={id}>
        <input id={id} type="checkbox" checked={checked} disabled={Boolean(disabledReason)} onChange={(e) => onToggle(e.target.checked)} />
        <span className="au-pick-thumb" aria-hidden="true">
          <SourceThumb source={source} />
        </span>
        <span className="au-pick-text">
          <span className="au-pick-title break">{source.title}</span>
          <span className="small muted">{meta}</span>
          {source.contains_people ? <span className="small au-pick-people">{t('analyze.form.hasStudents')}</span> : null}
          {disabledReason ? <span className="small au-pick-reason">{disabledReason}</span> : null}
        </span>
      </label>
      {checked && source.kind === 'pdf' ? <PagePicker source={source} entry={entry} onChange={onPages} /> : null}
    </li>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div className={['au-stat', tone ? `is-${tone}` : ''].filter(Boolean).join(' ')}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function AnalysisSummary({ lab, analysis, headingRef }) {
  const { t, fmt } = useT()
  const r = normalizeResult(analysis.result)
  const counts = analysisCounts(r)
  const titlesInOrder = (analysis.source_ids || []).map((id) => (lab.sources || []).find((s) => s.id === id)?.title || null)
  const usedTitles = titlesInOrder.filter(Boolean)
  const summary = r.summary.length > 420 ? `${r.summary.slice(0, 420).trim()}…` : r.summary
  return (
    <section className="card au-summary" aria-labelledby="au-summary-title">
      <div className="au-card-head">
        <div>
          <h3 id="au-summary-title" ref={headingRef} tabIndex={-1}>
            {t('analyze.summary.title')}
          </h3>
          <p>
            {analysis.created_at ? <time dateTime={analysis.created_at}>{fmt.dateTime(analysis.created_at)}</time> : null}
            {analysis.created_at ? ', ' : ''}
            {t('analyze.summary.metaModel', { model: analysis.model || t('analyze.summary.unknownModel'), mode: t(`analyze.modes.${analysis.mode || 'contributor'}`) })}
          </p>
          {usedTitles.length ? <p className="break">{t('analyze.summary.sources', { list: usedTitles.join(', ') })}</p> : null}
        </div>
      </div>
      {r.topic ? (
        <dl className="au-summary-topic">
          <dt>{t('analyze.summary.topic')}</dt>
          <dd>{r.topic}</dd>
        </dl>
      ) : null}
      {summary ? <p className="au-summary-text">{summary}</p> : null}
      <dl className="au-stats">
        <Stat label={t('analyze.summary.formulas')} value={fmt.number(counts.formulas, 0)} />
        <Stat label={t('analyze.summary.variables')} value={fmt.number(counts.variables, 0)} />
        <Stat label={t('analyze.summary.steps')} value={fmt.number(counts.steps, 0)} />
        <Stat label={t('analyze.summary.objects')} value={fmt.number(counts.objects, 0)} />
        <Stat label={t('analyze.summary.missing')} value={fmt.number(counts.missing, 0)} tone={counts.missing ? 'warn' : undefined} />
      </dl>
      {r.suggested_blocks.length ? (
        <div className="au-suggested">
          <p className="au-suggested-title">{t('analyze.summary.suggested')}</p>
          <div className="au-suggested-list">
            {r.suggested_blocks.map((s, i) => {
              const Icon = blockIcon(s.type)
              return (
                <span key={`${s.type}-${i}`} className={['badge', s.feasibility === 'needs_input' ? 'badge-warning' : 'badge-outline'].join(' ')} title={s.reason || ''}>
                  <Icon aria-hidden="true" />
                  {t(`blocks.types.${s.type}`)}
                  {s.feasibility !== 'ready' ? ` (${t(`build.generate.feasibility.${s.feasibility}`)})` : ''}
                </span>
              )
            })}
          </div>
        </div>
      ) : null}
      {r.warnings.length ? (
        <Alert tone="warning" title={t('analyze.summary.warnings')}>
          <ul className="au-plain-list">
            {r.warnings.map((w, i) => (
              <li key={i}>{nameSourceRefs(w, titlesInOrder)}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
      <p className="ai-note" style={{ margin: 0 }}>
        <Sparkles size={16} aria-hidden="true" />
        {t('analyze.summary.reviewNote')}
      </p>
      <div className="row">
        <LinkButton to={`/app/labs/${lab.id}/review`} variant="primary">
          {t('analyze.summary.toReview')}
        </LinkButton>
      </div>
    </section>
  )
}

/** Step 2: Muse reads the chosen sources and proposes topic, formulas, variables, steps… */
export default function AnalyzeStep() {
  const { t } = useT()
  const { ai } = useAuth()
  const toast = useToast()
  const { lab, flush, replaceLab, updateFields } = useLab()
  const sources = useMemo(() => lab.sources || [], [lab.sources])
  const analysis = lab.analysis || {}
  const hasResult = analysis.status === 'done' && Boolean(analysis.result)
  const [selected, setSelected] = useState(() => initialSelection(sources, analysis))
  const [pages, setPages] = useState({})
  const [focus, setFocus] = useState('')
  const [deep, setDeep] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [formError, setFormError] = useState(null)
  const summaryRef = useRef(null)

  const job = useAiJob(`analyze:${lab.id}`, (finished, { late }) => {
    if (finished.status === 'done') {
      // Adopt the analysed lab when the studio was remounted while the job ran (the run
      // function only updated the lab context that started it).
      const serverLab = finished.result?.lab
      if (serverLab && serverLab.id === lab.id && (serverLab.version || 0) > (lab.version || 0)) replaceLab(serverLab)
      toast.success(late ? t('analyze.doneLate') : t('analyze.done'))
      window.requestAnimationFrame(() => summaryRef.current?.focus())
    }
  })

  const byId = useMemo(() => Object.fromEntries(sources.map((s) => [s.id, s])), [sources])
  const entryFor = (source) => pages[source.id] || defaultEntry(source)
  const chosen = [...selected].filter((id) => byId[id]?.status === 'ready')
  const chosenSources = chosen.map((id) => byId[id])
  const withStudents = chosenSources.some((s) => s.contains_people)
  const forcesStandard = withStudents && lab.ai_mode === 'contributor'
  const configured = Boolean(ai?.configured)

  const reasonFor = (s) => {
    if (s.status === 'processing') return t('analyze.form.processing')
    if (s.status === 'failed') return t('analyze.form.failed')
    if (!selected.has(s.id) && selected.size >= MAX_SOURCES) return t('analyze.form.max', { max: MAX_SOURCES })
    return null
  }

  const validate = () => {
    if (!chosen.length) return { error: t('analyze.form.errNoSource') }
    const pagePayload = {}
    for (const s of chosenSources) {
      if (s.kind !== 'pdf') continue
      const parsed = parsePageRanges(entryFor(s).text, s.page_count || Infinity)
      if (parsed.error) return { error: t('analyze.form.errPages', { title: s.title }) }
      if (!parsed.pages.length) return { error: t('analyze.form.errNoPages', { title: s.title }) }
      if (!s.page_count || parsed.pages.length !== s.page_count) pagePayload[s.id] = parsed.pages
    }
    return { pagePayload }
  }

  const run = () => {
    const { error, pagePayload } = validate()
    if (error) {
      setFormError(error)
      return
    }
    setFormError(null)
    if (forcesStandard) updateFields({ ai_mode: 'standard' })
    const body = { source_ids: chosen }
    if (Object.keys(pagePayload).length) body.pages = pagePayload
    if (focus.trim()) body.focus = focus.trim().slice(0, 1500)
    if (deep && ai?.deep_enabled) body.deep = true
    job.start(async (signal) => {
      await flush()
      const res = await post(`/api/labs/${lab.id}/ai/analyze`, body, { signal })
      if (res?.lab) replaceLab(res.lab)
      return { lab: res?.lab || null }
    })
  }

  const onRunClick = () => {
    if (hasResult) setConfirmOpen(true)
    else run()
  }

  const stageMessages = [
    t('analyze.job.stage1'),
    t('analyze.job.stage2'),
    t('analyze.job.stage3'),
    t('analyze.job.stage4'),
    t('analyze.job.stage5'),
  ]

  return (
    <div className="container page au-page">
      <StepHeader step="analyze" title={t('analyze.step.title')} description={t('analyze.step.desc')} />

      {!configured ? (
        <Alert tone="warning" title={t('analyze.notConfiguredTitle')}>
          {t('common.ai.notConfigured')} {t('analyze.notConfiguredBody')}
        </Alert>
      ) : null}

      {job.running ? (
        <AiProgress
          title={t('analyze.job.title')}
          messages={stageMessages}
          startedAt={job.startedAt}
          note={deep ? t('analyze.job.noteDeep') : t('analyze.job.note')}
          onCancel={job.cancel}
        />
      ) : null}

      {!job.running && job.error ? <ErrorMessage error={job.error} title={t('analyze.failedTitle')} onRetry={run} /> : null}
      {!job.running && job.canceled ? (
        <Alert tone="info" title={t('analyze.canceledTitle')}>
          {t('analyze.canceledBody')}
        </Alert>
      ) : null}

      {!job.running && hasResult ? <AnalysisSummary lab={lab} analysis={analysis} headingRef={summaryRef} /> : null}

      {!job.running ? (
        sources.length ? (
          <section className="card stack au-analyze-form" aria-labelledby="au-run-title">
            <div className="au-card-head">
              <div>
                <h3 id="au-run-title">{hasResult ? t('analyze.form.rerunTitle') : t('analyze.form.title')}</h3>
                <p>{t('analyze.form.intro')}</p>
              </div>
            </div>

            <fieldset className="au-fieldset">
              <legend>{t('analyze.form.sourcesLegend', { count: chosen.length, max: MAX_SOURCES })}</legend>
              <ul className="list-reset au-pick-list">
                {sources.map((s) => (
                  <SourcePickRow
                    key={s.id}
                    source={s}
                    checked={selected.has(s.id) && s.status === 'ready'}
                    disabledReason={reasonFor(s)}
                    entry={entryFor(s)}
                    onPages={(next) => setPages((p) => ({ ...p, [s.id]: { ...entryFor(s), ...next } }))}
                    onToggle={(on) =>
                      setSelected((set) => {
                        const next = new Set(set)
                        if (on) next.add(s.id)
                        else next.delete(s.id)
                        return next
                      })
                    }
                  />
                ))}
              </ul>
            </fieldset>

            <TextArea
              label={t('analyze.form.focusLabel')}
              hint={t('analyze.form.focusHint')}
              placeholder={lab.space === 'paper2explorer' ? t('analyze.form.focusPlaceholderPaper') : t('analyze.form.focusPlaceholder')}
              rows={2}
              maxLength={1500}
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
            />

            {ai?.deep_enabled ? (
              <div className="au-deep">
                <Switch label={t('analyze.form.deep')} checked={deep} onChange={(e) => setDeep(e.target.checked)} />
                <p className="small muted" style={{ margin: 0 }}>
                  {t('analyze.form.deepHint')}
                </p>
              </div>
            ) : null}

            <section className="au-privacy" aria-labelledby="au-privacy-title">
              <h4 className="au-privacy-title" id="au-privacy-title">
                <ShieldCheck aria-hidden="true" />
                {t('analyze.privacy.title')}
              </h4>
              <Segmented
                label={t('studio.privacyMode')}
                value={lab.ai_mode}
                onChange={(v) => updateFields({ ai_mode: v })}
                options={[
                  { value: 'contributor', label: t('common.aiMode.contributor') },
                  { value: 'standard', label: t('common.aiMode.standard') },
                ]}
              />
              <p className="small" style={{ margin: 0 }}>
                {lab.ai_mode === 'standard' ? t('common.aiMode.standardHint') : t('common.aiMode.contributorHint')}
              </p>
              {withStudents ? (
                <Alert tone={forcesStandard ? 'warning' : 'info'}>{forcesStandard ? t('analyze.privacy.willSwitch') : t('analyze.privacy.studentsStandard')}</Alert>
              ) : null}
              {deep && ai?.deep_enabled ? <p className="small muted" style={{ margin: 0 }}>{t('analyze.privacy.deep')}</p> : null}
            </section>

            {formError ? (
              <Alert tone="danger" role="alert">
                {formError}
              </Alert>
            ) : null}

            <div className="au-run-row">
              <Button variant={hasResult ? undefined : 'primary'} size={hasResult ? undefined : 'lg'} icon={hasResult ? RefreshCw : Sparkles} disabled={!configured || !chosen.length} onClick={onRunClick}>
                {hasResult ? t('analyze.form.rerun') : t('analyze.form.run')}
              </Button>
              {!chosen.length ? <span className="small muted">{t('analyze.form.errNoSource')}</span> : null}
            </div>
          </section>
        ) : (
          <section className="card">
            <EmptyState icon={Sparkles} title={t('analyze.noSourcesTitle')} action={<LinkButton to={`/app/labs/${lab.id}/sources`} variant="primary">{t('analyze.noSourcesAction')}</LinkButton>}>
              <p>{t('analyze.noSources')}</p>
            </EmptyState>
          </section>
        )
      ) : null}

      {hasResult && !job.running ? <NextStepCard to={`/app/labs/${lab.id}/review`} step="review" description={t('analyze.next')} /> : null}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false)
          run()
        }}
        title={t('analyze.rerunConfirmTitle')}
        confirmLabel={t('analyze.form.rerun')}
      >
        <p style={{ marginTop: 0 }}>{t('analyze.rerunConfirmBody')}</p>
      </ConfirmDialog>
    </div>
  )
}
