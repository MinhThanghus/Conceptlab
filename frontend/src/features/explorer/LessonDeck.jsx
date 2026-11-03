import { lazy, Suspense, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, Expand, List, MessageCircle, MessageCircleQuestion, MessageSquareHeart, Minimize, RotateCcw } from 'lucide-react'
import { AIBadge, Button, Dialog, LoadingBlock, ProvenanceBadge, RichText } from '../../components/ui/index.js'
import { useT } from '../../i18n/index.jsx'
import { BlockRenderer } from '../blocks/BlockRenderer.jsx'
import { useBlockEnv } from '../blocks/BlockEnv.jsx'
import LabCover from '../labs/LabCover.jsx'
import { chunkItems, createLessonSlides, isContentText } from './lessonSlides.js'
import './lessonDeck.css'

const StepSlide = lazy(() => import('../blocks/steps/StepSlide.jsx'))
const FlowSlide = lazy(() => import('../blocks/flow/FlowSlide.jsx'))
const OrderActivity = lazy(() => import('../blocks/steps/StepsBlock.jsx').then((module) => ({ default: module.OrderActivity })))
const GuidedVisual = lazy(() => import('../visuals/GuidedVisual.jsx'))

const NONE = []
// Goals sit side by side as cards, assumptions as ruled rows: one sheet holds this much.
const GOAL_LIMITS = { max: 4, budget: 520 }
const ASSUMPTION_LIMITS = { max: 5, budget: 640 }
// One or two short assumptions ride on a goals sheet that holds every goal, as a quiet well under
// the cards, instead of a sheet of their own that would stand nearly empty.
const FOLD_ASSUMPTIONS = { max: 2, budget: 400 }
// Beyond this a row of beads stops being readable; the words alone say where the learner is.
const MAX_BEADS = 24
// A short text slide is set as one statement; anything longer is read as prose.
const SHORT_TEXT = 280
// The heading of a flow group lists its stages when they fit on a line or two.
const GROUP_TITLE_LIMIT = 60
// Cover title: one display line in the words column holds about 16 characters, two about 30.
// Longer titles start one step down; the cover then fits itself (COVER_FIT_STEPS).
const COVER_SHORT_TITLE = 16
const COVER_DISPLAY_TITLE = 30
const COVER_LONG_TITLE = 64
const SHORT_SUMMARY = 160
// 1: tighter spacing, 2: the title one step down the scale, 3: two steps down.
const COVER_FIT_STEPS = 3

/** Where the learner is inside one part: one bead per step or page. */
function Beads({ count, current, visited }) {
  if (count < 2 || count > MAX_BEADS) return null
  return (
    <span className="deck-beads" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={i === current ? 'is-current' : visited(i) ? 'is-visited' : undefined} />
      ))}
    </span>
  )
}

/**
 * A viewport-sized learner deck. Content is paged, never scaled down to fit: the sheet is a
 * size container and every slide takes its type scale from it (lessonDeck.css, the --deck-* sizes).
 * `intro` is the cover's title block; `introAside` (the lesson's sources and credits, under the
 * picture) and `introFoot` (class code, feedback, the legend) are optional parts of the cover.
 * `finish` carries the end slide's actions: { onAsk?, onFeedback? }.
 */
