import { forwardRef, lazy, Suspense, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleX,
  Eye,
  Lightbulb,
  ListChecks,
  RefreshCw,
  RotateCcw,
  SearchCheck,
  ShieldCheck,
  Signal,
  SignalHigh,
  SignalLow,
  SignalMedium,
} from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { post } from '../../../lib/api.js'
import { Alert, Badge, Button, EmptyState, IconButton, LoadingBlock, RichText, TextField, useErrorText } from '../../../components/ui/index.js'
import { BlockFrame } from '../BlockRenderer.jsx'
import { useBlockEnv } from '../BlockEnv.jsx'
import { SourceRefChips } from '../../sources/SourceRefChips.jsx'
import { useReducedMotion, useReportState } from '../steps/lessonHooks.js'
import { moveItem } from '../steps/lessonKit.js'
import {
  KINDS,
  answerPayload,
  approvedQuestions,
  deckSizes,
  initialArrangement,
  isAnswered,
  nextMissed,
  optionLetter,
  phaseFromSearch,
  positionMarks,
  questionLevel,
  reviewFeedback,
  sanitizeAnswers,
  scoreTier,
} from './quizModel.js'
import { effectiveTolerance, scoreAttempt, toNumber } from './quizScoring.js'
import '../steps/lesson.css'
import './quiz.css'

const QuizEditor = lazy(() => import('./QuizEditor.jsx'))

const NAME_MAX = 60
/** A small meter per thinking level, easiest first (quiet, next to the kind). */
const LEVEL_ICONS = { recall: SignalLow, understand: SignalMedium, apply: SignalHigh, extend: Signal }

/**
 * Self-check quiz (spec §8.5, §10.2). Edit mode loads the teacher editor on demand; the
 * learner view shows approved questions one at a time and checks them all at the end:
 * on the server for shared labs (the score learners see is the server's), locally in the
 * studio preview with the same rules (quizScoring.js).
 *
 * Learner payloads carry no answers: what is right, the explanation and the feedback per option
 * all come back with the marking result. A question may open with a situation (`context`), offer
 * a `hint` on request and name its thinking level (`cognitive_level`).
 */
export default function QuizBlock({ block, mode, onChange }) {
  if (mode === 'edit') {
    return (
      <Suspense fallback={<LoadingBlock lines={4} height="10rem" />}>
        <QuizEditor block={block} onChange={onChange} />
      </Suspense>
    )
  }
  return <QuizView block={block} />
}

function QuizView({ block }) {
  const { t } = useT()
  const env = useBlockEnv()
  const questions = useMemo(() => approvedQuestions(block), [block])
  // a different set of questions (teacher edited while previewing) starts a fresh attempt
  const signature = questions.map((q) => `${q.id}:${q.kind}:${(q.options || []).length}`).join('|')
  return (
    <BlockFrame block={block}>
      {questions.length ? (
        <QuizRunner key={signature} block={block} questions={questions} signature={signature} />
      ) : (
        <EmptyState icon={ListChecks} title={t('quiz.view.emptyTitle')}>
          {env.shareCode ? t('quiz.view.emptyBody') : t('quiz.view.emptyBodyPreview')}
        </EmptyState>
      )}
    </BlockFrame>
  )
}

