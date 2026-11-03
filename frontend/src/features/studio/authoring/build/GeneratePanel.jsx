import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, ListChecks, Sparkles } from 'lucide-react'
import { useT } from '../../../../i18n/index.jsx'
import { post } from '../../../../lib/api.js'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { Alert, Button, ConfirmDialog, ErrorMessage, LinkButton, Segmented } from '../../../../components/ui/index.js'
import { useLab } from '../../../lab/LabContext.jsx'
import { BLOCK_TYPES, TEACHER_ONLY_BLOCK_TYPES } from '../../../lab/specUtils.js'
import { blockIcon } from '../../../blocks/registry.js'
import { AiProgress } from '../AiProgress.jsx'
import { useAiJob } from '../aiJob.js'
import { normalizeResult, reviewProgress } from '../review.js'
import { useStoredFlag } from '../review/shared.jsx'
import { FormulaPicker, formulaChoices, existingFormulaIds, MAX_FORMULAS } from './FormulaPicker.jsx'
import { VISUAL_CATALOG, visualCopy, visualName } from '../../../visuals/catalog.js'

const FEASIBILITY_TONE = { ready: 'badge-success', needs_input: 'badge-warning', not_supported: 'badge-outline' }
/** Block types with a specific "what is missing" hint (build.generate.needsInput.*). */
const NEEDS_INPUT_HINTS = new Set(['video', 'field', 'simulation', 'graph', 'diagram'])
// A board is made by the teacher from a photo, never generated empty (the server refuses it).
const AI_TYPES = BLOCK_TYPES.filter((type) => !TEACHER_ONLY_BLOCK_TYPES.includes(type))

function TypeOption({ type, checked, disabled, onToggle, suggestion }) {
  const { t } = useT()
  const Icon = blockIcon(type)
  const id = `gen-${type}`
  return (
    <li className={['au-gen-type', checked ? 'is-checked' : '', disabled ? 'is-disabled' : ''].filter(Boolean).join(' ')}>
      <label htmlFor={id}>
        <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onToggle(type, e.target.checked)} />
        <span className="au-gen-icon" aria-hidden="true">
          <Icon />
        </span>
        <span className="au-gen-text">
          <span className="au-gen-name">
            <strong>{t(`blocks.types.${type}`)}</strong>
            {suggestion ? (
              <span className={`badge ${FEASIBILITY_TONE[suggestion.feasibility] || 'badge-outline'}`}>{t(`build.generate.feasibility.${suggestion.feasibility || 'ready'}`)}</span>
            ) : null}
            {suggestion?.model ? <span className="badge badge-outline">{t(`build.generate.models.${suggestion.model}`)}</span> : null}
            {suggestion?.algorithm ? <span className="badge badge-outline mono">{suggestion.algorithm}</span> : null}
          </span>
          <span className="small muted">{suggestion?.reason || t(`blocks.typeHints.${type}`)}</span>
          {disabled && suggestion?.feasibility === 'not_supported' ? <span className="small">{t('build.generate.notSupportedHint')}</span> : null}
          {suggestion?.feasibility === 'needs_input' ? (
            <span className="small au-warn-text">{t(NEEDS_INPUT_HINTS.has(type) ? `build.generate.needsInput.${type}` : 'build.generate.needsInputHint')}</span>
          ) : null}
        </span>
      </label>
    </li>
  )
}

/**
 * AI generation (spec §Bước 5): block types pre-checked from analysis.suggested_blocks,
 * append or replace, honest waiting panel, warnings from the server.
 */
