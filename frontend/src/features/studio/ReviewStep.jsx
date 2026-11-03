import { useCallback, useMemo, useRef, useState } from 'react'
import { CheckCheck, CircleCheck, Info, Sparkles } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { Alert, Button, ConfirmDialog, EmptyState, LinkButton, ProvenanceBadge, useToast } from '../../components/ui/index.js'
import { useLab } from '../lab/LabContext.jsx'
import { PROVENANCES } from '../lab/specUtils.js'
import { SamSelectorDialog } from '../sam/SamSelector.jsx'
import { NextStepCard, StepHeader } from './authoring/StepHeader.jsx'
import { upsertById, useLabSync } from './authoring/useLabSync.js'
import { confirmAll, knownSymbols, normalizeResult, replaceAt, reviewProgress } from './authoring/review.js'
import { ReviewContext, useStoredFlag } from './authoring/review/shared.jsx'
import { FormulasSection } from './authoring/review/FormulasSection.jsx'
import { VariablesSection } from './authoring/review/VariablesSection.jsx'
import { ObjectsSection } from './authoring/review/ObjectsSection.jsx'
import { RelationsSection, StepsSection } from './authoring/review/StepsSection.jsx'
import { AssumptionsSection, MissingSection, TopicSection, WarningsSection } from './authoring/review/OtherSections.jsx'
import './authoring/authoring.css'

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Step 3: the teacher checks and fixes what the AI read, item by item (spec §Bước 4, §11). */
export default function ReviewStep() {
  const { t, fmt } = useT()
  const { ai } = useAuth()
  const toast = useToast()
  const { lab, updateAnalysis } = useLab()
  const syncLab = useLabSync()
  const analysis = lab.analysis || {}
  const hasResult = analysis.status === 'done' && Boolean(analysis.result)
  const result = useMemo(() => normalizeResult(analysis.result), [analysis.result])
  const [topicConfirmed, setTopicConfirmed] = useStoredFlag(`cl.review.topic.${lab.id}.${analysis.created_at || 'none'}`)
  const [announceText, setAnnounceText] = useState('')
  const [samIndex, setSamIndex] = useState(null)
  const [confirmAllOpen, setConfirmAllOpen] = useState(false)
  const [localAssets, setLocalAssets] = useState({})

  const updateRef = useRef(updateAnalysis)
  updateRef.current = updateAnalysis
  const labRef = useRef(lab)
  labRef.current = lab

  const setResult = useCallback((fn) => updateRef.current((a) => ({ ...(a || {}), result: fn(normalizeResult(a?.result)) })), [])
  const announce = useCallback((text) => {
    setAnnounceText('')
    window.requestAnimationFrame(() => setAnnounceText(text))
  }, [])
  const openSam = useCallback((index) => setSamIndex(index), [])
  const assetUrl = useCallback((id) => (labRef.current.assets || []).find((a) => a.id === id)?.url || localAssets[id] || `/api/assets/${id}/file`, [localAssets])
  const sourceTitle = useCallback((id) => (labRef.current.sources || []).find((s) => s.id === id)?.title || t('review.objects.unknownSource'), [t])
  const context = useMemo(() => ({ setResult, announce, openSam, assetUrl, sourceTitle }), [setResult, announce, openSam, assetUrl, sourceTitle])

  const variables = result.variables
  const known = useMemo(() => knownSymbols(result), [result])
  const unitFor = useCallback((symbol) => (symbol ? variables.find((v) => v && v.symbol === symbol)?.unit || '' : ''), [variables])
  const valueFor = useCallback((symbol) => (symbol ? variables.find((v) => v && v.symbol === symbol && typeof v.value === 'number') || null : null), [variables])
  // The prompt numbered the analysed sources [1], [2]… in this order (see nameSourceRefs).
  const sourceTitles = useMemo(() => (analysis.source_ids || []).map((id) => (lab.sources || []).find((s) => s.id === id)?.title || null), [analysis.source_ids, lab.sources])
  const progress = reviewProgress(result, { topicConfirmed })
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0
  const remaining = progress.total - progress.done

  const imageSources = (lab.sources || []).filter((s) => s.status === 'ready' && (s.kind === 'image' || (s.kind === 'pdf' && s.urls?.page)))
  const samReason = !ai?.configured ? t('review.objects.samNoAi') : !imageSources.length ? t('review.objects.samNoImage') : null
  const samObject = samIndex !== null ? result.objects[samIndex] : null

  const relationSuggestions = useMemo(
    () => [...new Set([...result.objects.map((o) => o.name), ...result.steps.map((s) => s.title), ...result.variables.map((v) => v.name || v.symbol)].filter(Boolean))].slice(0, 80),
    [result.objects, result.steps, result.variables],
  )

  const sections = [
    { id: 'topic', label: t('review.topic.short'), p: progress.sections.topic },
    { id: 'formulas', label: t('review.formulas.short'), p: progress.sections.formulas },
    { id: 'variables', label: t('review.variables.short'), p: progress.sections.variables },
    { id: 'objects', label: t('review.objects.short'), p: progress.sections.objects },
    {
      id: 'steps',
      label: t('review.steps.short'),
      p: { done: progress.sections.steps.done + progress.sections.sequence.done, total: progress.sections.steps.total + progress.sections.sequence.total },
    },
    { id: 'relations', label: t('review.relations.short'), p: progress.sections.relations },
    { id: 'missing', label: t('review.missing.short'), p: progress.sections.missing_info },
    { id: 'assumptions', label: t('review.assumptions.short'), p: progress.sections.assumptions },
  ]

  const jump = (id) => {
    const heading = document.getElementById(`review-${id}-title`)
    if (!heading) return
    heading.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    heading.focus({ preventScroll: true })
  }

  if (!hasResult) {
    return (
      <div className="container page au-page">
        <StepHeader step="review" title={t('review.step.title')} description={t('review.step.desc')} />
        <section className="card">
          <EmptyState
            icon={Sparkles}
            title={t('review.noAnalysisTitle')}
            action={
              <div className="row" style={{ justifyContent: 'center' }}>
                <LinkButton to={`/app/labs/${lab.id}/analyze`} variant="primary" icon={Sparkles}>
                  {t('review.noAnalysisAction')}
                </LinkButton>
                <LinkButton to={`/app/labs/${lab.id}/build`}>{t('review.skipToBuild')}</LinkButton>
              </div>
            }
          >
            <p>{t('review.noAnalysis')}</p>
          </EmptyState>
        </section>
      </div>
    )
  }

  return (
    <ReviewContext.Provider value={context}>
      <div className="container page au-page au-review">
        <p className="visually-hidden" role="status" aria-live="polite">
          {announceText}
        </p>
        <StepHeader step="review" title={t('review.step.title')} description={t('review.step.desc')} />

        <Alert tone="info" title={t('review.intro.title')}>
          {t('review.intro.body')}
        </Alert>

        <details className="au-legend">
          <summary>{t('review.legend.title')}</summary>
          <dl>
            {PROVENANCES.map((p) => (
              <div key={p}>
                <dt>
                  <ProvenanceBadge value={p} />
                </dt>
                <dd className="small">{t(`common.provenance.${p}Hint`)}</dd>
              </div>
            ))}
          </dl>
          <p className="au-legend-note">
            <Info size={14} aria-hidden="true" /> {t('review.legend.located')}
          </p>
        </details>

        <div className="au-review-bar">
          <div className="au-review-bar-top">
            <div className="au-review-progress">
              <p className="au-review-count">
                {progress.complete ? <CircleCheck aria-hidden="true" className="au-ok-icon" /> : null}
                {t('review.progress', { done: fmt.number(progress.done, 0), total: fmt.number(progress.total, 0) })}
              </p>
              <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t('review.progressAria')}>
                <span style={{ inlineSize: `${pct}%` }} />
              </div>
            </div>
            <Button size="sm" icon={CheckCheck} onClick={() => setConfirmAllOpen(true)} disabled={progress.complete}>
              {t('review.confirmAll')}
            </Button>
          </div>
          <nav className="au-jump" aria-label={t('review.jumpLabel')}>
            {sections.map((s) => (
              <button key={s.id} type="button" className={['au-jump-chip', s.p.total && s.p.done === s.p.total ? 'is-done' : ''].filter(Boolean).join(' ')} onClick={() => jump(s.id)}>
                {s.label}
                <span className="au-jump-count">{s.p.total ? `${s.p.done}/${s.p.total}` : '0'}</span>
              </button>
            ))}
          </nav>
        </div>

        <WarningsSection warnings={result.warnings} titles={sourceTitles} />
        <TopicSection topic={result.topic} summary={result.summary} confirmed={topicConfirmed} onConfirm={setTopicConfirmed} progress={progress.sections.topic} />
        <FormulasSection formulas={result.formulas} variables={variables} known={known} progress={progress.sections.formulas} />
        <VariablesSection variables={variables} progress={progress.sections.variables} />
        <ObjectsSection objects={result.objects} progress={progress.sections.objects} samReason={samReason} />
        <StepsSection
          steps={result.steps}
          sequenceClear={result.sequence_clear}
          progress={{ done: progress.sections.steps.done + progress.sections.sequence.done, total: progress.sections.steps.total + progress.sections.sequence.total }}
        />
        <RelationsSection relations={result.relations} suggestions={relationSuggestions} progress={progress.sections.relations} />
        <MissingSection missing={result.missing_info} unitFor={unitFor} valueFor={valueFor} titles={sourceTitles} progress={progress.sections.missing_info} />
        <AssumptionsSection assumptions={result.assumptions} progress={progress.sections.assumptions} />

        <NextStepCard
          to={`/app/labs/${lab.id}/build`}
          step="build"
          description={t('review.next.desc')}
          note={remaining > 0 ? t('review.next.incomplete', { count: remaining }) : t('review.next.complete')}
          noteTone={remaining > 0 ? 'warning' : 'success'}
          primary
        />

        <ConfirmDialog
          open={confirmAllOpen}
          onClose={() => setConfirmAllOpen(false)}
          onConfirm={() => {
            setResult((r) => confirmAll(r))
            if (result.topic || result.summary) setTopicConfirmed(true)
            setConfirmAllOpen(false)
            toast.success(t('review.confirmAllDone'))
            announce(t('review.confirmAllDone'))
          }}
          title={t('review.confirmAllTitle')}
          confirmLabel={t('review.confirmAllAction')}
        >
          <div className="stack-sm">
            <p style={{ margin: 0 }}>{t('review.confirmAllBody')}</p>
            <p className="small muted" style={{ margin: 0 }}>
              {t('review.confirmAllExcept')}
            </p>
          </div>
        </ConfirmDialog>

        <SamSelectorDialog
          open={samIndex !== null}
          onClose={() => setSamIndex(null)}
          title={t('review.objects.samTitle', { name: samObject?.name || t('review.objects.item', { n: (samIndex ?? 0) + 1 }) })}
          labId={lab.id}
          sources={lab.sources}
          sourceId={samObject?.source_id || undefined}
          initialPhrase={samObject?.sam_phrase || samObject?.name || ''}
          label={samObject?.name || ''}
          onSelect={async ({ asset, source_id: sourceId, phrase_used: phraseUsed }) => {
            const index = samIndex
            setLocalAssets((m) => ({ ...m, [asset.id]: asset.url }))
            setSamIndex(null)
            await syncLab((l) => ({ ...l, assets: upsertById(l.assets, asset) }))
            setResult((r) => {
              const current = r.objects[index]
              if (!current) return r
              // Keep the English phrase that actually found the object (e.g. "red ball"), so a
              // later re-selection or video tracking starts from a phrase known to work.
              const samPhrase = phraseUsed ? String(phraseUsed).slice(0, 200) : current.sam_phrase
              return { ...r, objects: replaceAt(r.objects, index, { ...current, asset_id: asset.id, source_id: sourceId || current.source_id || null, sam_phrase: samPhrase }) }
            })
            toast.success(t('review.objects.cutoutSaved'))
            announce(t('review.objects.cutoutSaved'))
          }}
        />
      </div>
    </ReviewContext.Provider>
  )
}
