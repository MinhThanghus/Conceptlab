import { lazy, Suspense, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  CircleCheck,
  CircleX,
  Eye,
  GripVertical,
  ListOrdered,
  MapPinOff,
  MessageCircleQuestion,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { Alert, Button, EmptyState, IconButton, LoadingBlock, LocatedBadge, ProgressBar, RichText, TabPanel, Tabs, TextArea } from '../../../components/ui/index.js'
import { BlockFrame } from '../BlockRenderer.jsx'
import { useBlockEnv } from '../BlockEnv.jsx'
import { SourceRefChips } from '../../sources/SourceRefChips.jsx'
import { CoverCrop, CropPreview } from './MediaStage.jsx'
import { knownSize, mediaUrl, moveItem, shuffledIndices, stripLeadingNumber } from './lessonKit.js'
import { useCanAsk, useReducedMotion, useReportState } from './lessonHooks.js'
import { autoplayNext, autoplaySeconds, canPracticeOrder, checkOrder } from './stepsLogic.js'
import './lesson.css'
import './steps.css'

const StepsEditor = lazy(() => import('./StepsEditor.jsx'))

/** Lesson in ordered steps (spec §5.1, §8.2). Edit mode loads the editor on demand. */
export default function StepsBlock({ block, mode, onChange }) {
  if (mode === 'edit') {
    return (
      <Suspense fallback={<LoadingBlock lines={4} height="6rem" />}>
        <StepsEditor block={block} onChange={onChange} />
      </Suspense>
    )
  }
  return <StepsView block={block} />
}

function stepTitle(step, index, t) {
  return step?.title?.trim() || t('steps.view.untitled', { n: index + 1 })
}

function StepsView({ block }) {
  const { t } = useT()
  const steps = block.steps || []
  const total = steps.length
  const tabsId = useId().replace(/[:]/g, '')
  const [tab, setTab] = useState('learn')
  const [learnState, setLearnState] = useState({})
  const [orderState, setOrderState] = useState({})
  const canOrder = canPracticeOrder(block)
  const activeTab = canOrder ? tab : 'learn'

  useReportState(block.id, activeTab === 'learn' ? { view: 'steps', total, ...learnState } : { view: 'order_activity', total, ...orderState })

  if (!total) {
    return (
      <BlockFrame block={block}>
        <EmptyState icon={ListOrdered} title={t('steps.view.emptyTitle')}>
          {t('steps.view.emptyBody')}
        </EmptyState>
      </BlockFrame>
    )
  }

  return (
    <BlockFrame block={block}>
      <div className="steps">
        {!block.sequence_confirmed ? (
          <Alert tone="warning" title={block.ai_generated ? t('steps.view.unconfirmedAiTitle') : t('steps.view.unconfirmedTitle')}>
            {t('steps.view.unconfirmedBody')}
          </Alert>
        ) : null}
        {canOrder ? (
          <Tabs
            idPrefix={tabsId}
            label={t('steps.view.tabsLabel')}
            value={activeTab}
            onChange={setTab}
            tabs={[
              { id: 'learn', label: t('steps.view.tabLearn'), icon: ListOrdered },
              { id: 'order', label: t('steps.view.tabOrder'), icon: Shuffle },
            ]}
          />
        ) : null}
        {canOrder ? (
          <>
            <TabPanel idPrefix={tabsId} id="learn" value={activeTab} className="steps-tabpanel">
              <LearnSteps block={block} onState={setLearnState} onPractice={() => setTab('order')} canOrder={canOrder} />
            </TabPanel>
            <TabPanel idPrefix={tabsId} id="order" value={activeTab} className="steps-tabpanel">
              <OrderActivity block={block} onState={setOrderState} />
            </TabPanel>
          </>
        ) : (
          <LearnSteps block={block} onState={setLearnState} canOrder={false} />
        )}
      </div>
    </BlockFrame>
  )
}

function LearnSteps({ block, onState, onPractice, canOrder }) {
  const { t } = useT()
  const env = useBlockEnv()
  const canAsk = useCanAsk()
  const reduced = useReducedMotion()
  const steps = block.steps || []
  const total = steps.length
  const seconds = autoplaySeconds(block)
  const [index, setIndex] = useState(0)
  const [visited, setVisited] = useState(() => new Set(steps[0] ? [steps[0].id] : []))
  const [playing, setPlaying] = useState(false)
  const [announce, setAnnounce] = useState('')
  const railRef = useRef(null)
  const headingId = useId()
  const current = Math.min(index, Math.max(0, total - 1))
  const step = steps[current]
  const visitedCount = steps.filter((s) => visited.has(s.id)).length

  const goTo = (next, { user = true } = {}) => {
    if (next < 0 || next >= total) return
    if (user) setPlaying(false)
    setIndex(next)
    setVisited((prev) => (prev.has(steps[next].id) ? prev : new Set(prev).add(steps[next].id)))
    setAnnounce(t('steps.view.announce', { n: next + 1, total, title: stepTitle(steps[next], next, t) }))
  }

  // auto-advance; stops at the last step
  useEffect(() => {
    if (!playing) return undefined
    const next = autoplayNext(current, total)
    if (next === null) {
      setPlaying(false)
      return undefined
    }
    const timer = window.setTimeout(() => goTo(next, { user: false }), seconds * 1000)
    return () => window.clearTimeout(timer)
  }, [playing, current, total, seconds]) // eslint-disable-line react-hooks/exhaustive-deps

  // never auto-advance with reduced motion or while the page is hidden
  useEffect(() => {
    if (reduced) setPlaying(false)
  }, [reduced])
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setPlaying(false)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // keep the current step visible in the horizontal rail (phones) without scrolling the page
  useEffect(() => {
    const rail = railRef.current
    const button = rail?.querySelector(`[data-step-index="${current}"]`)
    if (!rail || !button || rail.scrollWidth <= rail.clientWidth + 2) return
    const left = button.offsetLeft - rail.clientWidth / 2 + button.clientWidth / 2
    rail.scrollTo({ left: Math.max(0, left), behavior: reduced ? 'auto' : 'smooth' })
  }, [current, reduced])

  useEffect(() => {
    onState?.({ step: current + 1, step_id: step?.id, step_title: step?.title || '', visited: visitedCount, playing })
  }, [current, step?.id, step?.title, visitedCount, playing]) // eslint-disable-line react-hooks/exhaustive-deps

  const togglePlay = () => {
    if (playing) {
      setPlaying(false)
      return
    }
    if (current >= total - 1) goTo(0, { user: false })
    setPlaying(true)
  }

  const finished = visitedCount === total

  return (
    <div className="steps-learn">
      <nav className="steps-rail" aria-label={t('steps.view.listLabel')}>
        <ol className="steps-rail-list" ref={railRef}>
          {steps.map((s, i) => {
            const isCurrent = i === current
            const seen = visited.has(s.id)
            return (
              <li key={s.id}>
                <button
                  type="button"
                  data-step-index={i}
                  className={['steps-rail-btn', isCurrent ? 'is-current' : '', seen ? 'is-visited' : ''].join(' ')}
                  aria-current={isCurrent ? 'step' : undefined}
                  onClick={() => goTo(i)}
                >
                  <span className="steps-rail-num" aria-hidden="true">
                    {seen && !isCurrent ? <Check size={16} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="steps-rail-title">
                    <span className="visually-hidden">{t('steps.view.stepN', { n: i + 1 })}: </span>
                    {stepTitle(s, i, t)}
                    {seen && !isCurrent ? <span className="visually-hidden"> ({t('steps.view.visited')})</span> : null}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="steps-stage">
        <article key={step.id} className="steps-panel" aria-labelledby={headingId}>
          <StepContent block={block} step={step} index={current} total={total} headingId={headingId} canAsk={canAsk} env={env} />
        </article>

        <div className="steps-controls">
          <Button className="steps-prev" onClick={() => goTo(current - 1)} disabled={current === 0}>
            {t('common.actions.previous')}
          </Button>
          {!reduced ? (
            <Button variant="ghost" className="steps-play" icon={playing ? Pause : Play} aria-pressed={playing} onClick={togglePlay}>
              {playing ? t('steps.view.pause') : current >= total - 1 ? t('steps.view.playAgain') : t('steps.view.play')}
            </Button>
          ) : null}
          <Button variant="primary" className="steps-next" onClick={() => goTo(current + 1)} disabled={current >= total - 1}>
            {t('common.actions.next')}
          </Button>
        </div>
        {playing ? (
          <div className="steps-timer-track" aria-hidden="true">
            <div key={`${current}`} className="steps-timer" style={{ animationDuration: `${seconds}s` }} />
          </div>
        ) : null}
        {playing ? <p className="lk-hint">{t('steps.view.autoplayHint', { seconds })}</p> : null}
        <ProgressBar value={visitedCount / total} label={t('steps.view.progress', { done: visitedCount, total })} />
        {finished ? (
          <Alert
            tone="success"
            title={t('steps.view.finishedTitle')}
            action={
              canOrder && onPractice ? (
                <Button size="sm" icon={Shuffle} onClick={onPractice}>
                  {t('steps.view.tryOrder')}
                </Button>
              ) : null
            }
          >
            {canOrder ? t('steps.view.finishedOrder') : t('steps.view.finishedBody')}
          </Alert>
        ) : null}
        <p className="visually-hidden" aria-live="polite">
          {announce}
        </p>
      </div>
    </div>
  )
}

function StepContent({ block, step, index, total, headingId, canAsk, env }) {
  const { t } = useT()
  const highlight = step.highlight || null
  return (
    <div className={['steps-panel-grid', highlight ? 'has-figure' : ''].join(' ')}>
      <div className="steps-text">
        <div className="steps-head">
          <h3 id={headingId} className="steps-title">
            {stepTitle(step, index, t)}
          </h3>
          <span className="steps-folio">{t('steps.view.position', { n: index + 1, total })}</span>
        </div>
        {step.body ? <RichText text={step.body} className="lesson-text" /> : null}
        {step.source_refs?.length ? <SourceRefChips refs={step.source_refs} /> : null}
        {step.check_question ? <CheckQuestion key={step.id} block={block} step={step} canAsk={canAsk} env={env} /> : null}
        {canAsk ? (
          <div>
            <Button size="sm" icon={MessageCircleQuestion} onClick={() => env.ask({ block_id: block.id, item_id: step.id })}>
              {t('steps.view.askStep')}
            </Button>
          </div>
        ) : null}
      </div>
      {highlight ? <StepHighlight highlight={highlight} step={step} index={index} /> : null}
    </div>
  )
}

/**
 * The region of the source a step points at. `fill` (a lesson slide) makes the figure fill its
 * well: zoomed on the region edge to edge first, the whole page on demand, the toggle in the
 * well's corner so it never pushes the picture.
 */
export function StepHighlight({ highlight, step, index, maxBlock = '19rem', initialWhole = false, fill = false }) {
  const { t } = useT()
  const env = useBlockEnv()
  const [whole, setWhole] = useState(initialWhole)
  const source = highlight.source_id ? env.sourceById(highlight.source_id) : null
  const src = mediaUrl({ source, page: highlight.page })
  if (!source || !src) {
    return (
      <p className="steps-nofigure">
        <MapPinOff size={16} aria-hidden="true" />
        {t('common.located.none')}
      </p>
    )
  }
  // the printed page label ("64") reads as a page only with its word: "Trang 64", never a bare number
  const where = highlight.page ? `${source.title}, ${t('steps.kit.pageN', { n: highlight.page_label || highlight.page })}` : source.title
  const alt = t('steps.view.highlightAlt', { n: index + 1, title: stepTitle(step, index, t), where })
  if (fill) {
    const zoomed = Boolean(highlight.bbox) && !whole
    return (
      <figure className={['steps-figure', 'is-fill', zoomed ? 'is-zoomed' : 'is-whole'].join(' ')}>
        <div className="steps-figure-frame">
          {zoomed ? (
            <CoverCrop src={src} alt={alt} bbox={highlight.bbox} size={knownSize({ source })} className="steps-figure-cover" />
          ) : (
            <CropPreview src={src} alt={alt} bbox={highlight.bbox} size={knownSize({ source })} whole maxBlock="100cqh" className="steps-figure-whole" />
          )}
          {highlight.bbox ? (
            <span className="steps-figure-tools">
              <Button icon={whole ? ZoomIn : ZoomOut} aria-pressed={whole} onClick={() => setWhole((w) => !w)}>
                {whole ? t('steps.view.zoomRegion') : t('steps.view.showWhole')}
              </Button>
            </span>
          ) : null}
        </div>
        {!env.sourcesAtTop ? (
          <figcaption>
            <span className="steps-figure-where">
              <span className="break">{where}</span>
              <LocatedBadge located={highlight.located || 'none'} />
            </span>
            <Button size="sm" icon={BookOpen} onClick={() => env.openSource(highlight)}>
              {t('steps.view.openInSource')}
            </Button>
          </figcaption>
        ) : null}
      </figure>
    )
  }
  return (
    <figure className="steps-figure">
      <CropPreview
        src={src}
        alt={alt}
        bbox={highlight.bbox}
        size={knownSize({ source })}
        whole={whole}
        maxBlock={maxBlock}
      />
      <figcaption>
        {!env.sourcesAtTop ? <span className="steps-figure-where">
          <span className="break">{where}</span>
          <LocatedBadge located={highlight.located || 'none'} />
        </span> : null}
        <span className="steps-figure-tools">
          {highlight.bbox ? (
            <Button size="sm" variant="ghost" icon={whole ? ZoomIn : ZoomOut} aria-pressed={whole} onClick={() => setWhole((w) => !w)}>
              {whole ? t('steps.view.zoomRegion') : t('steps.view.showWhole')}
            </Button>
          ) : null}
          {!env.sourcesAtTop ? <Button size="sm" icon={BookOpen} onClick={() => env.openSource(highlight)}>
            {t('steps.view.openInSource')}
          </Button> : null}
        </span>
      </figcaption>
    </figure>
  )
}

/**
 * A short question the learner answers in their own words. `slide` is the lesson-slide form: no
 * well, the question set large beside one coral bead (the slide's one loud mark), a roomier answer
 * field and a full-size "ask the AI" button.
 */
export function CheckQuestion({ block, step, canAsk, env, answer: controlledAnswer, onAnswerChange, compact = false, slide = false }) {
  const { t } = useT()
  const [localAnswer, setLocalAnswer] = useState('')
  const answer = controlledAnswer ?? localAnswer
  const setAnswer = onAnswerChange || setLocalAnswer
  const question = step.check_question
  const noteId = useId()
  // a shared slide keeps the short "temporary" note beside its button, not on a line of its own
  const inlineNote = slide && compact
  const note = inlineNote ? <p id={noteId} className="lk-hint steps-check-note">{t('steps.check.temporary')}</p> : null
  return (
    <section className={['steps-check', slide ? 'is-slide' : '', compact ? 'is-compact' : ''].filter(Boolean).join(' ')} aria-label={t('steps.check.title')}>
      <h4 className={slide ? 'steps-check-head visually-hidden' : 'steps-check-head'}>{t('steps.check.title')}</h4>
      <p className="steps-check-q">
        {slide ? <span className="steps-check-bead" aria-hidden="true" /> : null}
        <span>{question}</span>
      </p>
      <TextArea
        label={t('steps.check.yourAnswer')}
        hint={inlineNote ? undefined : compact ? t('steps.check.temporary') : t('steps.check.thinkFirst')}
        placeholder={inlineNote ? t('steps.check.placeholder') : undefined}
        {...(inlineNote ? { 'aria-describedby': noteId } : {})}
        rows={slide && !compact ? 3 : 2}
        maxLength={1000}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
      />
      {canAsk ? (
        <div className="steps-check-actions">
          <Button
            size={slide ? undefined : 'sm'}
            icon={MessageCircleQuestion}
            disabled={!answer.trim()}
            onClick={() =>
              env.ask({
                block_id: block.id,
                item_id: step.id,
                selection: answer.trim(),
                prompt: t('steps.check.askPrompt', { question, answer: answer.trim() }),
              })
            }
          >
            {t('steps.check.askAI')}
          </Button>
          {!answer.trim() && !compact ? <p className="lk-hint steps-check-hint">{t('steps.check.writeFirst')}</p> : null}
          {note}
        </div>
      ) : (
        <>
          <p className="lk-hint">{t('steps.check.discuss')}</p>
          {note}
        </>
      )}
    </section>
  )
}

/**
 * Put the steps back in order. On a lesson slide (`inDeck`, or the deck's presentation env) the
 * rows share the slide's height, the step titles are read at lead size and no crop of printed
 * text stands in for a step (a cut line of a textbook page says nothing).
 */
export function OrderActivity({ block, onState, inDeck }) {
  const { t } = useT()
  const env = useBlockEnv()
  const deck = inDeck ?? env.presentation === 'slides'
  const steps = block.steps || []
  const total = steps.length
  const instructionsId = useId()
  const [order, setOrder] = useState(() => shuffledIndices(total))
  const [result, setResult] = useState(null)
  const [showAnswer, setShowAnswer] = useState(false)
  const [announce, setAnnounce] = useState('')
  const focusTarget = useRef(null)
  const controls = useRef({})

  // keep the order valid if the teacher changes the number of steps while previewing
  useEffect(() => {
    if (order.length !== total) {
      setOrder(shuffledIndices(total))
      setResult(null)
    }
  }, [total]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!focusTarget.current) return
    const { id, which } = focusTarget.current
    const set = controls.current[id] || {}
    const target = set[which] && !set[which].disabled ? set[which] : set.handle
    target?.focus({ preventScroll: true })
    focusTarget.current = null
  })

  useEffect(() => {
    onState?.({ arranged: order.map((i) => steps[i]?.title || ''), checked: Boolean(result), correct: result?.correctCount ?? null })
  }, [order, result]) // eslint-disable-line react-hooks/exhaustive-deps

  if (order.length !== total) return null

  const move = (position, delta, which) => {
    const to = position + delta
    if (to < 0 || to >= total) return
    const stepIndex = order[position]
    setOrder((prev) => moveItem(prev, position, to))
    setResult(null)
    setShowAnswer(false)
    focusTarget.current = { id: steps[stepIndex].id, which }
    setAnnounce(t('steps.order.moved', { title: stripLeadingNumber(stepTitle(steps[stepIndex], stepIndex, t)), pos: to + 1, total }))
  }

  const check = () => {
    const res = checkOrder(order)
    setResult(res)
    setAnnounce(res.allCorrect ? t('steps.order.allCorrect') : t('steps.order.someCorrect', { n: res.correctCount, total }))
  }

  const reshuffle = () => {
    setOrder(shuffledIndices(total))
    setResult(null)
    setShowAnswer(false)
    setAnnounce(t('steps.order.reshuffled'))
  }

  return (
    <div className={['steps-order', deck ? 'is-deck' : '', result ? 'is-checked' : ''].filter(Boolean).join(' ')}>
      <p className="steps-order-intro" id={instructionsId}>
        {t('steps.order.instructions')}
      </p>
      <ol className="steps-order-list" style={deck ? { '--order-rows': total } : undefined}>
        {order.map((stepIndex, position) => {
          const step = steps[stepIndex]
          const label = stripLeadingNumber(stepTitle(step, stepIndex, t))
          const mark = result ? (result.marks[position] ? 'is-right' : 'is-wrong') : ''
          const source = step.highlight?.source_id ? env.sourceById(step.highlight.source_id) : null
          const thumb = !deck && step.highlight?.bbox ? mediaUrl({ source, page: step.highlight.page }) : null
          const ref = (which) => (el) => {
            controls.current[step.id] = { ...(controls.current[step.id] || {}), [which]: el }
          }
          return (
            <li key={step.id} className={['steps-order-item', mark].join(' ')}>
              <span className="steps-order-pos" aria-hidden="true">
                {position + 1}
              </span>
              {thumb ? (
                <CropPreview src={thumb} alt="" bbox={step.highlight.bbox} size={knownSize({ source })} maxBlock="4.5rem" pad={0.04} min={0.05} outlined={false} className="steps-order-thumb" />
              ) : null}
              {/* label + mark + arrows wrap together under the picture on narrow screens */}
              <span className="steps-order-main">
                <button
                  ref={ref('handle')}
                  type="button"
                  className="steps-order-handle"
                  aria-describedby={instructionsId}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowUp') {
                      event.preventDefault()
                      move(position, -1, 'handle')
                    } else if (event.key === 'ArrowDown') {
                      event.preventDefault()
                      move(position, 1, 'handle')
                    }
                  }}
                >
                  <GripVertical aria-hidden="true" size={18} />
                  <span className="steps-order-label">
                    <span className="visually-hidden">{t('steps.order.positionSr', { pos: position + 1, total })} </span>
                    {label}
                  </span>
                </button>
                {result ? (
                  deck ? (
                    <span className={['steps-order-verdict', result.marks[position] ? 'lk-good' : 'lk-bad'].join(' ')}>
                      {result.marks[position] ? <CircleCheck className="steps-order-mark" aria-hidden="true" /> : <CircleX className="steps-order-mark" aria-hidden="true" />}
                      <span>
                        {result.marks[position] ? t('steps.order.rightPlace') : showAnswer ? t('steps.order.belongsAt', { pos: stepIndex + 1 }) : t('steps.order.wrongPlace')}
                      </span>
                    </span>
                  ) : result.marks[position] ? (
                    <CircleCheck className="lk-good steps-order-mark" role="img" aria-label={t('steps.order.rightPlace')} />
                  ) : (
                    <CircleX className="lk-bad steps-order-mark" role="img" aria-label={t('steps.order.wrongPlace')} />
                  )
                ) : null}
                <span className="steps-order-tools">
                  <IconButton ref={ref('up')} icon={ArrowUp} size={deck ? undefined : 'sm'} bordered label={t('steps.order.moveUp', { title: label })} disabled={position === 0} onClick={() => move(position, -1, 'up')} />
                  <IconButton
                    ref={ref('down')}
                    icon={ArrowDown}
                    size={deck ? undefined : 'sm'}
                    bordered
                    label={t('steps.order.moveDown', { title: label })}
                    disabled={position === total - 1}
                    onClick={() => move(position, 1, 'down')}
                  />
                </span>
              </span>
            </li>
          )
        })}
      </ol>
      <div className="steps-order-actions">
        <Button variant="primary" icon={Check} onClick={check}>
          {t('steps.order.check')}
        </Button>
        <Button icon={RotateCcw} onClick={reshuffle}>
          {t('steps.order.reshuffle')}
        </Button>
        {deck && result ? (
          <p className={['steps-order-result', result.allCorrect ? 'is-all' : ''].filter(Boolean).join(' ')}>
            {result.allCorrect ? <CircleCheck aria-hidden="true" /> : null}
            <span>{result.allCorrect ? t('steps.order.allCorrect') : t('steps.order.someCorrectTitle', { n: result.correctCount, total })}</span>
          </p>
        ) : null}
        {deck && result && !result.allCorrect ? (
          <Button icon={Eye} aria-pressed={showAnswer} onClick={() => setShowAnswer((v) => !v)}>
            {showAnswer ? t('steps.order.hideAnswer') : t('steps.order.showAnswer')}
          </Button>
        ) : null}
      </div>
      {result && !deck ? (
        result.allCorrect ? (
          <Alert tone="success" title={t('steps.order.allCorrectTitle')}>
            {t('steps.order.allCorrect')}
          </Alert>
        ) : (
          <Alert
            tone="info"
            title={t('steps.order.someCorrectTitle', { n: result.correctCount, total })}
            action={
              <Button size="sm" icon={Eye} aria-pressed={showAnswer} onClick={() => setShowAnswer((v) => !v)}>
                {showAnswer ? t('steps.order.hideAnswer') : t('steps.order.showAnswer')}
              </Button>
            }
          >
            {t('steps.order.someCorrect', { n: result.correctCount, total })}
          </Alert>
        )
      ) : null}
      {showAnswer && result && !result.allCorrect && !deck ? (
        <div className="steps-answer">
          <h4 className="steps-answer-title">{t('steps.order.answerTitle')}</h4>
          <ol className="steps-answer-list">
            {steps.map((step, i) => (
              <li key={step.id}>{stripLeadingNumber(stepTitle(step, i, t))}</li>
            ))}
          </ol>
        </div>
      ) : null}
      <p className="visually-hidden" aria-live="polite">
        {announce}
      </p>
    </div>
  )
}