export function GeneratePanel({ blockCount, onGenerated }) {
  const { t, lang } = useT()
  const visualWords = visualCopy(lang)
  const [visual, setVisual] = useState(() => blockCount ? '' : 'auto')
  const { ai } = useAuth()
  const { lab, flush, replaceLab } = useLab()
  const analysis = lab.analysis || {}
  // School2Lab generates from the reviewed analysis; Paper2Explorer from the paper map (analysis.paper).
  const hasResult = analysis.status === 'done' && Boolean(analysis.result || analysis.paper)
  const result = useMemo(() => normalizeResult(analysis.result), [analysis.result])
  const suggestions = useMemo(() => {
    const seen = new Set()
    return result.suggested_blocks.filter((s) => s && AI_TYPES.includes(s.type) && !seen.has(s.type) && seen.add(s.type))
  }, [result.suggested_blocks])
  const suggestedTypes = suggestions.map((s) => s.type)
  // When adding to an existing lesson, start with graphs only so other AI sections are not duplicated.
  const defaultGraphs = blockCount > 0 && lab.space !== 'paper2explorer' && formulaChoices(result.formulas).some((c) => !c.reason)
  const defaultTypes = () => defaultGraphs ? new Set(['graph']) : new Set(suggestions.filter((s) => s.feasibility !== 'not_supported').map((s) => s.type))
  const [types, setTypes] = useState(defaultTypes)
  const [showOthers, setShowOthers] = useState(() => defaultGraphs && !suggestedTypes.includes('graph'))
  // Suggestions can arrive after mount (analysis finishing or rerun): pre-check them again, unless the
  // teacher already chose types for this same analysis.
  const analysisKey = `${lab.id}|${analysis.created_at || ''}`
  const suggestionKey = JSON.stringify(suggestions.map((s) => [s.type, s.feasibility]))
  const seeded = useRef({ analysisKey, suggestionKey, touched: false })
  useEffect(() => {
    const seen = seeded.current
    if (seen.analysisKey === analysisKey && seen.suggestionKey === suggestionKey) return
    const keepChoice = seen.analysisKey === analysisKey && seen.touched
    seeded.current = { analysisKey, suggestionKey, touched: keepChoice }
    if (keepChoice) return
    setTypes(defaultTypes())
    setShowOthers(defaultGraphs && !suggestedTypes.includes('graph'))
    // the keys capture what the defaults depend on; blockCount must not reset the teacher's choice
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisKey, suggestionKey])
  const [mode, setMode] = useState('append')
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [warnings, setWarnings] = useState([])
  const [formError, setFormError] = useState(null)
  const [completedFormulas, setCompletedFormulas] = useState(() => new Set())
  const completedRef = useRef(new Set())
  const choices = useMemo(() => formulaChoices(result.formulas), [result.formulas])
  const existing = useMemo(() => existingFormulaIds(result.formulas, lab.spec?.blocks), [result.formulas, lab.spec?.blocks])
  const formulaSignature = JSON.stringify(choices.map(({ formula, reason }) => [formula.id, reason, formula.expression]))
  const [selectedFormulas, setSelectedFormulas] = useState(() => new Set(choices.filter((c) => !c.reason && !existing.has(c.formula.id)).slice(0, MAX_FORMULAS).map((c) => c.formula.id)))
  useEffect(() => {
    completedRef.current = new Set()
    setCompletedFormulas(new Set())
    setSelectedFormulas(new Set(choices.filter((c) => !c.reason && !existing.has(c.formula.id)).slice(0, MAX_FORMULAS).map((c) => c.formula.id)))
    // formulaSignature captures the reviewed fields that determine eligibility.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lab.id, formulaSignature])

  const job = useAiJob(`generate:${lab.id}`, (finished, { late }) => {
    if (finished.status === 'done' && finished.result) {
      // The run function updated the lab context that started the job; if the studio was
      // remounted meanwhile (left the lab and came back, hot reload…), adopt the result here.
      const serverLab = finished.result.lab
      if (serverLab && serverLab.id === lab.id && (serverLab.version || 0) > (lab.version || 0)) replaceLab(serverLab)
      setWarnings(finished.result.warnings || [])
      // A generation call can succeed partially. Advance only past formulas the server
      // confirms were actually saved; failed formulas remain selected for a retry.
      const created = finished.result.generated_formula_ids || []
      if (created.length) {
        const next = new Set([...completedRef.current, ...created])
        completedRef.current = next
        setCompletedFormulas(next)
        setSelectedFormulas(new Set(choices.filter((c) => !c.reason && !next.has(c.formula.id) && !existing.has(c.formula.id)).slice(0, MAX_FORMULAS).map((c) => c.formula.id)))
        seeded.current.touched = true
        setTypes(new Set(['graph']))
        if (!suggestedTypes.includes('graph')) setShowOthers(true)
      }
      // A second batch must append to the just-created sections, including after a partial run.
      if ((finished.result.generated_block_ids || []).length) setMode('append')
      onGenerated?.(finished.result.generated_block_ids || [], { late })
    }
  })

  // same per-browser "topic checked" flag as the Review step, so both show the same count
  const [topicConfirmed] = useStoredFlag(`cl.review.topic.${lab.id}.${analysis.created_at || 'none'}`)
  const progress = reviewProgress(result, { topicConfirmed })
  const unchecked = progress.total - progress.done
  const configured = Boolean(ai?.configured)
  const otherTypes = AI_TYPES.filter((type) => !suggestedTypes.includes(type))
  const toggle = (type, on) => {
    seeded.current.touched = true
    setTypes((set) => {
      const next = new Set(set)
      if (on) next.add(type)
      else next.delete(type)
      return next
    })
  }
  const toggleFormula = (id, on) => setSelectedFormulas((current) => {
    const next = new Set(current)
    if (on && next.size < MAX_FORMULAS) next.add(id)
    else if (!on) next.delete(id)
    return next
  })
  const explicitVisual = Boolean(visual && visual !== 'auto')
  const countRequested = types.size + (explicitVisual && !types.has('text') ? 1 : 0) + (types.has('graph') && lab.space !== 'paper2explorer' && choices.length ? Math.max(0, selectedFormulas.size - 1) : 0)

  const run = () => {
    if (!types.size && !explicitVisual) {
      setFormError(t('build.generate.errNoType'))
      return
    }
    if (types.has('graph') && lab.space !== 'paper2explorer' && choices.length && !selectedFormulas.size) {
      setFormError(t('build.generate.formulas.choose'))
      return
    }
    setFormError(null)
    setWarnings([])
    const body = { block_types: types.size ? [...types] : ['text'], replace: mode === 'replace' }
    if (visual) body.visual3d = visual
    if (types.has('graph') && lab.space !== 'paper2explorer' && choices.length) body.formula_ids = [...selectedFormulas]
    job.start(async (signal) => {
      await flush()
      const res = await post(`/api/labs/${lab.id}/ai/generate`, body, { signal })
      if (res?.lab) replaceLab(res.lab)
      return { lab: res?.lab || null, generated_block_ids: res?.generated_block_ids || [], generated_formula_ids: res?.generated_formula_ids || [], warnings: res?.warnings || [] }
    })
  }

  const onClick = () => {
    if (mode === 'replace' && blockCount > 0) setConfirmReplace(true)
    else run()
  }

  if (job.running) {
    return (
      <AiProgress
        title={visual === 'auto' ? visualWords.autoWorking : t('build.generate.working', { count: countRequested || suggestedTypes.length })}
        startedAt={job.startedAt}
        messages={[t('build.generate.stage1'), t('build.generate.stage2'), t('build.generate.stage3'), t('build.generate.stage4')]}
        note={t('build.generate.note')}
        onCancel={job.cancel}
      />
    )
  }

  const paper = lab.space === 'paper2explorer'
  return (
    <section className="card stack au-generate" aria-labelledby="au-generate-title">
      <div className="au-card-head">
        <div>
          <h3 id="au-generate-title" tabIndex={-1}>
            {t('build.generate.title')}
          </h3>
          <p>{t('build.generate.desc')}</p>
        </div>
      </div>

      {!configured ? <Alert tone="warning">{t('common.ai.notConfigured')} {t('build.generate.manualStill')}</Alert> : null}

      {job.error ? <ErrorMessage error={job.error} title={t('build.generate.failed')} onRetry={run} /> : null}
      {job.canceled ? <Alert tone="info">{t('build.generate.canceled')}</Alert> : null}
      {warnings.length ? (
        <Alert tone="warning" title={t('build.generate.warningsTitle')}>
          <ul className="au-plain-list">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <div className="au-alert-action">
            <Button size="sm" variant="ghost" onClick={() => setWarnings([])}>
              {t('common.actions.close')}
            </Button>
          </div>
        </Alert>
      ) : null}

      {!hasResult ? (
        <Alert tone="neutral" title={paper ? t('build.generate.noAnalysisTitlePaper') : t('build.generate.noAnalysisTitle')}>
          <p className="au-alert-text">{paper ? t('build.generate.noAnalysisPaper') : t('build.generate.noAnalysis')}</p>
          <div className="au-alert-action">
            <LinkButton size="sm" to={`/app/labs/${lab.id}/${paper ? 'paper' : 'analyze'}`} icon={Sparkles}>
              {paper ? t('build.generate.toPaper') : t('build.generate.toAnalyze')}
            </LinkButton>
          </div>
        </Alert>
      ) : (
        <>
          {unchecked > 0 && !paper ? (
            <Alert tone="warning">
              <p className="au-alert-text">{t('build.generate.reviewIncomplete', { count: unchecked })}</p>
              <div className="au-alert-action">
                <LinkButton size="sm" to={`/app/labs/${lab.id}/review`} icon={ListChecks}>
                  {t('build.generate.toReview')}
                </LinkButton>
              </div>
            </Alert>
          ) : null}

          <fieldset className="au-fieldset">
            <legend>{t('build.generate.typesLegend')}</legend>
            {suggestions.length ? (
              <ul className="list-reset au-gen-list">
                {suggestions.map((s) => (
                  <TypeOption key={s.type} type={s.type} suggestion={s} checked={types.has(s.type)} disabled={s.feasibility === 'not_supported'} onToggle={toggle} />
                ))}
              </ul>
            ) : (
              <p className="small muted" style={{ margin: 0 }}>
                {t('build.generate.noSuggestions')}
              </p>
            )}
            <Button size="sm" variant="ghost" icon={showOthers || !suggestions.length ? ChevronUp : ChevronDown} aria-expanded={showOthers || !suggestions.length} onClick={() => setShowOthers((v) => !v)}>
              {t('build.generate.otherTypes', { count: otherTypes.length })}
            </Button>
            {showOthers || !suggestions.length ? (
              <ul className="list-reset au-gen-list is-others">
                {otherTypes.map((type) => (
                  <TypeOption key={type} type={type} checked={types.has(type)} onToggle={toggle} />
                ))}
              </ul>
            ) : null}
          </fieldset>

          {types.has('graph') && !paper && choices.length ? (
            <FormulaPicker choices={choices} selected={selectedFormulas} completed={completedFormulas} existing={existing} onToggle={toggleFormula} labId={lab.id}
              onSelectAll={() => setSelectedFormulas(new Set(choices.filter((c) => !c.reason).slice(0, MAX_FORMULAS).map((c) => c.formula.id)))}
              onSelectRemaining={() => setSelectedFormulas(new Set(choices.filter((c) => !c.reason && !completedFormulas.has(c.formula.id) && !existing.has(c.formula.id)).slice(0, MAX_FORMULAS).map((c) => c.formula.id)))}
              onClear={() => setSelectedFormulas(new Set())} />
          ) : null}

          <fieldset className="au-fieldset">
            <legend>{visualWords.label}</legend>
            <p className="small">{visualWords.intro}</p>
            <select className="select" aria-label={visualWords.label} value={visual} onChange={(e) => setVisual(e.target.value)}>
              <option value="auto">{visualWords.auto}</option>
              <option value="">{visualWords.none}</option>
              {VISUAL_CATALOG.map((item) => <option key={item.id} value={item.id}>{visualName(item, lang)}</option>)}
            </select>
            <p className="small muted">{VISUAL_CATALOG.find((item) => item.id === visual)?.scope[lang] || visualWords.note}</p>
          </fieldset>

          <div className="au-gen-mode">
            <span className="field-label" id="au-gen-mode">
              {t('build.generate.modeLabel')}
            </span>
            <Segmented
              label={t('build.generate.modeLabel')}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'append', label: t('build.generate.append') },
                { value: 'replace', label: t('build.generate.replace') },
              ]}
            />
            <p className="small muted" style={{ margin: 0 }}>
              {mode === 'replace' ? t('build.generate.replaceHint', { count: blockCount }) : t('build.generate.appendHint')}
            </p>
          </div>

          {formError ? (
            <Alert tone="danger" role="alert">
              {formError}
            </Alert>
          ) : null}

          <div className="au-run-row">
            <Button variant={blockCount ? undefined : 'primary'} size={blockCount ? undefined : 'lg'} icon={Sparkles} disabled={!configured || (!types.size && !explicitVisual)} onClick={onClick}>
              {visual === 'auto' ? visualWords.autoRun : t('build.generate.run', { count: countRequested })}
            </Button>
            <span className="small muted">{t('build.generate.afterNote')}</span>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmReplace}
        onClose={() => setConfirmReplace(false)}
        onConfirm={() => {
          setConfirmReplace(false)
          run()
        }}
        tone="danger"
        title={t('build.generate.replaceTitle')}
        confirmLabel={t('build.generate.replaceConfirm')}
      >
        <p style={{ margin: 0 }}>{t('build.generate.replaceBody', { count: blockCount })}</p>
      </ConfirmDialog>
    </section>
  )
}