export default function LessonDeck({ lab, blocks, intro, introAside = null, introFoot = null, objectives = NONE, assumptions = NONE, onReading, onHelp, onBlockChange, helpRef, finish = null }) {
  const { t, lang } = useT()
  const env = useBlockEnv()
  const d = (key, vars) => t(`explorer.deck.${key}`, vars)
  const endTitleId = useId()
  const root = useRef(null)
  const pageRef = useRef(null)
  const currentRowRef = useRef(null)
  const [position, setPosition] = useState(0)
  const [contentsOpen, setContentsOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [opened, setOpened] = useState(() => new Set())
  const [availableHeight, setAvailableHeight] = useState(null)
  const [flowFocus, setFlowFocus] = useState(null)
  const lessonLanguage = lab?.translated_language || lab?.language
  const contentLang = lessonLanguage && lessonLanguage !== lang ? lessonLanguage : undefined

  const slides = useMemo(() => {
    const start = [{ id: '$intro', kind: 'intro' }]
    const goals = objectives.map((goal) => String(goal ?? ''))
    const notes = assumptions.map((item) => String(item?.text ?? ''))
    // Whole items only: a goal or an assumption is never cut across two sheets.
    const goalChunks = chunkItems(goals, GOAL_LIMITS)
    const fold = goalChunks.length === 1 && notes.length > 0 && notes.length <= FOLD_ASSUMPTIONS.max
      && notes.join('').length <= FOLD_ASSUMPTIONS.budget
    const lists = [['goals', goalChunks], ['assumptions', fold ? [] : chunkItems(notes, ASSUMPTION_LIMITS)]]
    for (const [kind, chunks] of lists) {
      let first = 0
      chunks.forEach((chunk, page) => {
        const extra = kind === 'goals' && fold ? { notes } : null
        start.push({ id: `$${kind}:${page}`, kind, items: chunk, first, page, pageCount: chunks.length, ...extra })
        first += chunk.length
      })
    }
    return [...start, ...createLessonSlides(blocks), { id: '$end', kind: 'end' }]
  }, [blocks, objectives, assumptions])
  const current = Math.min(position, slides.length - 1)
  const slide = slides[current]
  const last = slides.length - 1
  const blockById = useMemo(() => new Map(blocks.map((item) => [item.id, item])), [blocks])
  const block = blockById.get(slide?.blockId)
  const onBlockRef = useRef(onBlockChange)
  onBlockRef.current = onBlockChange

  const blockTitle = (source) => (source ? String(source.title || '').trim() || t(`blocks.types.${source.type || 'text'}`) : '')
  const stepTitle = (source, index) => String(source?.steps?.[index]?.title || '').trim()
  const groupLabels = (item, source) => (item.nodeIds || []).map((id) => source?.nodes?.find((node) => node.id === id)?.label).filter(Boolean).join(', ')
  const siblings = (item, kind) => slides.filter((other) => other.blockId === item.blockId && other.kind === kind)

  /** The row text in Mục lục; the steps keep "Bước n: …" so the order reads as the lesson. */
  const titleOf = (item) => {
    const source = blockById.get(item.blockId)
    const paged = (title) => (item.pageCount > 1 ? d('partPage', { title, n: item.page + 1, total: item.pageCount }) : title)
    switch (item.kind) {
      case 'intro': return d('intro')
      case 'goals': return paged(d('goals'))
      case 'assumptions': return paged(d('assumptions'))
      case 'end': return d('wrapUp')
      case 'step-practice': return d('order')
      case 'flow-overview': return d('overview')
      case 'flow-group': return groupLabels(item, source) || blockTitle(source)
      case 'flow-node': return source?.nodes?.[item.index]?.label || d('explanation')
      case 'flow-edge': return source?.edges?.[item.index]?.label || d('relation')
      case 'step':
      case 'step-question': {
        const title = stepTitle(source, item.index)
        if (!title && item.kind === 'step') return t('steps.view.untitled', { n: item.index + 1 })
        return d(item.kind === 'step' ? 'stepRow' : 'questionRow', { n: item.index + 1, title: title || t('steps.view.untitled', { n: item.index + 1 }) })
      }
      case 'text': return paged(blockTitle(source))
      default: return blockTitle(source) || d('activity')
    }
  }

  /**
   * The one heading of a slide (contract C2) and the byline under it; null for the cover and the end.
   * `lead` is lesson content (the part's description), `hint` is the interface speaking; `ai` adds
   * the AI label, since step, practice and flow slides never pass through BlockFrame.
   */
  const headingFor = (item) => {
    const source = blockById.get(item.blockId)
    const pages = item.pageCount > 1 ? { count: item.pageCount, index: item.page, label: d('pageOf', { n: item.page + 1, total: item.pageCount }), visited: (i) => opened.has(item.id.replace(/\d+$/, String(i))) } : null
    const ai = Boolean(source?.ai_generated)
    switch (item.kind) {
      case 'intro':
      case 'end': return null
      case 'goals': return { title: d('goals'), hint: t('explorer.objectivesLead'), beads: pages }
      case 'assumptions': return { title: d('assumptions'), hint: t('explorer.assumptionsHint'), beads: pages }
      case 'step':
      case 'step-question': {
        const total = source?.steps?.length || 0
        return {
          title: stepTitle(source, item.index) || t('steps.view.untitled', { n: item.index + 1 }),
          content: true,
          ai,
          // the part's first sheet opens with its description when that is content, not an instruction
          lead: item.kind === 'step' && item.index === 0 && isContentText(source?.description) ? source.description.trim() : null,
          beads: { count: total, index: item.index, label: d('stepOf', { n: item.index + 1, total }), visited: (i) => opened.has(`${item.blockId}:step:${i}`) },
        }
      }
      case 'step-practice': return { title: d('order'), ai }
      // A description that speaks of the reading view ("Bấm Chạy luồng") gives way to what works here.
      case 'flow-overview': return isContentText(source?.description)
        ? { title: blockTitle(source), content: true, ai, lead: source.description.trim() }
        : { title: blockTitle(source), content: true, ai, hint: t('flow.view.hintShort') }
      case 'flow-group': {
        const groups = siblings(item, 'flow-group')
        const index = groups.findIndex((other) => other.id === item.id)
        const labels = groupLabels(item, source)
        const title = groups.length > 1 && labels && labels.length <= GROUP_TITLE_LIMIT ? labels : blockTitle(source)
        const beads = groups.length > 1 ? { count: groups.length, index, label: d('pageOf', { n: index + 1, total: groups.length }), visited: (i) => opened.has(groups[i]?.id) } : null
        return { title, content: true, ai, beads }
      }
      case 'text': return { title: blockTitle(source), content: true, ai, lead: item.page ? null : source?.description, beads: pages }
      default: return { title: blockTitle(source), content: true, ai, lead: source?.description }
    }
  }
  const heading = headingFor(slide)
  // The part a step, flow or text slide belongs to rides in the bar, never above the heading, and
  // never twice: when the slide's own heading already is the part's title, the bar names the lesson only.
  const part = block && ['step', 'step-question', 'step-practice', 'flow-overview', 'flow-group', 'flow-node', 'flow-edge', 'text'].includes(slide.kind) ? blockTitle(block) : null
  const crumb = part && part.trim().toLocaleLowerCase() !== String(heading?.title || '').trim().toLocaleLowerCase() ? part : null

  // Mục lục: whole parts under their title, single sheets on their own row.
  const sections = useMemo(() => {
    const out = []
    slides.forEach((item, i) => {
      const previous = out[out.length - 1]
      if (item.blockId && previous?.blockId === item.blockId) previous.rows.push({ item, i })
      else out.push({ key: item.blockId ? `part:${item.blockId}:${i}` : item.id, blockId: item.blockId || null, rows: [{ item, i }] })
    })
    return out
  }, [slides])

  const go = (next) => {
    setPosition(Math.max(0, Math.min(slides.length - 1, next)))
    setContentsOpen(false)
    requestAnimationFrame(() => pageRef.current?.focus({ preventScroll: true }))
  }
  useEffect(() => {
    setOpened((prev) => (prev.has(slide.id) ? prev : new Set(prev).add(slide.id)))
    if (slide.blockId) onBlockRef.current?.(slide.blockId)
  }, [slide.id, slide.blockId])
  // Arrow keys work at once: the sheet holds the focus from the start.
  useEffect(() => {
    pageRef.current?.focus({ preventScroll: true })
  }, [])
  useEffect(() => {
    if (!contentsOpen) return undefined
    const raf = requestAnimationFrame(() => currentRowRef.current?.scrollIntoView?.({ block: 'center' }))
    return () => cancelAnimationFrame(raf)
  }, [contentsOpen])

  // The cover fits its words to the sheet instead of scrolling: tighter spacing first, then the
  // title one step down the deck scale, then two. Measured before paint; a resized sheet or late
  // fonts start again from the roomiest setting, and words that grow later (a part of the cover
  // that loads after the deck) are measured again from the current setting.
  const onCover = slide.kind === 'intro'
  const [coverFit, setCoverFit] = useState(0)
  // Bumped to measure again: React skips a render for an unchanged state, and late fonts or a
  // late part of the cover change no state of the deck at all.
  const [, setFitPass] = useState(0)
  useLayoutEffect(() => {
    if (!onCover || coverFit >= COVER_FIT_STEPS) return
    const text = pageRef.current?.querySelector('.deck-page:not([hidden]) .deck-cover-text')
    if (text && text.scrollHeight > text.clientHeight + 1) setCoverFit((fit) => Math.min(COVER_FIT_STEPS, fit + 1))
  })
  useEffect(() => {
    if (!onCover) return undefined
    const restart = () => {
      setCoverFit(0)
      setFitPass((pass) => pass + 1)
    }
    const canObserve = typeof ResizeObserver !== 'undefined'
    const observer = canObserve ? new ResizeObserver(restart) : null
    if (pageRef.current) observer?.observe(pageRef.current)
    // the words' own blocks: a fit step changes them too, but this only measures (never resets),
    // so it ends at the last step at the latest
    const content = canObserve ? new ResizeObserver(() => setFitPass((pass) => pass + 1)) : null
    const text = pageRef.current?.querySelector('.deck-page:not([hidden]) .deck-cover-text')
    for (const child of text?.children || []) content?.observe(child)
    let live = true
    document.fonts?.ready?.then(() => { if (live) restart() })
    // `ready` can settle before the face is even requested; a face that arrives later grows the words
    document.fonts?.addEventListener?.('loadingdone', restart)
    return () => {
      live = false
      observer?.disconnect()
      content?.disconnect()
      document.fonts?.removeEventListener?.('loadingdone', restart)
    }
  }, [onCover])

  useLayoutEffect(() => {
    const measure = () => {
      const top = expanded ? 0 : Math.max(0, root.current?.getBoundingClientRect().top || 0)
      const viewport = window.visualViewport?.height || window.innerHeight
      setAvailableHeight(Math.max(280, Math.floor(viewport - top)))
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, { passive: true })
    window.visualViewport?.addEventListener('resize', measure)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    document.querySelectorAll('.site-header, .st-preview-notes').forEach((el) => observer?.observe(el))
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure)
      window.visualViewport?.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [expanded])

  useEffect(() => {
    if (!expanded) return undefined
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const escape = (e) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) setExpanded(false)
    }
    window.addEventListener('keydown', escape)
    return () => {
      document.body.style.overflow = before
      window.removeEventListener('keydown', escape)
    }
  }, [expanded])

  const keyboard = (event) => {
    if (contentsOpen || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    // Dialogs opened from the cover are portals: their keys still bubble through this tree.
    if (event.target.closest('input, textarea, select, [contenteditable="true"], [role="slider"], [role="tablist"], [role="dialog"], [data-slide-interactive]')) return
    const moves = { ArrowRight: current + 1, PageDown: current + 1, ArrowLeft: current - 1, PageUp: current - 1, Home: 0, End: last }
    if (!Object.hasOwn(moves, event.key)) return
    event.preventDefault()
    go(moves[event.key])
  }
  const persistent = (item) => ['step-question', 'step-practice'].includes(item.kind) || (item.kind === 'step' && item.phase === 'combined') || (item.kind === 'block' && ['graph', 'quiz', 'diagram'].includes(blockById.get(item.blockId)?.type))
  const visiblePages = slides.filter((item) => item.id === slide.id || (opened.has(item.id) && persistent(item)))
  const visitedCount = slides.filter((item) => opened.has(item.id)).length
  // The cover sets a short title at display size and a long one a step down (never a sixth size).
  const titleLength = String(lab?.title || '').trim().length
  const coverTitle = titleLength <= COVER_SHORT_TITLE ? 'short' : titleLength <= COVER_DISPLAY_TITLE ? 'display' : titleLength <= COVER_LONG_TITLE ? 'title' : 'long'
  const summaryLength = String(lab?.spec?.summary || '').trim().length
  const coverSummary = summaryLength && summaryLength <= SHORT_SUMMARY ? 'short' : undefined
  const citationsFor = (source) => (source.source_refs || []).map((ref, i) => ({ n: i + 1, ref, title: env.sourceById(ref.source_id)?.title || '' }))

  const renderPage = (item) => {
    const source = blockById.get(item.blockId)
    if (item.kind === 'intro') return (
      <div className={`deck-cover${introAside ? ' has-aside' : ''}`} data-title={coverTitle} data-summary={coverSummary}
        data-compact={coverFit >= 1 ? '' : undefined} data-step={coverFit >= 2 ? coverFit - 1 : undefined}>
        <div className="deck-cover-text deck-scroll" role="region" aria-label={d('intro')} tabIndex={0}>
          <div className="deck-cover-main">{intro}</div>
          {slides.length > 1 ? (
            <div className="deck-cover-start">
              <Button variant="primary" size="lg" onClick={() => go(current + 1)}>{d('start')}</Button>
            </div>
          ) : null}
          {introFoot ? <div className="deck-cover-foot">{introFoot}</div> : null}
        </div>
        <div className="deck-cover-aside">
          <div className="deck-cover-media"><LabCover lab={lab} eager /></div>
          {introAside ? <div className="deck-cover-colophon">{introAside}</div> : null}
        </div>
      </div>
    )
    if (item.kind === 'goals') return (
      <div className={`deck-goals deck-scroll${item.notes ? ' has-notes' : ''}`} role="region" aria-label={d('goals')} tabIndex={0} data-count={item.items.length} data-notes={item.notes ? item.notes.length : undefined}>
        <ol className="deck-goal-list" start={item.first + 1} lang={contentLang}>
          {item.items.map((goal, i) => (
            <li key={item.first + i} className="deck-goal">
              <span className="deck-goal-n" aria-hidden="true">{item.first + i + 1}</span>
              <RichText text={goal} className="deck-goal-text" />
            </li>
          ))}
        </ol>
        {item.notes ? (
          <section className="deck-goal-notes" aria-label={d('assumptions')}>
            <ul lang={contentLang}>
              {item.notes.map((text, i) => (
                <li key={i} className="deck-goal-note">
                  <ProvenanceBadge value="assumption" />
                  <RichText text={text} className="deck-goal-note-text" />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    )
    if (item.kind === 'assumptions') return (
      <div className="deck-assumptions deck-scroll" role="region" aria-label={d('assumptions')} tabIndex={0} data-count={item.items.length}>
        <ul className="deck-assumption-list">
          {item.items.map((text, i) => (
            <li key={item.first + i} className="deck-assumption">
              <ProvenanceBadge value="assumption" />
              <RichText text={text} className="deck-assumption-text" />
            </li>
          ))}
        </ul>
      </div>
    )
    if (item.kind === 'end') {
      const onAsk = finish?.onAsk
      return (
        <div className="deck-end" role="region" aria-labelledby={endTitleId}>
          <div className="deck-end-main">
            <h2 id={endTitleId} className="deck-end-title">{d('end')}</h2>
            <div className="deck-end-body">
              <div className="deck-end-recap">
                {objectives.length ? <>
                  <h3 className="deck-end-label">{d('endGoals')}</h3>
                  <ul className="deck-end-goals" lang={contentLang}>
                    {objectives.map((goal, i) => <li key={i}><Check aria-hidden="true" /><RichText text={goal} /></li>)}
                  </ul>
                </> : <p className="deck-end-lead">{d('endBody')}</p>}
              </div>
              <p className="deck-end-score">
                <span className="deck-end-count"><strong>{visitedCount}</strong><span>/</span><span>{slides.length}</span></span>
                <span className="deck-end-count-label">{d('visited')}</span>
              </p>
            </div>
          </div>
          <div className="deck-end-actions">
            {onAsk ? <Button variant="primary" icon={MessageCircle} onClick={onAsk}>{t('explorer.askTutor')}</Button>
              : <Button variant="primary" icon={RotateCcw} onClick={() => go(0)}>{d('restart')}</Button>}
            {onAsk ? <Button icon={RotateCcw} onClick={() => go(0)}>{d('restart')}</Button> : null}
            {onReading ? <Button icon={BookOpen} onClick={onReading}>{d('reading')}</Button> : null}
            {finish?.onFeedback ? <Button icon={MessageSquareHeart} onClick={finish.onFeedback}>{t('explorer.feedback.button')}</Button> : null}
          </div>
        </div>
      )
    }
    if (!source) return <p className="deck-empty">{d('empty')}</p>
    if (item.kind === 'step-practice') return <div className="deck-practice deck-scroll" data-slide-interactive role="region" aria-label={d('order')} tabIndex={0}><OrderActivity block={source} /></div>
    if (item.kind === 'step' || item.kind === 'step-question') return <StepSlide inDeck block={source} step={source.steps[item.index]} index={item.index} total={source.steps.length} phase={item.kind === 'step-question' ? 'question' : item.phase || 'explain'} />
    if (item.kind.startsWith('flow-')) return <FlowSlide inDeck block={source} kind={item.kind} itemId={item.itemId} nodeIds={item.nodeIds} edgeIds={item.edgeIds} focusItem={flowFocus?.blockId === source.id ? flowFocus : null} onSelect={(target) => {
      const destination = slides.findIndex((other) => other.blockId === source.id && other.kind === 'flow-group' && (target.type === 'node' ? other.nodeIds?.includes(target.id) : other.edgeIds?.includes(target.id)))
      if (destination >= 0) { setFlowFocus({ ...target, blockId: source.id }); go(destination) }
    }} />
    if (item.kind === 'text') {
      const short = String(item.body || '').trim().length <= SHORT_TEXT && item.pageCount === 1
      return (
        <div className={`deck-text deck-scroll${short ? ' is-short' : ''}`} role="region" aria-label={d('readingLabel')} tabIndex={0} lang={contentLang}>
          <RichText text={item.body} citations={citationsFor(source)} onCite={(cite) => env.openSource(cite.ref)} />
        </div>
      )
    }
    if (source.type === 'text' && source.visual3d) return (
      <div className={`deck-visual3d${source.body ? '' : ' is-bare'}`}>
        <div className="deck-visual3d-stage" data-slide-interactive role="region" aria-label={blockTitle(source)} tabIndex={0}>
          <GuidedVisual kind={source.visual3d} initialMode={source.visual_mode || undefined} initialGeometry={source.visual_geometry || undefined} />
        </div>
        {source.body ? (
          <div className="deck-visual3d-caption deck-scroll" role="region" aria-label={d('readingLabel')} tabIndex={0} lang={contentLang}>
            <RichText text={source.body} citations={citationsFor(source)} onCite={(cite) => env.openSource(cite.ref)} />
          </div>
        ) : null}
      </div>
    )
    return <div className="deck-interactive deck-scroll" data-slide-interactive data-block-type={source.type} role="region" aria-label={source.title || d('activity')} tabIndex={0}><BlockRenderer block={source} mode="view" /></div>
  }

  const row = ({ item, i }) => {
    const here = i === current
    const seen = opened.has(item.id)
    return (
      <li key={item.id}>
        <button type="button" ref={here ? currentRowRef : undefined} className={seen ? 'is-visited' : undefined} aria-current={here ? 'page' : undefined} onClick={() => go(i)}>
          <span className="deck-contents-n">{i + 1}</span>
          <span className="deck-contents-title" lang={item.blockId ? contentLang : undefined}>{titleOf(item)}</span>
          {seen && !here ? <><Check className="deck-contents-check" size={18} aria-hidden="true" /><span className="visually-hidden">, {t('explorer.visited')}</span></> : null}
        </button>
      </li>
    )
  }
  const askLabel = env.aiAvailable ? d('ask') : d('help')

  return (
    <section ref={root} className={`lesson-deck${expanded ? ' is-expanded' : ''}`} style={availableHeight ? { height: availableHeight, '--deck-height': `${availableHeight}px` } : undefined} aria-label={lab.title} onKeyDown={keyboard}>
      <header className="deck-toolbar">
        <button type="button" className="deck-tool deck-tool-contents" onClick={() => setContentsOpen(true)} aria-haspopup="dialog" aria-label={d('contents')}><List size={20} aria-hidden="true" /><span>{d('contents')}</span></button>
        <p className="deck-crumbs" title={crumb ? `${lab.title}, ${crumb}` : lab.title} lang={contentLang}>
          <span className={`deck-crumb-lesson${crumb ? ' has-part' : ''}`} lang={contentLang}>{lab.title}</span>
          {crumb ? <>
            <ChevronRight className="deck-crumb-sep" size={16} aria-hidden="true" />
            <span className="deck-crumb-part" lang={contentLang}>{crumb}</span>
          </> : null}
        </p>
        <div className="deck-toolbar-end">
          <button ref={helpRef} type="button" className="deck-tool deck-tool-ask" onClick={() => onHelp?.(block?.id || null)} aria-label={askLabel} title={askLabel}><MessageCircleQuestion size={20} aria-hidden="true" /><span>{askLabel}</span></button>
          <button type="button" className="deck-tool deck-reading" onClick={onReading} title={d('reading')} aria-label={d('reading')}><BookOpen size={20} aria-hidden="true" /></button>
          <button type="button" className="deck-tool" onClick={() => setExpanded((v) => !v)} aria-pressed={expanded} aria-label={expanded ? d('restore') : d('expand')} title={expanded ? d('restore') : d('expand')}>{expanded ? <Minimize size={20} aria-hidden="true" /> : <Expand size={20} aria-hidden="true" />}</button>
        </div>
      </header>
      <div className="deck-paper" ref={pageRef} tabIndex={-1} data-deck-kind={slide.kind} data-deck-type={block?.type} data-block-id={block?.id}>
        {heading ? (
          <div className="deck-heading" key={slide.id}>
            <h2 lang={heading.content ? contentLang : undefined}>{heading.title}</h2>
            {heading.beads || heading.lead || heading.hint || heading.ai ? (
              <p className="deck-byline">
                {heading.beads ? <>
                  <Beads count={heading.beads.count} current={heading.beads.index} visited={heading.beads.visited} />
                  <span className="deck-byline-count">{heading.beads.label}</span>
                </> : null}
                {heading.lead ? <span className="deck-byline-text" lang={heading.content ? contentLang : undefined}>{heading.lead}</span> : null}
                {heading.hint ? <span className="deck-byline-text">{heading.hint}</span> : null}
                {heading.ai ? <span className="deck-byline-ai"><AIBadge /></span> : null}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="deck-stage">
          {visiblePages.map((item) => (
            <div className="deck-page" key={item.id} hidden={item.id !== slide.id} data-slide-id={item.id}>
              <Suspense fallback={<LoadingBlock lines={4} />}>{renderPage(item)}</Suspense>
            </div>
          ))}
        </div>
      </div>
      <footer className="deck-footer">
        <button className="btn deck-nav is-prev" type="button" onClick={() => go(current - 1)} disabled={current === 0} aria-label={d('previous')}><ArrowLeft aria-hidden="true" /><span>{d('previous')}</span></button>
        <div className="deck-position" title={d('keyboard')}>
          <span aria-live="polite" aria-atomic="true">{d('page')} <strong>{current + 1}</strong> / {slides.length}</span>
          <span className="deck-progress" aria-hidden="true"><span style={{ transform: `scaleX(${(current + 1) / slides.length})` }} /></span>
        </div>
        <button className="btn deck-nav is-next" type="button" onClick={() => go(current + 1)} disabled={current === last} aria-label={d('next')}><span>{d('next')}</span><ArrowRight aria-hidden="true" /></button>
      </footer>
      <Dialog open={contentsOpen} onClose={() => setContentsOpen(false)} title={d('contents')} size="wide" initialFocusRef={currentRowRef}>
        <nav className="deck-contents" aria-label={d('contents')}>
          <ol className="deck-contents-list">
            {sections.map((section) => (section.blockId && section.rows.length > 1 ? (
              <li key={section.key} className="deck-contents-part">
                <h3 className="deck-contents-head" lang={contentLang}>{blockTitle(blockById.get(section.blockId))}</h3>
                <ol>{section.rows.map(row)}</ol>
              </li>
            ) : section.rows.map(row)))}
          </ol>
        </nav>
      </Dialog>
    </section>
  )
}
