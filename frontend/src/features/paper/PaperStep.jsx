import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Brain, Clock, FileText, Info, RefreshCw, Sparkles, Upload, X } from 'lucide-react'
import { translate, useT } from '../../i18n/index.jsx'
import { post } from '../../lib/api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { useLab } from '../lab/LabContext.jsx'
import { useStudio } from '../studio/LabStudioLayout.jsx'
import { AIBadge, Alert, Button, Dialog, EmptyState, ErrorMessage, LinkButton, RichText, TabPanel, Tabs, useToast } from '../../components/ui/index.js'
import { EquationDetail } from './EquationPanel.jsx'
import { CandidatesPanel, FigureDetail, ItemList, KindEmpty, MethodDetail, SectionsPanel, TableDetail, itemLabel } from './PaperPanels.jsx'
import PaperPageViewer from './PaperPageViewer.jsx'
import { KIND_ICONS, PaperSetupForm, ProgressPanel, WhatYouGet, runModel, usePaperSetup } from './PaperSetup.jsx'
import { cancelPaperJob, clearPaperFailure, startPaperJob, usePaperJob } from './paperJob.js'
import { ITEM_KINDS, attentionExampleBlock, conciseBlockTitle, findItem, firstRef, listItems, modelLabel, prepareBlockForLab, sanitizeEquation } from './paperUtils.js'
import { WorkspaceContext } from './workspaceContext.js'
import { StepHeader } from '../studio/authoring/StepHeader.jsx'
import '../studio/authoring/authoring.css'
import './paper.css'

const NARROW = '(max-width: 960px)'

