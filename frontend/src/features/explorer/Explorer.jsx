import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bot, BookOpen, Check, ChevronDown, CircleHelp, Eye, MessageCircle, MessageSquareHeart, Presentation, QrCode, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { Badge, Button, Dialog, EmptyState, IconButton, LoadingBlock, ProgressBar, ProvenanceBadge, RichText, Segmented, Switch, Tabs } from '../../components/ui/index.js'
import { BlockEnvProvider, makeAiPath } from '../blocks/BlockEnv.jsx'
import { BlockRenderer } from '../blocks/BlockRenderer.jsx'
import SourceViewer from '../sources/SourceViewer.jsx'
import TutorPanel from '../tutor/TutorPanel.jsx'
import { chatPath, contextKey, suggestionKeys } from '../tutor/chatUtils.js'
import ClassCodeDialog from './ClassCodeDialog.jsx'
import FeedbackDialog from './FeedbackDialog.jsx'
import GlossaryPanel from './GlossaryPanel.jsx'
import SourcesPanel from './SourcesPanel.jsx'
import { feedbackSent, learnerOptions, loadPref, loadProgress, savePref, saveProgress, useMediaQuery } from './explorerUtils.js'
import './explorer.css'
import LessonDeck from './LessonDeck.jsx'

const PROVENANCES = ['document', 'user', 'assumption', 'unknown']
const cssEscape = (value) => (typeof window !== 'undefined' && window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/["\\]/g, '\\$&'))
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * A part whose code is still downloading is short at first, so the browser cannot scroll it to the
 * top of the screen yet (the page ends below it). Keep it there while it grows, for a moment,
 * unless the learner scrolls or types meanwhile. Returns a cleanup function.
 */
function keepAtTopWhileLoading(target, ms = 2500) {
  if (typeof ResizeObserver === 'undefined') return undefined
  let moved = false
  let first = true
  const stop = () => {
    moved = true
  }
  const ro = new ResizeObserver(() => {
    if (first) {
      first = false // the initial notification: the smooth scroll just started
      return
    }
    if (!moved) target.scrollIntoView({ block: 'start', behavior: 'auto' })
  })
  ro.observe(target)
  const events = ['wheel', 'touchmove', 'keydown', 'pointerdown']
  events.forEach((name) => window.addEventListener(name, stop, { passive: true }))
  const done = () => {
    ro.disconnect()
    events.forEach((name) => window.removeEventListener(name, stop))
  }
  const timer = window.setTimeout(done, ms)
  return () => {
    window.clearTimeout(timer)
    done()
  }
}

function ProvenanceLegend() {
  const { t } = useT()
  return (
    <div className="xp-legend" id="xp-legend">
      <p className="xp-legend-lead">{t('explorer.legendLead')}</p>
      <ul className="list-reset xp-legend-list">
        {PROVENANCES.map((kind) => (
          <li key={kind}>
            <ProvenanceBadge value={kind} />
            <span>{t(`common.provenance.${kind}Hint`)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Learner experience for one lab (spec §3 Bước 6, §10, §11).
 *   <Explorer lab={{ id?, share_code?, title, subject, grade, language, level, space, spec, sources,
 *                    assets, allow_tutor, owner?, published_at? }} mode="shared" | "preview" />
 * Optional `headerActions` (node) is shown with the cover's actions (e.g. "save a copy").
 */
export default function Explorer({ lab, mode = 'shared', headerActions = null, introNotice = null }) {
  const { t, fmt, lang, bilingual, setBilingual } = useT()
  const auth = useAuth()
  const shared = mode === 'shared'
  // The preview intentionally mirrors the student view; teachers opening a shared lesson
  // retain the classroom controls they use for presenting and managing it.
  const learnerView = mode === 'preview' || !auth.user || auth.user.role === 'student'
  const [presentation, setPresentation] = useState(true)
  const spec = lab?.spec || {}
  const blocks = useMemo(() => (spec.blocks || []).filter((b) => b && b.id), [spec.blocks])
  const glossary = useMemo(() => (spec.glossary || []).filter((g) => g && (g.vi || g.en)), [spec.glossary])
  const objectives = useMemo(() => (spec.objectives || []).filter((o) => String(o || '').trim()), [spec.objectives])
  const assumptions = useMemo(() => (spec.assumptions || []).filter((a) => a && String(a.text || '').trim()), [spec.assumptions])
  const sources = useMemo(() => (lab?.sources || []).filter((s) => !s.status || s.status === 'ready'), [lab?.sources])
  const sourceTitles = useMemo(() => Object.fromEntries(sources.map((s) => [s.id, s.title])), [sources])
  const assets = useMemo(() => lab?.assets || [], [lab?.assets])
  const storeKey = shared ? lab?.share_code : null
  const smallScreen = useMediaQuery('(max-width: 1200px)')
  const narrow = smallScreen || learnerView || presentation
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

  // ------------------------------------------------------------------ learner view state
  const initial = useMemo(() => loadProgress(storeKey), [storeKey])
  const [index, setIndex] = useState(() => Math.min(initial.index, Math.max(0, blocks.length - 1)))
  const [visited, setVisited] = useState(() => new Set(initial.visited))
  const [view, setView] = useState(() => (loadPref('view', 'single') === 'all' ? 'all' : 'single'))
  const [level, setLevel] = useState(lab?.level === 'detailed' ? 'detailed' : 'simple')
  const [activeMode, setActiveMode] = useState(() => blocks.some((b) => b.active && b.active.enabled !== false))
  const [projector, setProjector] = useState(false)
  const [visibleId, setVisibleId] = useState(null)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [codeOpen, setCodeOpen] = useState(false)
  // side panel (tutor + sources)
  const [panelOpen, setPanelOpen] = useState(false)
  const [tab, setTab] = useState(() => learnerView && !auth.ai?.configured ? 'sources' : 'ask')
  const [sourceRef, setSourceRef] = useState(null)
  const [sourceOrigin, setSourceOrigin] = useState('list')
  const [enlarged, setEnlarged] = useState(false)
  const [askContext, setAskContext] = useState(null)
  const [dismissedKey, setDismissedKey] = useState('')
  const [prefill, setPrefill] = useState(null)
  const [focusSignal, setFocusSignal] = useState(0)
  const reportedRef = useRef({})
  const askSeq = useRef(0)
  const partRef = useRef(null)
  const panelRef = useRef(null)
  const fabRef = useRef(null)
  const stageRef = useRef(null)
  const navRequest = useRef(false)
  // bumps on every outline/prev/next request, so choosing the part already open still scrolls to it
  const [navTick, setNavTick] = useState(0)
  const narrowRef = useRef(narrow)
  narrowRef.current = narrow
  const blocksRef = useRef(blocks)
  blocksRef.current = blocks

  const total = blocks.length
  const safeIndex = Math.min(index, Math.max(0, total - 1))
  const current = blocks[safeIndex] || null
  const currentId = presentation || view === 'single' ? current?.id : visibleId || blocks[0]?.id
  const blockTitle = useCallback((block) => (block ? block.title || t(`blocks.types.${block.type}`) : ''), [t])
  const titleOf = useCallback(
    (blockId) => {
      const block = blocksRef.current.find((b) => b.id === blockId)
      return block ? block.title || t(`blocks.types.${block.type}`) : ''
    },
    [t],
  )

  // Remember progress on this device (shared labs only).
  useEffect(() => {
    saveProgress(storeKey, { visited, index: safeIndex })
  }, [storeKey, visited, safeIndex])

  // Single view: the open part counts as visited.
  useEffect(() => {
    if (view !== 'single' || !current) return
    setVisited((set) => (set.has(current.id) ? set : new Set(set).add(current.id)))
  }, [view, current])

  // All-parts view: parts become visited when they are on screen.
  useEffect(() => {
    if (view !== 'all' || typeof IntersectionObserver === 'undefined') return undefined
    const root = stageRef.current
    if (!root) return undefined
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const id = entry.target.getAttribute('data-part-id')
          if (!id) return
          setVisibleId(id)
          setVisited((set) => (set.has(id) ? set : new Set(set).add(id)))
        })
      },
      { rootMargin: '-25% 0px -45% 0px', threshold: 0 },
    )
    root.querySelectorAll('[data-part-id]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [view, blocks])

  // After prev/next/outline navigation: bring the part into view and move focus to it.
  useEffect(() => {
    if (!navRequest.current) return undefined
    navRequest.current = false
    const target = view === 'single' ? partRef.current : stageRef.current?.querySelector(`[data-part-id="${cssEscape(current?.id || '')}"]`)
    if (!target) return undefined
    target.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' })
    target.focus({ preventScroll: true })
    return keepAtTopWhileLoading(target)
  }, [safeIndex, view, current, reducedMotion, navTick])

  const goTo = useCallback(
    (i) => {
      const next = Math.max(0, Math.min(blocksRef.current.length - 1, i))
      navRequest.current = true
      setIndex(next)
      setNavTick((n) => n + 1)
      setOutlineOpen(false)
      if (view === 'all') {
        const id = blocksRef.current[next]?.id
        const el = id ? stageRef.current?.querySelector(`[data-part-id="${cssEscape(id)}"]`) : null
        if (el) {
          el.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' })
          el.focus({ preventScroll: true })
        }
        navRequest.current = false
      }
    },
    [view, reducedMotion],
  )

  const changeView = (next) => {
    if (next === view) return
    setView(next)
    savePref('view', next)
    if (next === 'single' && visibleId) {
      const i = blocks.findIndex((b) => b.id === visibleId)
      if (i >= 0) setIndex(i)
    }
    if (next === 'all') setVisibleId(current?.id || null)
    navRequest.current = true
  }

  // ------------------------------------------------------------------ projector mode
  useEffect(() => {
    const root = document.documentElement
    if (projector) root.classList.add('cl-projector')
    else root.classList.remove('cl-projector')
    return () => root.classList.remove('cl-projector')
  }, [projector])

  // ------------------------------------------------------------------ side panel
  const openPanel = useCallback((nextTab) => {
    if (nextTab) setTab(nextTab)
    if (narrowRef.current) setPanelOpen(true)
  }, [])
  const closePanel = useCallback(() => {
    setPanelOpen(false)
    window.requestAnimationFrame(() => fabRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!narrow) setPanelOpen(false)
  }, [narrow])

  // Overlay behaviour on small screens: focus inside, Escape closes, Tab stays inside, page does not scroll.
  useEffect(() => {
    if (!narrow || !panelOpen) return undefined
    const panel = panelRef.current
    const raf = window.requestAnimationFrame(() => {
      const target = panel?.querySelector('[role="tab"][aria-selected="true"]') || panel?.querySelector(FOCUSABLE)
      target?.focus({ preventScroll: true })
    })
    const onKey = (event) => {
      if (event.key === 'Escape') {
        if (document.querySelector('.dialog-backdrop')) return
        event.stopPropagation()
        closePanel()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [narrow, panelOpen, closePanel])

  // ------------------------------------------------------------------ environment for blocks
  const sourceById = useMemo(() => {
    const map = new Map(sources.map((s) => [s.id, s]))
    return (id) => map.get(id) || null
  }, [sources])
  const assetById = useMemo(() => {
    const map = new Map(assets.map((a) => [a.id, a]))
    return (id) => map.get(id) || null
  }, [assets])

  const openSource = useCallback(
    (ref, origin = 'block') => {
      if (!ref) return
      setSourceRef(ref)
      setSourceOrigin(origin)
      openPanel('sources')
    },
    [openPanel],
  )

  const ask = useCallback(
    (context = {}) => {
      askSeq.current += 1
      const nonce = `ask:${askSeq.current}`
      const blockId = context.block_id || null
      setAskContext({ ...context, block_id: blockId, nonce, title: titleOf(blockId) })
      setDismissedKey('')
      if (context.prompt) setPrefill({ text: String(context.prompt).slice(0, 2000), nonce })
      openPanel('ask')
      setFocusSignal((n) => n + 1)
    },
    [openPanel, titleOf],
  )

  const reportState = useCallback((blockId, state) => {
    if (blockId) reportedRef.current[blockId] = state
  }, [])
  const getReportedStates = useCallback(() => reportedRef.current, [])

  const aiConfigured = Boolean(auth.ai?.configured)
  const tutorAllowed = mode === 'preview' || Boolean(lab?.allow_tutor)
  const aiAvailable = aiConfigured && tutorAllowed
  const labId = shared ? null : lab?.id || null
  const shareCode = shared ? lab?.share_code || null : null

  const env = useMemo(
    () => ({
      mode: 'view',
      labId,
      shareCode,
      sourcesAtTop: true,
      presentation: presentation ? 'slides' : 'reading',
      visualContext: blocks.find((block) => block.visual3d) || null,
      language: lab?.translated_language || lab?.language || 'vi',
      translatedLanguage: lab?.translated_language || null,
      level,
      subject: lab?.subject || 'other',
      grade: lab?.grade || '10',
      space: lab?.space || 'school2lab',
      sources,
      assets,
      sourceById,
      assetById,
      aiPath: makeAiPath({ labId, shareCode, translatedLanguage: lab?.translated_language }),
      aiAvailable,
      openSource,
      ask,
      reportState,
      glossary,
      assumptions,
      activeMode,
    }),
    [labId, shareCode, lab?.language, lab?.translated_language, lab?.subject, lab?.grade, lab?.space, level, sources, assets, sourceById, assetById, aiAvailable, openSource, ask, reportState, glossary, assumptions, activeMode, blocks, presentation],
  )

  // ------------------------------------------------------------------ tutor context chip
  useEffect(() => {
    // A question started from another part no longer matches what the learner is looking at.
    setAskContext((ctx) => (ctx && ctx.block_id && currentId && ctx.block_id !== currentId ? null : ctx))
  }, [currentId])

  const autoContext = useMemo(() => (currentId ? { block_id: currentId, nonce: `auto:${currentId}`, title: titleOf(currentId) } : null), [currentId, titleOf])
  const chipContext = [askContext, autoContext].find((ctx) => ctx && contextKey(ctx) !== dismissedKey) || null
  const keywords = useMemo(() => glossary.flatMap((g) => [g.vi, g.en]).filter(Boolean).slice(0, 40), [glossary])
  // suggested questions that fit the part being asked about (no "graph" question under a video)
  const suggestBlockType = blocks.find((b) => b.id === (chipContext?.block_id || currentId))?.type
  const suggestions = useMemo(() => suggestionKeys({ blockType: suggestBlockType, space: lab?.space }), [suggestBlockType, lab?.space])

  // ------------------------------------------------------------------ render helpers
  const doneCount = blocks.filter((b) => visited.has(b.id)).length
  const isLast = safeIndex === total - 1
  const ownerName = lab?.owner?.name
  const sentBefore = useMemo(() => feedbackSent(shareCode), [shareCode, feedbackOpen]) // eslint-disable-line react-hooks/exhaustive-deps
  const effectiveLanguage = lab?.translated_language || lab?.language
  const contentLang = effectiveLanguage && effectiveLanguage !== lang ? effectiveLanguage : undefined
  const TitleTag = shared ? 'h1' : 'h2'
  const AssumptionsTag = learnerView ? 'details' : 'section'
  // what the lab is about, said as a byline under the title (never as tags above it)
  const subjectLabel = lab?.subject ? t(`common.subjects.${lab.subject}`) : null
  const gradeLabel = lab?.grade ? t(`common.grades.${lab.grade}`) : null
  const spaceFact = lab?.space ? t(`common.spaces.${lab.space}`) : null
  const ownerFact = shared && ownerName
    ? lab?.published_at
      ? t('explorer.ownerLine', { owner: ownerName, date: fmt.date(lab.published_at) })
      : t('explorer.ownerLineNoDate', { owner: ownerName })
    : null
  const facts = [[subjectLabel, gradeLabel].filter(Boolean).join(', '), spaceFact, ownerFact].filter(Boolean)

  const outline = (
    <nav className="explorer-nav xp-nav" aria-label={t('explorer.outlineTitle')}>
      <button type="button" className="xp-outline-toggle" aria-expanded={outlineOpen} aria-controls="xp-outline-body" onClick={() => setOutlineOpen((v) => !v)}>
        <span className="xp-outline-toggle-text">
          <span className="xp-outline-toggle-title">{t('explorer.outlineTitle')}</span>
          <span className="xp-outline-toggle-meta">{total ? t('explorer.partOf', { current: safeIndex + 1, total }) : t('explorer.noParts')}</span>
        </span>
        <span className="xp-mini-progress" aria-hidden="true">
          <span style={{ inlineSize: `${total ? Math.round((doneCount / total) * 100) : 0}%` }} />
        </span>
        <ChevronDown size={20} aria-hidden="true" className={['xp-chevron', outlineOpen && 'is-open'].filter(Boolean).join(' ')} />
      </button>
      <div id="xp-outline-body" className={['xp-outline-body', !outlineOpen && 'is-collapsed'].filter(Boolean).join(' ')}>
        <h2 className="xp-nav-title">{t('explorer.outlineTitle')}</h2>
        {total ? <ProgressBar value={doneCount / total} label={t('explorer.progress', { done: doneCount, total })} /> : null}
        <ol className="list-reset xp-outline">
          {blocks.map((block, i) => {
            const seen = visited.has(block.id)
            const here = view === 'single' ? i === safeIndex : block.id === currentId
            return (
              <li key={block.id}>
                <button type="button" className={['xp-outline-item', seen && 'is-visited'].filter(Boolean).join(' ')} aria-current={here ? 'step' : undefined} onClick={() => goTo(i)}>
                  <span className="xp-num" aria-hidden="true">
                    {seen && !here ? <Check size={16} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="xp-outline-text">
                    <span className="xp-outline-title" lang={contentLang}>
                      {blockTitle(block)}
                    </span>
                    {block.title ? <span className="xp-outline-type">{t(`blocks.types.${block.type}`)}</span> : null}
                  </span>
                  <span className="visually-hidden">
                    {t('explorer.partOf', { current: i + 1, total })}
                    {seen ? `, ${t('explorer.visited')}` : ''}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
        {objectives.length ? (
          <section className="xp-objectives" aria-labelledby="xp-objectives-title">
            <h2 id="xp-objectives-title" className="xp-nav-title">
              {t('explorer.objectivesTitle')}
            </h2>
            <p className="xp-objectives-lead">{t('explorer.objectivesLead')}</p>
            <ul className="xp-objective-list" lang={contentLang}>
              {objectives.map((objective, i) => (
                <li key={i}>
                  <RichText text={objective} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </nav>
  )

  const previewBadge = mode === 'preview' ? (
    <Badge tone="warning" icon={Eye}>
      {t('explorer.previewBadge')}
    </Badge>
  ) : null
  // the learner's place, said once in the byline (never as a label above the title)
  const learnerItem = learnerView ? (
    <span className="xp-byline-item xp-byline-learner">
      <BookOpen size={16} aria-hidden="true" />
      {t('student.lesson')}
    </span>
  ) : null
  const sourcesBand = sources.length ? (
    <section className="xp-lesson-sources" aria-label={t('explorer.tabSources')}>
      <h2>{t('explorer.tabSources')}</h2>
      <ol className="list-reset">
        {sources.map((source, i) => (
          <li key={source.id}>
            <button type="button" onClick={() => openSource({ source_id: source.id }, 'list')} title={source.title}>
              <span className="xp-source-index">{i + 1}</span>
              <span className="xp-source-name">{source.title}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  ) : null
  const coverActions = (
    <div className="xp-cover-actions">
      {shared && shareCode ? (
        <button type="button" className="btn btn-sm xp-code-btn" onClick={() => setCodeOpen(true)} aria-haspopup="dialog">
          <QrCode aria-hidden="true" />
          {t('explorer.classCode.chip', { code: shareCode })}
        </button>
      ) : null}
      {/* the slides are already the classroom view: the projector switch belongs to the reading view */}
      {presentation ? null : (
        <button type="button" className="btn btn-sm xp-projector-btn" aria-pressed={projector} onClick={() => setProjector((v) => !v)} title={t('explorer.projectorHint')}>
          <Presentation aria-hidden="true" />
          {projector ? t('explorer.projectorExit') : t('explorer.projector')}
        </button>
      )}
      {shared && shareCode ? (
        <Button size="sm" icon={MessageSquareHeart} onClick={() => setFeedbackOpen(true)}>
          {t('explorer.feedback.button')}
        </Button>
      ) : null}
      <button
        type="button"
        className="btn btn-ghost btn-sm xp-legend-toggle"
        aria-expanded={presentation ? undefined : legendOpen}
        aria-controls={presentation ? undefined : 'xp-legend'}
        aria-haspopup={presentation ? 'dialog' : undefined}
        onClick={() => setLegendOpen((v) => !v)}
      >
        <CircleHelp aria-hidden="true" />
        {t('common.provenance.legend')}
      </button>
      {headerActions ? <div className="xp-cover-extra">{headerActions}</div> : null}
    </div>
  )

  const header = (
    <header className="xp-cover">
      <div className="xp-cover-head">
        <TitleTag className="xp-title" lang={contentLang}>
          {lab?.title}
        </TitleTag>
        {presentation ? (
          // the title page: subject and grade as two chips, then a quiet line of facts
          <div className="xp-byline">
            {previewBadge || subjectLabel || gradeLabel ? (
              <p className="xp-chips">
                {previewBadge}
                {subjectLabel ? <span className="xp-chip">{subjectLabel}</span> : null}
                {gradeLabel ? <span className="xp-chip">{gradeLabel}</span> : null}
              </p>
            ) : null}
            {learnerItem || spaceFact ? (
              <p className="xp-byline-row">
                {learnerItem}
                {spaceFact ? <span className="xp-byline-item">{spaceFact}</span> : null}
              </p>
            ) : null}
          </div>
        ) : facts.length || previewBadge || learnerItem ? (
          <div className="xp-byline">
            <p className="xp-byline-row">
              {previewBadge ? <span className="xp-byline-item">{previewBadge}</span> : null}
              {learnerItem}
              {facts.map((fact) => (
                <span key={fact} className="xp-byline-item">
                  {fact}
                </span>
              ))}
            </p>
          </div>
        ) : null}
      </div>
      {presentation ? null : introNotice}
      {spec.summary ? (
        <div className="xp-summary-wrap" lang={contentLang}>
          <RichText text={spec.summary} className="xp-summary" />
        </div>
      ) : null}
      {presentation ? null : sourcesBand}
      {assumptions.length && !presentation ? (
        <AssumptionsTag className="xp-assumptions" aria-labelledby="xp-assumptions-title">
          {learnerView ? <summary id="xp-assumptions-title" className="xp-section-title">{t('explorer.assumptionsTitle')}</summary> : <h2 id="xp-assumptions-title" className="xp-section-title">{t('explorer.assumptionsTitle')}</h2>}
          <ul className="xp-assumption-list">
            {assumptions.map((a) => (
              <li key={a.id || a.text} lang={contentLang}>
                {a.text}
              </li>
            ))}
          </ul>
          <p className="xp-assumptions-hint">{t('explorer.assumptionsHint')}</p>
        </AssumptionsTag>
      ) : null}
      {presentation ? null : coverActions}
      {legendOpen && !presentation ? <ProvenanceLegend /> : null}
    </header>
  )
  // The deck's title page keeps its words to the title, the summary and Start: the sources, who
  // shared the lesson and the language or Lite notes sit under its picture, the actions at its foot.
  const coverAside = sourcesBand || ownerFact || introNotice ? (
    <>
      {sourcesBand}
      {ownerFact || introNotice ? (
        <div className="xp-colophon">
          {ownerFact ? <p className="xp-colophon-owner">{ownerFact}</p> : null}
          {introNotice}
        </div>
      ) : null}
    </>
  ) : null

  // lesson-wide options that change something in this lab (no dead switches)
  const learnerOpts = learnerOptions(blocks)
  const levelOptions = [
    { value: 'simple', label: t('common.levels.simple') },
    { value: 'detailed', label: t('common.levels.detailed') },
  ]

  const viewSwitch = total ? (
    <Segmented
      value={view}
      onChange={changeView}
      label={t('explorer.viewLabel')}
      size="sm"
      options={[
        { value: 'single', label: t('explorer.viewSingle') },
        { value: 'all', label: t('explorer.viewAll') },
      ]}
    />
  ) : null

  const toolbar = (
    <div className="xp-toolbar-wrap">
      <button type="button" className="btn btn-sm xp-options-toggle" aria-expanded={optionsOpen} aria-controls="xp-options" onClick={() => setOptionsOpen((v) => !v)}>
        <SlidersHorizontal aria-hidden="true" />
        {t('explorer.options')}
        <ChevronDown aria-hidden="true" className={['xp-chevron', optionsOpen && 'is-open'].filter(Boolean).join(' ')} />
      </button>
      <div id="xp-options" className={['xp-toolbar', !optionsOpen && 'is-collapsed'].filter(Boolean).join(' ')} role="group" aria-label={t('explorer.toolbarLabel')}>
        {viewSwitch ? <div className="xp-tool">{viewSwitch}</div> : null}
        {learnerOpts.level ? (
          <div className="xp-tool">
            <span className="xp-tool-label" aria-hidden="true">
              {t('explorer.level')}
            </span>
            <Segmented value={level} onChange={setLevel} options={levelOptions} label={t('explorer.level')} size="sm" />
          </div>
        ) : null}
        {learnerOpts.active ? (
          <div className="xp-tool" title={t('explorer.activeModeHint')}>
            <Switch label={t('explorer.activeMode')} checked={activeMode} onChange={(e) => setActiveMode(e.target.checked)} />
          </div>
        ) : null}
        {glossary.length ? (
          <div className="xp-tool" title={t('common.language.bilingualHint')}>
            <Switch label={t('common.language.bilingual')} checked={bilingual} onChange={(e) => setBilingual(e.target.checked)} />
          </div>
        ) : null}
      </div>
      {activeMode && learnerOpts.active ? <p className="xp-active-note">{t('explorer.activeModeHint')}</p> : null}
    </div>
  )

  const finishCard = (
    <section className="xp-finish" aria-labelledby="xp-finish-title">
      <h2 id="xp-finish-title" className="xp-finish-title">
        {t('explorer.finishTitle')}
      </h2>
      <p className="xp-finish-body">{t('explorer.finishBody')}</p>
      <div className="xp-finish-actions">
        {shared && shareCode ? (
          <Button size="sm" icon={MessageSquareHeart} onClick={() => setFeedbackOpen(true)}>
            {t('explorer.feedback.button')}
          </Button>
        ) : null}
        {aiAvailable ? (
          <Button size="sm" icon={MessageCircle} onClick={() => ask({})}>
            {t('explorer.askTutor')}
          </Button>
        ) : null}
        {view === 'single' && total > 1 ? (
          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => goTo(0)}>
            {t('explorer.restart')}
          </Button>
        ) : null}
      </div>
    </section>
  )

  // The deck's end slide takes the same actions as the finish card; its bar's help asks about the part on screen.
  const deckFinish = useMemo(
    () => ({ onAsk: aiAvailable ? () => ask({}) : null, onFeedback: shared && shareCode ? () => setFeedbackOpen(true) : null }),
    [aiAvailable, ask, shared, shareCode],
  )
  const deckHelp = useCallback(
    (blockId) => {
      if (aiAvailable) ask(blockId ? { block_id: blockId } : {})
      else setPanelOpen(true)
    },
    [aiAvailable, ask],
  )

  let stage
  if (!total) {
    stage = (
      <div className="card xp-empty">
        <EmptyState icon={BookOpen} title={t('explorer.emptyTitle')}>
          <p>{mode === 'preview' ? t('explorer.emptyPreviewBody') : t('explorer.emptyBody')}</p>
        </EmptyState>
      </div>
    )
  } else if (view === 'single') {
    const prev = blocks[safeIndex - 1]
    const next = blocks[safeIndex + 1]
    stage = (
      <div className="xp-stage" ref={stageRef}>
        <div ref={partRef} className="xp-part" id={`part-${current.id}`} data-part-id={current.id} tabIndex={-1} aria-label={t('explorer.partOf', { current: safeIndex + 1, total })}>
          <BlockRenderer key={current.id} block={current} mode="view" />
        </div>
        <nav className="xp-pager" aria-label={t('explorer.pagerLabel')}>
          <button type="button" className="btn xp-pager-btn xp-pager-prev" onClick={() => goTo(safeIndex - 1)} disabled={!prev}>
            <span className="xp-pager-text">
              <span className="xp-pager-dir">{t('explorer.prev')}</span>
              {prev ? <span className="xp-pager-title">{blockTitle(prev)}</span> : null}
            </span>
          </button>
          <button type="button" className="btn xp-pager-btn xp-pager-next" onClick={() => goTo(safeIndex + 1)} disabled={!next}>
            <span className="xp-pager-text">
              <span className="xp-pager-dir">{t('explorer.next')}</span>
              {next ? <span className="xp-pager-title">{blockTitle(next)}</span> : null}
            </span>
          </button>
        </nav>
        {isLast ? finishCard : null}
      </div>
    )
  } else {
    stage = (
      <div className="xp-stage xp-stage-all" ref={stageRef}>
        {blocks.map((block, i) => (
          <div key={block.id} className="xp-part xp-part-flow" id={`part-${block.id}`} data-part-id={block.id} tabIndex={-1} aria-label={t('explorer.partOf', { current: i + 1, total })}>
            <BlockRenderer block={block} mode="view" />
          </div>
        ))}
        {finishCard}
      </div>
    )
  }

  const sideTabs = [
    { id: 'ask', label: t('explorer.tabAsk'), icon: Bot },
    { id: 'sources', label: t('explorer.tabSources'), icon: BookOpen, badge: sources.length || undefined },
  ]

  const side = (
    <aside
      ref={panelRef}
      className={['explorer-side', 'xp-side', panelOpen && 'open'].filter(Boolean).join(' ')}
      aria-label={t('explorer.panelLabel')}
      role={narrow && panelOpen ? 'dialog' : undefined}
      aria-modal={narrow && panelOpen ? 'true' : undefined}
    >
      <div className="xp-side-head">
        <Tabs tabs={sideTabs} value={tab} onChange={setTab} label={t('explorer.panelLabel')} idPrefix="xp-side" />
        <IconButton icon={X} size="sm" label={t('explorer.closePanel')} onClick={closePanel} className="xp-side-close" />
      </div>
      <div role="tabpanel" id="xp-side-panel-ask" aria-labelledby="xp-side-tab-ask" hidden={tab !== 'ask'} className="xp-side-body xp-side-ask">
        {auth.ready ? (
          <TutorPanel
            endpoint={chatPath({ labId, shareCode })}
            available={aiAvailable}
            unavailableReason={!aiConfigured ? 'not_configured' : !tutorAllowed ? 'disabled' : null}
            context={chipContext}
            onDismissContext={() => setDismissedKey(contextKey(chipContext))}
            prefill={prefill}
            focusSignal={focusSignal}
            getReportedStates={getReportedStates}
            openSource={(ref) => openSource(ref, 'tutor')}
            keywords={keywords}
            sourceTitles={sourceTitles}
            suggestions={suggestions}
          />
        ) : (
          <div className="xp-side-loading">
            <LoadingBlock lines={3} />
          </div>
        )}
      </div>
      <div role="tabpanel" id="xp-side-panel-sources" aria-labelledby="xp-side-tab-sources" hidden={tab !== 'sources'} className="xp-side-body xp-side-sources" tabIndex={0}>
        <SourcesPanel
          sources={sources}
          sourceById={sourceById}
          activeRef={sourceRef}
          origin={sourceOrigin}
          onOpen={(ref) => openSource(ref, 'list')}
          onBack={() => setSourceRef(null)}
          onBackToTutor={() => setTab('ask')}
          onEnlarge={() => setEnlarged(true)}
        />
      </div>
    </aside>
  )

  return (
    <BlockEnvProvider value={env}>
      <div className={['explorer', 'xp', learnerView && 'xp-learner', presentation && 'xp-slide-view', projector && 'projector', `xp-level-${level}`].filter(Boolean).join(' ')}>
        {presentation ? <LessonDeck lab={lab} blocks={blocks} intro={header} introAside={coverAside} introFoot={coverActions} objectives={objectives} assumptions={assumptions}
          onReading={() => setPresentation(false)} onHelp={deckHelp} helpRef={fabRef} finish={deckFinish}
          onBlockChange={(blockId) => {
            const next = blocks.findIndex((block) => block.id === blockId)
            if (next >= 0) {
              setIndex(next)
              setVisited((prev) => prev.has(blockId) ? prev : new Set(prev).add(blockId))
            }
          }} /> : <>
        {outline}
        <div className="explorer-main xp-main">
          <div className="xp-column">
            <Button icon={Presentation} onClick={() => setPresentation(true)} className="xp-slides-btn">{t('explorer.deck.slides')}</Button>
            {header}
            {toolbar}
            {bilingual && glossary.length ? <GlossaryPanel glossary={glossary} /> : null}
            {stage}
          </div>
        </div>
        </>}
        {side}
        {narrow && !panelOpen && !presentation ? (
          <button ref={fabRef} type="button" className="xp-fab" onClick={() => setPanelOpen(true)} aria-haspopup="dialog" aria-label={t(learnerView ? 'student.resources' : 'explorer.openPanel')} title={t(learnerView ? 'student.resources' : 'explorer.openPanel')}>
            <Bot aria-hidden="true" />
            <span>{t(learnerView ? 'student.resources' : 'explorer.openPanel')}</span>
          </button>
        ) : null}
        {narrow && panelOpen ? <div className="xp-backdrop" aria-hidden="true" onClick={closePanel} /> : null}
      </div>

      <Dialog open={enlarged && Boolean(sourceRef)} onClose={() => setEnlarged(false)} title={sourceById(sourceRef?.source_id)?.title || t('explorer.tabSources')} size="full">
        {sourceRef ? <SourceViewer source={sourceById(sourceRef.source_id)} sourceRef={sourceRef} /> : null}
      </Dialog>
      {/* on the cover slide the legend opens over the deck instead of pushing the cover down */}
      <Dialog open={presentation && legendOpen} onClose={() => setLegendOpen(false)} title={t('common.provenance.legend')}>
        <ProvenanceLegend />
      </Dialog>
      {shared && shareCode ? (
        <>
          <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} code={shareCode} sentBefore={sentBefore} />
          <ClassCodeDialog open={codeOpen} onClose={() => setCodeOpen(false)} code={shareCode} />
        </>
      ) : null}
    </BlockEnvProvider>
  )
}