/** In-progress answers survive moving to another part of the lab (per browser tab only). */
function readDraft(key) {
  try {
    const raw = window.sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeDraft(key, value) {
  try {
    if (value) window.sessionStorage.setItem(key, JSON.stringify(value))
    else window.sessionStorage.removeItem(key)
  } catch {
    /* storage unavailable (private mode, quota): the quiz still works, it just won't resume */
  }
}

const textOf = (value) => String(value ?? '').trim()
/** Teacher text as a screen reader hears it: the screen renders $math$ and **bold**, speech drops the marks. */
const spoken = (value) => textOf(value).replace(/\$\$?|\*\*/g, '')

/**
 * Bring something that just opened into view when it sits below the fold or under the quiz's
 * button row (which sticks to the foot of a deck slide). Leaves the page alone when it is visible,
 * and when it opened inside that pinned row itself (the hint does, on a slide).
 */
function revealAboveNav(el, reducedMotion) {
  if (!el?.getBoundingClientRect || !el.scrollIntoView) return
  const nav = el.closest('.qz')?.querySelector('.qz-nav')
  const sticky = nav && window.getComputedStyle(nav).position === 'sticky'
  if (sticky && nav.contains(el)) return
  const limit = sticky ? nav.getBoundingClientRect().top : window.innerHeight
  if (el.getBoundingClientRect().bottom > limit - 4) el.scrollIntoView({ block: 'end', behavior: reducedMotion ? 'auto' : 'smooth' })
}

function QuizRunner({ block, questions, signature }) {
  const { t } = useT()
  const env = useBlockEnv()
  const errorText = useErrorText()
  const reducedMotion = useReducedMotion()
  const uid = useId()
  const headId = useId()
  const progressId = useId()
  const hintBoxId = useId()
  const shared = Boolean(env.shareCode)
  const phase = useMemo(() => phaseFromSearch(typeof window === 'undefined' ? '' : window.location.search), [])
  const total = questions.length
  const draftKey = `cl.quiz.${env.shareCode || env.labId || 'preview'}.${block.id}`
  const [restored] = useState(() => {
    const draft = readDraft(draftKey)
    if (!draft || draft.signature !== signature) return null
    const saved = sanitizeAnswers(questions, draft.answers)
    if (!Object.keys(saved).length) return null
    return { answers: saved, index: Math.min(Math.max(0, Math.trunc(Number(draft.index)) || 0), total - 1) }
  })
  const [resumed, setResumed] = useState(Boolean(restored))
  const [index, setIndex] = useState(restored?.index ?? 0)
  const [answers, setAnswers] = useState(restored?.answers ?? {})
  const [hints, setHints] = useState({})
  const [result, setResult] = useState(null)
  const [sent, setSent] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [showMissing, setShowMissing] = useState(false)
  const [name, setName] = useState('')
  const [announce, setAnnounce] = useState('')
  const questionHeading = useRef(null)
  const summaryHeading = useRef(null)
  const pendingFocus = useRef(null)
  const request = useRef(null)
  const hintRef = useRef(null)
  const hintWasOpen = useRef(false)

  useEffect(() => () => request.current?.abort(), [])

  useEffect(() => {
    if (result) return
    writeDraft(draftKey, Object.keys(answers).length ? { signature, answers, index } : null)
  }, [draftKey, signature, answers, index, result])

  useLayoutEffect(() => {
    if (!pendingFocus.current) return
    const which = pendingFocus.current
    pendingFocus.current = null
    if (which === 'summary') summaryHeading.current?.focus()
    else if (which === 'review') showQuestionTop()
    else questionHeading.current?.focus()
  })

  // In review the score sits above each question: bring the question's own line to the top
  // (in a deck slide, the slide scrolls; on a page, the page does, clear of the site header).
  const showQuestionTop = () => {
    const heading = questionHeading.current
    if (!heading) return
    heading.focus({ preventScroll: true })
    heading.closest('.qz-top')?.scrollIntoView?.({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' })
  }

  const reviewing = Boolean(result)
  const current = Math.min(index, total - 1)
  const question = questions[current]
  const kind = KINDS.includes(question.kind) ? question.kind : 'mcq'
  const level = questionLevel(question)
  const LevelIcon = level ? LEVEL_ICONS[level] : null
  const resultById = useMemo(() => new Map((result?.results || []).map((r) => [String(r.question_id), r])), [result])
  const blanks = questions.reduce((acc, q, i) => (isAnswered(q, answers[q.id]) ? acc : [...acc, i]), [])
  const answeredCount = total - blanks.length
  const review = reviewing ? resultById.get(String(question.id)) || null : null
  const isLast = current === total - 1
  const hint = textOf(question.hint)
  const hintOpen = Boolean(hint && !reviewing && hints[question.id])
  // the review button walks through the misses: the next one after the question on screen
  const missed = reviewing ? nextMissed(questions, result.results, current) : -1

  // a hint that just opened may land below the fold: show it (it sits in the button row)
  useEffect(() => {
    if (hintOpen && !hintWasOpen.current) revealAboveNav(hintRef.current, reducedMotion)
    hintWasOpen.current = hintOpen
  }, [hintOpen, reducedMotion])

  useReportState(block.id, {
    phase,
    question: { number: current + 1, total, id: question.id, kind: question.kind, prompt: question.prompt },
    answered: answeredCount,
    total,
    checked: reviewing,
    hint_shown: hintOpen,
    score: result ? { correct: result.score, total: result.total } : null,
    current_correct: review ? Boolean(review.correct) : null,
  })

  const go = (next) => {
    if (next < 0 || next >= total) return
    if (next === current) {
      // same question: no re-render will happen, so move focus now (a pending request would fire later)
      if (reviewing) showQuestionTop()
      else questionHeading.current?.focus()
      return
    }
    setIndex(next)
    pendingFocus.current = reviewing ? 'review' : 'question'
  }

  const setAnswer = (qid, value) => setAnswers((prev) => ({ ...prev, [qid]: value }))

  const toggleHint = () => {
    const open = !hints[question.id]
    setHints((prev) => ({ ...prev, [question.id]: open }))
    // the well appears above the button: say it out loud for screen readers (without $ and ** marks)
    setAnnounce(open ? `${t('quiz.view.hintSr')} ${spoken(hint)}` : '')
  }

  const finish = (res, record, displayName) => {
    setResult({
      id: res?.id ?? null,
      score: Number(res?.score) || 0,
      total: Number(res?.total) || 0,
      results: Array.isArray(res?.results) ? res.results : [],
    })
    setSent({ answers: record, name: displayName })
    setIndex(0)
    setShowMissing(false)
    setResumed(false)
    writeDraft(draftKey, null)
    pendingFocus.current = 'summary'
  }

  const check = async (force = false) => {
    if (busy) return
    if (blanks.length && !force) {
      setShowMissing(true)
      return
    }
    setShowMissing(false)
    setError(null)
    // unanswered questions are sent as null so they count as wrong (an honest total)
    const payload = questions.map((q) => ({ question_id: q.id, answer: answerPayload(q, answers[q.id]) }))
    const record = Object.fromEntries(payload.map((item) => [item.question_id, item.answer]))
    if (!shared) {
      finish(scoreAttempt(questions, payload), record, '')
      return
    }
    const displayName = name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    try {
      const body = { block_id: block.id, phase, answers: payload }
      if (displayName) body.display_name = displayName
      const language = env.translatedLanguage ? `?lang=${encodeURIComponent(env.translatedLanguage)}` : ''
      const res = await post(`/api/share/${encodeURIComponent(env.shareCode)}/quiz-attempts${language}`, body, { signal: controller.signal })
      if (!controller.signal.aborted) finish(res, record, displayName)
    } catch (err) {
      if (err?.name !== 'AbortError') setError(err)
    } finally {
      if (request.current === controller) {
        request.current = null
        setBusy(false)
      }
    }
  }

  const restart = () => {
    request.current?.abort()
    setAnswers({})
    setHints({})
    setResult(null)
    setSent(null)
    setError(null)
    setShowMissing(false)
    setResumed(false)
    setIndex(0)
    setAnnounce(t('quiz.view.restarted'))
    pendingFocus.current = 'question'
  }

  const stale = error && (error.code === 'not_found' || error.code === 'validation_error')

  return (
    <div className={['qz', reviewing ? 'is-review' : ''].filter(Boolean).join(' ')} aria-busy={busy || undefined}>
      {reviewing ? null : (
        <div className="qz-intro">
          {phase !== 'practice' ? <strong className="qz-phase">{t(`quiz.view.phase.${phase}`)}</strong> : null}
          {!shared ? (
            <Badge tone="warning" icon={Eye}>
              {t('quiz.view.previewBadge')}
            </Badge>
          ) : null}
          <span className="qz-intro-text">{t('quiz.view.intro', { count: total })}</span>
          {resumed ? <span className="qz-resumed">{t('quiz.view.resumed')}</span> : null}
        </div>
      )}

      {/* the score (after checking) and the question's own line; on a slide they share one line */}
      <div className="qz-head">
        {reviewing ? (
          <ResultSummary
            ref={summaryHeading}
            result={result}
            shared={shared}
            phase={phase}
            name={sent?.name}
            missed={missed}
            onReviewMissed={() => go(missed)}
            onRestart={restart}
          />
        ) : null}

        {/* the question's own line: which one, its kind and level; the beads are the only progress */}
        <div className="qz-top">
          <div className="qz-qhead-row">
            <h3 id={headId} ref={questionHeading} tabIndex={-1} className="qz-qhead">
              {t('quiz.view.questionN', { n: current + 1, total })}
            </h3>
            <span className="qz-kind">{t(`quiz.kinds.${kind}`)}</span>
            {level ? (
              <span className="qz-level">
                <LevelIcon aria-hidden="true" />
                <span className="visually-hidden">{t('quiz.view.levelSr')} </span>
                {t(`quiz.levels.${level}`)}
              </span>
            ) : null}
          </div>
          {total > 1 ? (
            <ol className="qz-dots" aria-label={t('quiz.view.jumpLabel')} aria-describedby={progressId}>
              {questions.map((q, i) => {
                const r = reviewing ? resultById.get(String(q.id)) : null
                const state = reviewing ? (r ? (r.correct ? 'right' : 'wrong') : 'unscored') : isAnswered(q, answers[q.id]) ? 'done' : 'todo'
                const Mark = state === 'right' ? CircleCheck : state === 'wrong' ? CircleX : null
                return (
                  <li key={q.id}>
                    <button
                      type="button"
                      className={`qz-dot is-${state}`}
                      aria-current={i === current ? 'step' : undefined}
                      aria-label={t(`quiz.view.dot.${state}`, { n: i + 1 })}
                      onClick={() => go(i)}
                    >
                      <span aria-hidden="true">{i + 1}</span>
                      {Mark ? <Mark className="qz-dot-mark" aria-hidden="true" /> : null}
                    </button>
                  </li>
                )
              })}
            </ol>
          ) : null}
          <p id={progressId} className="visually-hidden">
            {reviewing ? t('quiz.view.reviewHint') : t('quiz.view.answered', { count: answeredCount, total })}
          </p>
        </div>
      </div>

      <QuestionCard
        key={`${question.id}-${reviewing ? 'review' : 'answer'}`}
        question={question}
        headId={headId}
        groupName={`${uid}-${question.id}`}
        value={answers[question.id]}
        onChange={(value) => setAnswer(question.id, value)}
        locked={reviewing}
        review={review}
        given={sent?.answers?.[question.id]}
        onAnnounce={setAnnounce}
        footer={
          !reviewing && isLast ? (
            <div className="qz-submit">
              {shared ? (
                <TextField
                  label={t('quiz.view.nameLabel')}
                  hint={t('quiz.view.nameHint')}
                  value={name}
                  maxLength={NAME_MAX}
                  autoComplete="off"
                  onChange={(event) => setName(event.target.value)}
                />
              ) : null}
              <p className="qz-privacy">
                <ShieldCheck aria-hidden="true" />
                <span>{shared ? t('quiz.view.privacy') : t('quiz.view.previewNote')}</span>
              </p>
            </div>
          ) : null
        }
      />

      {/* messages sit above the buttons, so they are seen where the learner just pressed */}
      {showMissing && blanks.length && !reviewing ? (
        <Alert tone="warning" role="alert" title={t('quiz.view.missingTitle', { count: blanks.length })}>
          <p className="qz-alert-text">{t('quiz.view.missingBody', { list: blanks.map((i) => i + 1).join(', ') })}</p>
          <div className="qz-alert-actions">
            <Button size="sm" onClick={() => go(blanks[0])}>
              {t('quiz.view.goToMissing', { n: blanks[0] + 1 })}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => check(true)} loading={busy}>
              {t('quiz.view.checkAnyway')}
            </Button>
          </div>
        </Alert>
      ) : null}

      {error ? (
        stale ? (
          <Alert tone="warning" role="alert" title={t('quiz.view.staleTitle')}>
            <p className="qz-alert-text">{t('quiz.view.staleBody')}</p>
            <Button size="sm" icon={RefreshCw} onClick={() => window.location.reload()}>
              {t('common.actions.reload')}
            </Button>
          </Alert>
        ) : (
          <Alert tone="danger" role="alert" title={t('quiz.view.sendFailed')}>
            <p className="qz-alert-text">
              {errorText(error)} {t('quiz.view.answersKept')}
            </p>
            <Button size="sm" icon={RotateCcw} onClick={() => check(true)} loading={busy}>
              {t('common.actions.retry')}
            </Button>
          </Alert>
        )
      ) : null}

      {/* the hint opens in the button row, beside its button (on its own line above them when narrow) */}
      <div className="qz-nav">
        {hint && !reviewing ? (
          <>
            <Button className="qz-hint-toggle" icon={Lightbulb} aria-expanded={hintOpen} aria-controls={hintBoxId} title={t('quiz.view.hintShow')} onClick={toggleHint}>
              <span className="qz-hint-label">{t('quiz.view.hintShow')}</span>
            </Button>
            <div ref={hintRef} id={hintBoxId} className="qz-hint" hidden={!hintOpen}>
              <Lightbulb aria-hidden="true" />
              <div className="qz-hint-text">
                <RichText text={hint} />
              </div>
            </div>
          </>
        ) : null}
        <div className="qz-nav-steps">
          <Button className="qz-prev" onClick={() => go(current - 1)} disabled={current === 0}>
            {t('quiz.view.prev')}
          </Button>
          {!isLast ? (
            <Button variant={reviewing ? undefined : 'primary'} className="qz-next" onClick={() => go(current + 1)}>
              {t('quiz.view.next')}
            </Button>
          ) : reviewing ? (
            <Button icon={RotateCcw} onClick={restart}>
              {t('quiz.result.retry')}
            </Button>
          ) : (
            <Button variant="primary" icon={CircleCheck} loading={busy} onClick={() => check(false)}>
              {busy ? t('quiz.view.checking') : t('quiz.view.check')}
            </Button>
          )}
        </div>
      </div>

      <p className="visually-hidden" aria-live="polite">
        {announce}
      </p>
    </div>
  )
}

/** The score: large in mint ink, then what to do next (look again at the misses first). */
const ResultSummary = forwardRef(function ResultSummary({ result, shared, phase, name, missed, onReviewMissed, onRestart }, ref) {
  const { t, fmt } = useT()
  const headingId = useId()
  const tier = scoreTier(result.score, result.total)
  const ratio = result.total ? result.score / result.total : 0
  return (
    <section className={`qz-summary is-${tier}`} aria-labelledby={headingId}>
      {/* the heading reads as a sentence; what the eye sees is the score set large */}
      <h3 id={headingId} ref={ref} tabIndex={-1} className="qz-summary-title">
        <span className="visually-hidden">
          {t('quiz.result.score', { score: result.score, total: result.total })} ({fmt.percent(ratio)})
        </span>
        <span className="qz-score" aria-hidden="true">
          <span className="qz-score-value">{result.score}</span>
          <span className="qz-score-total">/{result.total}</span>
        </span>
        <span className="qz-score-label" aria-hidden="true">
          {t('quiz.result.scoreLabel')}
        </span>
      </h3>
      <div className="qz-summary-body">
        {phase !== 'practice' ? <p className="qz-summary-phase">{t(`quiz.view.phase.${phase}`)}</p> : null}
        <p className="qz-summary-msg">{t(`quiz.result.tier.${tier}`)}</p>
        {/* on a slide the score is one line: a few words instead of the full sentence */}
        <p className="qz-summary-short">{t(`quiz.result.tierShort.${tier}`)}</p>
        <div className="qz-summary-actions">
          {missed >= 0 ? (
            <Button variant="primary" icon={SearchCheck} className="qz-review-missed" onClick={onReviewMissed}>
              {t('quiz.result.reviewMissed')}
            </Button>
          ) : null}
          <Button icon={RotateCcw} onClick={onRestart}>
            {t('quiz.result.retry')}
          </Button>
        </div>
        <p className="qz-summary-note">
          {shared ? (name ? t('quiz.result.savedNamed', { name }) : t('quiz.result.saved')) : t('quiz.result.previewNote')}
          {missed < 0 ? (
            <>
              {' '}
              <span>{t('quiz.result.reviewBelow')}</span>
            </>
          ) : null}
        </p>
      </div>
    </section>
  )
})

function QuestionCard({ question, headId, groupName, value, onChange, locked, review, given, onAnnounce, footer = null }) {
  const { t } = useT()
  const promptId = useId()
  const howId = useId()
  const kind = KINDS.includes(question.kind) ? question.kind : 'mcq'
  const choice = kind === 'mcq' || kind === 'truefalse'
  const context = textOf(question.context)
  // read by the deck styles only: a short stem and short answers go a size up on a slide
  const sizes = deckSizes(question)

  // the question (situation, stem, answers) and, after checking, the verdict beside it on a wide slide
  return (
    <article
      className={['qz-card', `is-${kind}`, locked ? 'is-review' : ''].filter(Boolean).join(' ')}
      data-stem={sizes.stem}
      data-answers={sizes.answers}
      aria-labelledby={headId}
    >
      <div className="qz-card-main">
        <div className="qz-ask">
          {context ? (
            <div className="qz-context">
              <RichText text={context} />
            </div>
          ) : null}
          <div id={promptId} className="qz-prompt">
            <RichText text={question.prompt} />
          </div>
          {!locked ? (
            <p id={howId} className={['qz-how', choice ? 'is-choice' : ''].filter(Boolean).join(' ')}>
              {t(`quiz.view.how.${kind}`)}
            </p>
          ) : null}
        </div>
        {choice ? (
          <ChoiceAnswer question={question} name={groupName} value={value} onChange={onChange} locked={locked} review={review} given={given} promptId={promptId} howId={howId} />
        ) : kind === 'order' ? (
          <OrderAnswer question={question} value={value} onChange={onChange} locked={locked} review={review} given={given} promptId={promptId} howId={howId} onAnnounce={onAnnounce} />
        ) : kind === 'numeric' ? (
          <NumericAnswer question={question} value={value} onChange={onChange} locked={locked} given={given} howId={howId} />
        ) : null}
        {/* the last question carries the name field and the privacy note (under the question on an order slide) */}
        {footer}
      </div>
      {locked ? <Feedback question={question} review={review} given={given} /> : null}
    </article>
  )
}

function ChoiceAnswer({ question, name, value, onChange, locked, review, given, promptId, howId }) {
  const { t } = useT()
  const uid = useId()
  const reducedMotion = useReducedMotion()
  const [othersOpen, setOthersOpen] = useState(false)
  const othersToggle = useRef(null)

  // the lines open above the toggle and push it down: keep it (and them) in view
  useEffect(() => {
    if (othersOpen) revealAboveNav(othersToggle.current, reducedMotion)
  }, [othersOpen, reducedMotion])
  const tf = question.kind === 'truefalse'
  const labels = tf ? [t('quiz.view.true'), t('quiz.view.false')] : question.options || []
  const chosen = locked ? given : value
  const correctIndex = review && Number.isInteger(review.correct_answer) ? review.correct_answer : null
  // why each option is right or not: only after checking, under the pick and the right one;
  // the rest wait behind a disclosure so the review stays short
  const feedback = review ? reviewFeedback(question, review) : []
  const isOther = (i) => i !== chosen && i !== correctIndex
  const others = labels.map((_, i) => i).filter((i) => isOther(i) && feedback[i])
  const whyId = (i) => `${uid}-why-${i}`
  return (
    <>
      <div
        role="radiogroup"
        aria-labelledby={promptId}
        aria-describedby={locked ? undefined : howId}
        className={['qz-options', tf ? 'is-tf' : '', locked ? 'is-review' : ''].filter(Boolean).join(' ')}
      >
        {labels.map((label, i) => {
          const selected = chosen === i
          const right = correctIndex === i
          const wrongPick = Boolean(review) && selected && !right
          const letter = tf ? (i === 0 ? t('quiz.view.trueShort') : t('quiz.view.falseShort')) : optionLetter(i)
          const why = feedback[i] || ''
          return (
            <label
              key={i}
              className={['qz-option', selected ? 'is-selected' : '', right ? 'is-right' : '', wrongPick ? 'is-wrong' : '', locked ? 'is-locked' : '']
                .filter(Boolean)
                .join(' ')}
            >
              <input type="radio" name={name} value={i} checked={selected} disabled={locked} onChange={() => onChange(i)} />
              <span className="qz-letter" aria-hidden="true">
                {letter}
              </span>
              {/* the option, then (after checking) its verdict and why: one column, full width */}
              <span className="qz-option-main">
                <span className="qz-option-text">{tf ? label : <RichText text={label} />}</span>
                {right ? (
                  <span className="qz-tag is-right">
                    <CircleCheck aria-hidden="true" />
                    {selected ? t('quiz.view.tagRightPicked') : t('quiz.view.tagRight')}
                  </span>
                ) : null}
                {wrongPick ? (
                  <span className="qz-tag is-wrong">
                    <CircleX aria-hidden="true" />
                    {t('quiz.view.tagWrongPick')}
                  </span>
                ) : null}
                {why ? (
                  <span id={whyId(i)} className="qz-option-why" hidden={isOther(i) && !othersOpen}>
                    <RichText text={why} />
                  </span>
                ) : null}
              </span>
            </label>
          )
        })}
      </div>
      {others.length ? (
        <Button
          ref={othersToggle}
          variant="ghost"
          className="qz-others-toggle"
          iconEnd={ChevronDown}
          aria-expanded={othersOpen}
          aria-controls={others.map(whyId).join(' ')}
          onClick={() => setOthersOpen((open) => !open)}
        >
          {t('quiz.view.othersShow', { count: others.length })}
        </Button>
      ) : null}
    </>
  )
}

function OrderAnswer({ question, value, onChange, locked, review, given, promptId, howId, onAnnounce }) {
  const { t } = useT()
  const options = question.options || []
  const start = useMemo(() => initialArrangement(question), [question])
  const arrangement = locked ? (Array.isArray(given) ? given : start) : Array.isArray(value?.order) ? value.order : start
  const correct = review && Array.isArray(review.correct_answer) ? review.correct_answer : null
  const marks = correct ? positionMarks(arrangement, correct) : null
  const controls = useRef({})
  const focusTarget = useRef(null)
  const count = arrangement.length

  useLayoutEffect(() => {
    if (!focusTarget.current) return
    const { item, which } = focusTarget.current
    focusTarget.current = null
    const set = controls.current[item] || {}
    const target = set[which] && !set[which].disabled ? set[which] : set.handle
    target?.focus({ preventScroll: true })
  })

  const move = (position, delta, which) => {
    const to = position + delta
    if (locked || to < 0 || to >= count) return
    const item = arrangement[position]
    onChange({ order: moveItem(arrangement, position, to), moved: true })
    focusTarget.current = { item, which }
    onAnnounce(t('quiz.view.moved', { item: spoken(options[item]), pos: to + 1, total: count }))
  }

  const bind = (item, which) => (el) => {
    controls.current[item] = { ...(controls.current[item] || {}), [which]: el }
  }

  return (
    <ol className="qz-order" aria-labelledby={promptId} aria-describedby={locked ? undefined : howId}>
      {arrangement.map((item, position) => {
        const label = options[item] ?? ''
        const mark = marks ? (marks[position] ? 'is-right' : 'is-wrong') : ''
        return (
          <li key={item} className={['qz-order-item', mark].filter(Boolean).join(' ')}>
            <span className="qz-order-pos" aria-hidden="true">
              {position + 1}
            </span>
            {/* an item is set like an MCQ option: its math and bold render, as everywhere else */}
            {locked ? (
              <span className="qz-order-label">
                <span className="visually-hidden">{t('quiz.view.positionSr', { pos: position + 1, total: count })} </span>
                <RichText text={label} />
              </span>
            ) : (
              <button
                ref={bind(item, 'handle')}
                type="button"
                className="qz-order-handle"
                aria-describedby={howId}
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
                <span className="qz-order-label">
                  <span className="visually-hidden">{t('quiz.view.positionSr', { pos: position + 1, total: count })} </span>
                  <RichText text={label} />
                </span>
              </button>
            )}
            {marks ? (
              marks[position] ? (
                <CircleCheck className="qz-mark lk-good" role="img" aria-label={t('quiz.view.rightPlace')} />
              ) : (
                <CircleX className="qz-mark lk-bad" role="img" aria-label={t('quiz.view.wrongPlace')} />
              )
            ) : null}
            {!locked ? (
              <span className="qz-order-tools">
                <IconButton
                  ref={bind(item, 'up')}
                  icon={ArrowUp}
                  bordered
                  label={t('quiz.view.moveUp', { item: spoken(label) })}
                  disabled={position === 0}
                  onClick={() => move(position, -1, 'up')}
                />
                <IconButton
                  ref={bind(item, 'down')}
                  icon={ArrowDown}
                  bordered
                  label={t('quiz.view.moveDown', { item: spoken(label) })}
                  disabled={position === count - 1}
                  onClick={() => move(position, 1, 'down')}
                />
              </span>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

function NumericAnswer({ question, value, onChange, locked, given, howId }) {
  const { t, fmt } = useT()
  const id = useId()
  const errorId = `${id}-error`
  const [touched, setTouched] = useState(false)
  const unit = String(question.unit || '').trim()
  const text = locked ? (toNumber(given) === null ? '' : fmt.number(given, 6)) : value ?? ''
  const invalid = !locked && touched && text.trim() !== '' && !isAnswered(question, text)
  return (
    <div className="field qz-numeric">
      <label className="field-label" htmlFor={id}>
        {t('quiz.view.yourAnswer')}
        {unit ? <span className="visually-hidden"> ({t('quiz.view.unitSr', { unit })})</span> : null}
      </label>
      <div className="qz-numeric-row">
        <input
          id={id}
          className="input qz-numeric-input"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          placeholder={locked ? t('quiz.view.noAnswer') : undefined}
          value={text}
          disabled={locked}
          aria-invalid={invalid ? 'true' : undefined}
          aria-describedby={[locked ? null : howId, invalid ? errorId : null].filter(Boolean).join(' ') || undefined}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => setTouched(true)}
        />
        {unit ? (
          <span className="qz-unit" aria-hidden="true">
            {unit}
          </span>
        ) : null}
      </div>
      {invalid ? (
        <span className="field-error" id={errorId}>
          <CircleAlert size={16} aria-hidden="true" />
          {t('quiz.view.numberInvalid')}
        </span>
      ) : null}
    </div>
  )
}

function Feedback({ question, review, given }) {
  const { t } = useT()
  if (!review) {
    return (
      <Alert tone="neutral" title={t('quiz.view.unscoredTitle')}>
        {t('quiz.view.unscoredBody')}
      </Alert>
    )
  }
  const right = Boolean(review.correct)
  const explanation = String(review.explanation || question.explanation || '').trim()
  const unanswered = given === null || given === undefined
  return (
    <div className={['qz-feedback', right ? 'is-right' : 'is-wrong'].join(' ')}>
      <p className="qz-feedback-title">
        {right ? <CircleCheck aria-hidden="true" /> : <CircleX aria-hidden="true" />}
        {right ? t('quiz.view.right') : unanswered ? t('quiz.view.unanswered') : t('quiz.view.wrong')}
      </p>
      {!right ? <CorrectAnswer question={question} review={review} /> : null}
      {explanation ? (
        <div className="qz-explain">
          <h4 className="qz-explain-title">{t('quiz.view.explanation')}</h4>
          <RichText text={explanation} />
        </div>
      ) : null}
      {question.source_refs?.length ? <SourceRefChips refs={question.source_refs} label={t('quiz.view.sourcesLabel')} /> : null}
    </div>
  )
}

/**
 * The accepted margin of a numeric question, when it is known: from the marking result, or from
 * the question when it carries its key (studio preview). Learner payloads have no tolerance, and
 * guessing the 2 % default there could tell the learner something untrue.
 */
function knownTolerance(question, review) {
  if (review && review.tolerance !== undefined) return { tolerance: review.tolerance }
  if (question && Object.prototype.hasOwnProperty.call(question, 'tolerance')) return { tolerance: question.tolerance }
  return null
}

function CorrectAnswer({ question, review }) {
  const { t, fmt } = useT()
  const answer = review.correct_answer
  const kind = question.kind || 'mcq'
  const options = question.options || []
  // the options as the question showed them: math and bold rendered, not their marks
  if ((kind === 'mcq' || kind === 'truefalse') && Number.isInteger(answer)) {
    const text = kind === 'truefalse' ? (answer === 0 ? t('quiz.view.true') : t('quiz.view.false')) : `${optionLetter(answer)}. ${options[answer] ?? ''}`
    return (
      <div className="qz-correct">
        <RichText text={t('quiz.view.correctIs', { answer: text })} />
      </div>
    )
  }
  if (kind === 'order' && Array.isArray(answer)) {
    return (
      <div className="qz-correct">
        <p className="qz-correct-lead">{t('quiz.view.correctOrder')}</p>
        <ol className="qz-answer-list">
          {answer.map((item, i) => (
            <li key={`${item}-${i}`}>
              <RichText text={options[item] ?? ''} />
            </li>
          ))}
        </ol>
      </div>
    )
  }
  if (kind === 'numeric' && toNumber(answer) !== null) {
    const unit = String(question.unit || '').trim()
    const value = unit ? `${fmt.number(answer, 6)} ${unit}` : fmt.number(answer, 6)
    const margin = knownTolerance(question, review)
    return (
      <p className="qz-correct">
        {t('quiz.view.correctIs', { answer: value })}
        {Number(answer) === 0 || margin ? (
          <>
            {' '}
            <span className="qz-correct-note">
              {Number(answer) === 0 ? t('quiz.view.toleranceExact') : t('quiz.view.tolerance', { pct: fmt.percent(effectiveTolerance(margin), 1) })}
            </span>
          </>
        ) : null}
      </p>
    )
  }
  return null
}