function FailureAlert({ failure, onRetry, onDismiss }) {
  const { t } = useT()
  if (failure?.canceled) {
    return (
      <Alert
        tone="info"
        title={t('paper.canceled.title')}
        action={
          onDismiss ? (
            <Button size="sm" variant="ghost" icon={X} onClick={onDismiss}>
              {t('paper.failure.dismiss')}
            </Button>
          ) : null
        }
      >
        {t('paper.canceled.body')}
      </Alert>
    )
  }
  const code = failure?.error?.code
  const hint = ['ai_timeout', 'ai_input_too_large', 'ai_upstream_error'].includes(code) ? t('paper.failure.fewerPages') : null
  return (
    <div className="stack-sm">
      <ErrorMessage error={failure.error} title={t('paper.failure.title')} onRetry={onRetry} />
      {hint || onDismiss ? (
        <div className="row-between">
          {hint ? <p className="small muted" style={{ margin: 0 }}>{hint}</p> : <span />}
          {onDismiss ? (
            <Button size="sm" variant="ghost" icon={X} onClick={onDismiss}>
              {t('paper.failure.dismiss')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function SetupView({ lab, ai, failure, onRun }) {
  const { t } = useT()
  const setup = usePaperSetup(lab)
  if (!setup.pdfs.length) {
    return (
      <div className="card">
        <EmptyState
          icon={FileText}
          title={t('paper.setup.noPdfTitle')}
          action={
            <LinkButton variant="paper" icon={Upload} to={`/app/labs/${lab.id}/sources`}>
              {t('paper.setup.goToSources')}
            </LinkButton>
          }
        >
          <p>{t('paper.setup.noPdfBody')}</p>
        </EmptyState>
      </div>
    )
  }
  return (
    <div className="paper-setup-grid">
      <section className="card stack" aria-labelledby="paper-setup-title">
        <div className="au-card-head">
          <div>
            <h3 id="paper-setup-title">{t('paper.setup.heading')}</h3>
            <p>{t('paper.setup.intro')}</p>
          </div>
        </div>
        {failure ? <FailureAlert failure={failure} onRetry={ai?.configured ? () => onRun(failure.body) : undefined} /> : null}
        {!setup.ready.length ? <Alert tone="info">{t('paper.setup.waitProcessing')}</Alert> : null}
        <PaperSetupForm lab={lab} setup={setup} ai={ai} />
        {!ai?.configured ? <Alert tone="warning">{t('paper.setup.aiOff')}</Alert> : null}
        <div className="row">
          <Button variant="paper" size="lg" icon={Sparkles} disabled={!setup.valid || !ai?.configured} onClick={() => onRun(setup.body)}>
            {t('paper.setup.run')}
          </Button>
        </div>
      </section>
      <WhatYouGet />
    </div>
  )
}

function RerunDialog({ open, onClose, lab, ai, onRun }) {
  const { t } = useT()
  const setup = usePaperSetup(lab)
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('paper.rerunTitle')}
      size="wide"
      footer={
        <>
          <Button onClick={onClose}>{t('common.actions.cancel')}</Button>
          <Button variant="paper" icon={RefreshCw} disabled={!setup.valid || !ai?.configured} onClick={() => onRun(setup.body)}>
            {t('paper.rerunConfirm')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <Alert tone="warning">{t('paper.rerunWarning')}</Alert>
        {!ai?.configured ? <Alert tone="info">{t('paper.setup.aiOff')}</Alert> : null}
        <PaperSetupForm lab={lab} setup={setup} ai={ai} />
      </div>
    </Dialog>
  )
}

function PaperOverview({ lab, paper, headingRef }) {
  const { t, fmt } = useT()
  const [expanded, setExpanded] = useState(false)
  const analysis = lab.analysis || {}
  const source = (lab.sources || []).find((s) => s.id === analysis.source_ids?.[0])
  const summary = String(paper.summary || '')
  const long = summary.length > 420
  return (
    <section className="card stack paper-overview" aria-labelledby="paper-overview-title">
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div className="stack-sm" style={{ minInlineSize: 0, flex: '1 1 20rem' }}>
          <h3 id="paper-overview-title" ref={headingRef} tabIndex={-1} className="paper-title break">
            {paper.title || source?.title || t('paper.untitled')}
          </h3>
          <div className="paper-meta small muted">
            {source ? (
              <span>
                <FileText size={14} aria-hidden="true" />
                {source.title}
              </span>
            ) : null}
            {analysis.model ? (
              <span>
                <Brain size={14} aria-hidden="true" />
                {modelLabel(analysis.model)}
                {analysis.mode === 'deep' ? ` (${t('paper.deepBadge')})` : ''}
              </span>
            ) : null}
            {analysis.created_at ? (
              <span>
                <Clock size={14} aria-hidden="true" />
                {t('paper.analysedAt', { when: fmt.relative(analysis.created_at) })}
              </span>
            ) : null}
          </div>
        </div>
        <AIBadge label={t('paper.aiReviewBadge')} />
      </div>
      {summary ? (
        <div className="stack-sm">
          <div className={['paper-summary', long && !expanded && 'is-clamped'].filter(Boolean).join(' ')} id="paper-summary">
            <RichText text={summary} />
          </div>
          {long ? (
            <div>
              <Button size="sm" variant="ghost" aria-expanded={expanded} aria-controls="paper-summary" onClick={() => setExpanded((e) => !e)}>
                {expanded ? t('common.actions.showLess') : t('common.actions.showMore')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {paper.warnings?.length ? (
        <Alert tone="warning" title={t('paper.warningsTitle')}>
          <ul style={{ margin: 0, paddingInlineStart: '1.1rem' }}>
            {paper.warnings.slice(0, 8).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
      <p className="paper-caption-note" role="note">
        <Info size={18} aria-hidden="true" />
        <span>{t('paper.caption')}</span>
      </p>
    </section>
  )
}

function Workspace({ lab, paper, ai, failure, onRun, onDismissFailure, focusOnMount, openRerun }) {
  const { t } = useT()
  const toast = useToast()
  const { flush, replaceLab, updateAnalysis, addBlock } = useLab()
  const { openSource } = useStudio()
  const [params, setParams] = useSearchParams()
  const headingRef = useRef(null)
  const viewerRef = useRef(null)
  const labRef = useRef(lab)
  useEffect(() => {
    labRef.current = lab
  })

  // ----- selection (kept in the URL so reload/back keep the place) -----
  const counts = useMemo(() => Object.fromEntries(ITEM_KINDS.map((k) => [k, listItems(paper, k).length])), [paper])
  const defaultTab = counts.equations ? 'equations' : counts.candidates ? 'candidates' : 'sections'
  const tab = ITEM_KINDS.includes(params.get('tab')) ? params.get('tab') : defaultTab
  const items = listItems(paper, tab)
  const itemParam = params.get('item')
  const selected = tab === 'candidates' ? null : items.find((i) => i.id === itemParam) || items[0] || null

  const select = useCallback(
    (kind, id) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('tab', kind)
          if (id) next.set('item', id)
          else next.delete('item')
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  // ----- page viewer state -----
  const pdfSources = useMemo(() => (lab.sources || []).filter((s) => s.kind === 'pdf'), [lab.sources])
  const [viewerSourceId, setViewerSourceId] = useState(() => lab.analysis?.source_ids?.[0] || pdfSources[0]?.id || null)
  const viewerSource = pdfSources.find((s) => s.id === viewerSourceId) || pdfSources[0] || null
  const [viewPage, setViewPage] = useState(1)
  const [focus, setFocus] = useState(null)

  const revealViewer = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia?.(NARROW).matches) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.requestAnimationFrame(() => viewerRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }))
  }, [])

  const selectedKey = selected ? `${tab}:${selected.id}` : ''
  useEffect(() => {
    if (!selected) return
    if (tab === 'sections') {
      const start = Number(selected.page_start) >= 1 ? Number(selected.page_start) : null
      setFocus({ type: 'section', id: selected.id, page: start })
      if (start) setViewPage(start)
      return
    }
    setFocus({ type: 'item', kind: tab, id: selected.id })
    const ref = firstRef(selected)
    if (ref?.source_id && pdfSources.some((s) => s.id === ref.source_id)) setViewerSourceId(ref.source_id)
    if (Number(ref?.page) >= 1) setViewPage(Number(ref.page))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey])

  useEffect(() => {
    if (focusOnMount?.current) {
      focusOnMount.current = false
      headingRef.current?.focus()
    }
  }, [focusOnMount])

  const showRef = useCallback(
    (ref, label, short) => {
      const src = ref?.source_id ? (labRef.current.sources || []).find((s) => s.id === ref.source_id) : null
      if (src && src.kind !== 'pdf') {
        openSource?.(ref)
        return
      }
      setFocus({ type: 'ref', ref: ref || null, label: label || '', short: short || '' })
      if (src) setViewerSourceId(src.id)
      if (Number(ref?.page) >= 1) setViewPage(Number(ref.page))
      revealViewer()
    },
    [openSource, revealViewer],
  )
  const showSection = useCallback(
    (page, label) => {
      setFocus({ type: 'section', id: null, page, label })
      if (page) setViewPage(page)
      revealViewer()
    },
    [revealViewer],
  )
  const cite = useCallback(
    (c) =>
      showRef(
        { source_id: c.source_id, page: c.page, bbox: c.bbox, quote: c.quote, time: c.time, located: c.located || 'none' },
        [`[${c.n}]`, c.title].filter(Boolean).join(' '),
        `[${c.n}]`,
      ),
    [showRef],
  )

  let viewerFocus = null
  if (focus?.type === 'item') {
    const item = findItem(paper, focus.kind, focus.id)
    if (item) viewerFocus = { kind: 'item', ref: firstRef(item), label: itemLabel(focus.kind, item, t), short: focus.kind === 'equations' ? item.label || '' : '' }
  } else if (focus?.type === 'section') {
    const item = focus.id ? findItem(paper, 'sections', focus.id) : null
    viewerFocus = { kind: 'section', page: focus.page, label: item?.title || focus.label || '' }
  } else if (focus?.type === 'ref') {
    viewerFocus = { kind: 'ref', ref: focus.ref, label: focus.label, short: focus.short }
  }

  // ----- AI actions -----
  const [gen, setGen] = useState(null)
  const [exploreState, setExploreState] = useState({})
  const [controlled, setControlled] = useState({})
  const [added, setAdded] = useState({})

  // Long AI calls started here can be stopped by the teacher (explicit "Hủy" only: leaving
  // the page keeps them running so a server-side save still reaches this Lab).
  const controllers = useRef({})
  const begin = (key) => {
    controllers.current[key]?.abort()
    const controller = new AbortController()
    controllers.current[key] = controller
    return controller
  }
  const finish = (key, controller) => {
    if (controllers.current[key] === controller) delete controllers.current[key]
  }
  const isAbort = (error, controller) => error?.name === 'AbortError' || controller.signal.aborted

  const generate = async (types, key) => {
    const controller = begin('generate')
    setGen({ key, types, status: 'loading' })
    try {
      await flush()
      const res = await post(`/api/labs/${lab.id}/ai/generate`, { block_types: types, replace: false }, { signal: controller.signal })
      if (res?.lab) replaceLab(res.lab)
      const ids = new Set(res?.generated_block_ids || [])
      const blocks = (res?.lab?.spec?.blocks || []).filter((b) => ids.has(b.id))
      setGen({ key, types, status: 'done', blocks, warnings: res?.warnings || [] })
    } catch (error) {
      setGen({ key, types, status: isAbort(error, controller) ? 'canceled' : 'error', error })
    } finally {
      finish('generate', controller)
    }
  }
  const cancelGenerate = () => controllers.current.generate?.abort()

  const explore = async (eq) => {
    const key = `explore:${eq.id}`
    const controller = begin(key)
    setExploreState((s) => ({ ...s, [eq.id]: { status: 'loading' } }))
    try {
      await flush()
      const symbols = controlled[eq.id] || []
      const body = { equation_id: eq.id }
      if (symbols.length) body.context = `The learner wants to control these variables with sliders: ${symbols.join(', ')}.`.slice(0, 3000)
      const res = await post(`/api/labs/${lab.id}/ai/explore-equation`, body, { signal: controller.signal })
      const prepared = res?.block ? prepareBlockForLab(res.block, labRef.current.spec?.blocks || []) : null
      const language = lab.language === 'en' ? 'en' : 'vi'
      const block = prepared
        ? { ...prepared, title: conciseBlockTitle(prepared.title, eq.label, (label) => translate(language, 'paper.explore.blockTitle', { label })) }
        : null
      setExploreState((s) => ({ ...s, [eq.id]: { status: 'done', result: res, block } }))
    } catch (error) {
      setExploreState((s) => ({ ...s, [eq.id]: isAbort(error, controller) ? { status: 'canceled' } : { status: 'error', error } }))
    } finally {
      finish(key, controller)
    }
  }
  const cancelExplore = (eqId) => controllers.current[`explore:${eqId}`]?.abort()

  const toggleControlled = useCallback((eqId, symbol) => {
    setControlled((m) => {
      const list = m[eqId] || []
      return { ...m, [eqId]: list.includes(symbol) ? list.filter((s) => s !== symbol) : [...list, symbol] }
    })
  }, [])

  const addPreviewBlock = (eqId) => {
    const key = `explore:${eqId}`
    const st = exploreState[eqId]
    if (!st?.block || added[key]) return
    const block = prepareBlockForLab(st.block, labRef.current.spec?.blocks || [])
    if (!block) return
    addBlock(block)
    setAdded((m) => ({ ...m, [key]: block.id }))
    toast.success(t('paper.added.toast'))
  }

  const addAttention = (key, item) => {
    if (added[key]) return
    const language = lab.language === 'en' ? 'en' : 'vi'
    const block = attentionExampleBlock({
      title: translate(language, 'paper.attention.title'),
      description: translate(language, 'paper.attention.description'),
      explanation: translate(language, 'paper.attention.explanation'),
      refs: item?.source_refs || [],
      language,
    })
    addBlock(block)
    setAdded((m) => ({ ...m, [key]: block.id }))
    toast.success(t('paper.added.toast'))
  }

  const saveEquation = (eqId, next) =>
    updateAnalysis((a) => ({
      ...a,
      paper: { ...a.paper, equations: (a.paper?.equations || []).map((e) => (e.id === eqId ? next : e)) },
    }))

  const applyAiEquation = (eqId, aiEq) =>
    updateAnalysis((a) => ({
      ...a,
      paper: {
        ...a.paper,
        equations: (a.paper?.equations || []).map((e) =>
          e.id !== eqId
            ? e
            : sanitizeEquation({
                ...e,
                variables: Array.isArray(aiEq.variables) && aiEq.variables.length ? aiEq.variables : e.variables,
                missing: Array.isArray(aiEq.missing) ? aiEq.missing : e.missing,
                conditions: aiEq.conditions || e.conditions,
                expression: aiEq.expression || e.expression,
                explorable: typeof aiEq.explorable === 'boolean' ? aiEq.explorable : e.explorable,
                suggestion: aiEq.suggestion || e.suggestion,
              }),
        ),
      },
    }))

  const ws = {
    lab,
    paper,
    aiAvailable: Boolean(ai?.configured),
    buildPath: `/app/labs/${lab.id}/build`,
    sourcesPath: `/app/labs/${lab.id}/sources`,
    select,
    showRef,
    showSection,
    cite,
    gen,
    generate,
    cancelGenerate,
    exploreState,
    explore,
    cancelExplore,
    controlled,
    toggleControlled,
    added,
    addPreviewBlock,
    addAttention,
    saveEquation,
    applyAiEquation,
    openRerun,
  }

  let content
  if (tab === 'sections') content = <SectionsPanel sections={items} selectedId={selected?.id} source={viewerSource} />
  else if (tab === 'candidates') content = <CandidatesPanel candidates={items} />
  else if (!items.length) content = <KindEmpty kind={tab} />
  else {
    content = (
      <div className="stack">
        <ItemList kind={tab} items={items} selectedId={selected?.id} />
        {selected && tab === 'equations' ? <EquationDetail key={selected.id} eq={selected} /> : null}
        {selected && tab === 'figures' ? <FigureDetail key={selected.id} fig={selected} /> : null}
        {selected && tab === 'tables' ? <TableDetail key={selected.id} table={selected} /> : null}
        {selected && tab === 'methods' ? <MethodDetail key={selected.id} method={selected} /> : null}
      </div>
    )
  }

  return (
    <WorkspaceContext.Provider value={ws}>
      <div className="stack">
        {failure ? <FailureAlert failure={failure} onRetry={ai?.configured ? () => onRun(failure.body) : undefined} onDismiss={onDismissFailure} /> : null}
        <PaperOverview lab={lab} paper={paper} headingRef={headingRef} />
        <div className="paper-workspace">
          <div className="paper-main stack">
            <Tabs
              label={t('paper.tabsLabel')}
              idPrefix="paper"
              value={tab}
              onChange={(kind) => select(kind, null)}
              tabs={ITEM_KINDS.map((kind) => ({ id: kind, label: t(`paper.kinds.${kind}`), icon: KIND_ICONS[kind], badge: counts[kind] }))}
            />
            <TabPanel idPrefix="paper" id={tab} value={tab} className="paper-tabpanel">
              {content}
            </TabPanel>
          </div>
          <div className="paper-side" ref={viewerRef}>
            <PaperPageViewer source={viewerSource} page={viewPage} onPageChange={setViewPage} focus={viewerFocus} />
          </div>
        </div>
      </div>
    </WorkspaceContext.Provider>
  )
}

/**
 * /app/labs/:labId/paper — Paper2Explorer (spec §9.1–9.5, Demo 3).
 * No structure yet → choose PDF + pages (+ deep analysis) and run POST /ai/paper-structure.
 * Structure present → two-pane workspace: tabs of sections / equations / figures / tables /
 * methods / candidates on the left, the cited PDF page with its highlight on the right.
 */
export default function PaperStep() {
  const { t } = useT()
  const { ai } = useAuth()
  const { lab, flush, replaceLab } = useLab()
  const toast = useToast()
  const { job, failure } = usePaperJob(lab?.id)
  const justFinished = useRef(false)
  const [rerunOpen, setRerunOpen] = useState(false)
  const paper = lab?.analysis?.paper || null

  const runStructure = useCallback(
    (body) => {
      if (!lab || !body) return
      const labId = lab.id
      const meta = { model: runModel(ai, lab, body.deep) }
      startPaperJob(labId, {
        body,
        meta,
        run: async (signal) => {
          await flush()
          const res = await post(`/api/labs/${labId}/ai/paper-structure`, body, { signal })
          if (res?.lab) replaceLab(res.lab)
          return res
        },
      })
        .then(() => {
          justFinished.current = true
          toast.success(t('paper.done'))
        })
        .catch(() => {
          /* kept as the lab's last failure (shown with "Try again") */
        })
    },
    [ai, lab, flush, replaceLab, toast, t],
  )

  if (!lab) return null
  const workspaceKey = `${lab.analysis?.created_at || 'paper'}`
  return (
    <div className="container page au-page paper-step">
      <StepHeader
        step="paper"
        title={t('paper.title')}
        description={t('paper.intro')}
        actions={
          paper && !job ? (
            <>
              <Button icon={RefreshCw} onClick={() => setRerunOpen(true)}>
                {t('paper.rerun')}
              </Button>
              <LinkButton to={`/app/labs/${lab.id}/build`}>{t('paper.toBuild')}</LinkButton>
            </>
          ) : null
        }
      />
      {job ? (
        <ProgressPanel job={job} lab={lab} onCancel={() => cancelPaperJob(lab.id)} />
      ) : paper ? (
        <Workspace
          key={workspaceKey}
          lab={lab}
          paper={paper}
          ai={ai}
          failure={failure}
          onRun={runStructure}
          onDismissFailure={() => clearPaperFailure(lab.id)}
          focusOnMount={justFinished}
          openRerun={() => setRerunOpen(true)}
        />
      ) : (
        <SetupView lab={lab} ai={ai} failure={failure} onRun={runStructure} />
      )}
      {paper ? (
        <RerunDialog
          open={rerunOpen && !job}
          onClose={() => setRerunOpen(false)}
          lab={lab}
          ai={ai}
          onRun={(body) => {
            setRerunOpen(false)
            runStructure(body)
          }}
        />
      ) : null}
    </div>
  )
}
