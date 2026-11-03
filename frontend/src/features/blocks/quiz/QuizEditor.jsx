import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Calculator, CircleCheck, CircleDot, CircleHelp, CornerDownRight, ListChecks, ListOrdered, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { AIBadge, Alert, Badge, Button, ConfirmDialog, EmptyState, IconButton, SelectField, Switch, TextArea, TextField } from '../../../components/ui/index.js'
import { SourceRefChips } from '../../sources/SourceRefChips.jsx'
import { BlockMetaFields, EditorItem, NumberInput, SourceRefsEditor } from '../steps/LessonEditorKit.jsx'
import { useLatest, useReducedMotion } from '../steps/lessonHooks.js'
import { LIMITS, identity, moveItem } from '../steps/lessonKit.js'
import { QuizAiPanel } from './QuizAiPanel.jsx'
import {
  FEEDBACK_MAX,
  KINDS,
  LEVELS,
  addChoiceOption,
  alignFeedback,
  changeKind,
  hasContent,
  isAiQuestion,
  newQuestion,
  normalizeGenerated,
  optionLetter,
  orderedOptions,
  questionIssues,
  questionLevel,
  questionTitle,
  removeChoiceOption,
  setFeedbackLine,
  validPermutation,
} from './quizModel.js'
import { acceptedRange } from './quizScoring.js'
import '../steps/lesson.css'
import './quiz.css'

const KIND_ICONS = { mcq: CircleDot, truefalse: CircleHelp, order: ListOrdered, numeric: Calculator }
const safeKind = (kind) => (KINDS.includes(kind) ? kind : 'mcq')

/**
 * Teacher editor for a quiz block: write or generate questions, check answers and sources,
 * approve each question. Only approved questions are published to learners.
 */
export default function QuizEditor({ block, onChange }) {
  const { t } = useT()
  const questions = block.questions || []
  const listId = useId()
  const latest = useLatest(block)
  const reducedMotion = useReducedMotion()
  const [openId, setOpenId] = useState(() => (questions.find((q) => !q.approved) || questions[0])?.id ?? null)
  const [pendingRemove, setPendingRemove] = useState(null)
  const [approveAllOpen, setApproveAllOpen] = useState(false)
  const [status, setStatus] = useState('')
  const stash = useRef(new Map())
  const promptInputs = useRef({})
  const focusPrompt = useRef(null)
  const listHeading = useRef(null)

  useEffect(() => {
    const id = focusPrompt.current
    if (id && promptInputs.current[id]) {
      promptInputs.current[id].focus()
      focusPrompt.current = null
    }
  })

  const itemDomId = (qid) => `qz-${block.id}-${qid}`
  const setQuestions = (next) => onChange({ ...block, questions: next })
  const patchQuestion = (id, patch) => setQuestions(questions.map((q) => (q.id === id ? { ...q, ...patch } : q)))

  const addQuestion = () => {
    if (questions.length >= LIMITS.questions) return
    const question = newQuestion('mcq', questions.map((q) => q.id))
    setQuestions([...questions, question])
    setOpenId(question.id)
    focusPrompt.current = question.id
  }

  const removeQuestion = (id) => {
    setQuestions(questions.filter((q) => q.id !== id))
    stash.current.delete(id)
    if (openId === id) setOpenId(null)
    setStatus(t('quiz.edit.removed'))
    requestAnimationFrame(() => listHeading.current?.focus())
  }

  const switchKind = (question, kind) => {
    const { question: next, stash: saved } = changeKind(question, kind, stash.current.get(question.id) || {})
    stash.current.set(question.id, saved)
    setQuestions(questions.map((q) => (q.id === question.id ? next : q)))
  }

  // AI results arrive after a while: merge into the newest block, never a stale copy
  const appendGenerated = (raw) => {
    const current = latest.current
    const existing = current.questions || []
    const room = Math.max(0, LIMITS.questions - existing.length)
    const taken = new Set(existing.map((q) => q.id))
    const added = raw.slice(0, room).map((item) => normalizeGenerated(item, taken))
    if (added.length) {
      onChange({ ...current, questions: [...existing, ...added] })
      setOpenId(added[0].id)
    }
    return { added: added.length, dropped: Math.max(0, raw.length - added.length), firstId: added[0]?.id ?? null }
  }

  const revealQuestion = (id) => {
    setOpenId(id)
    requestAnimationFrame(() => {
      const el = document.getElementById(itemDomId(id))
      if (!el) return
      el.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' })
      el.querySelector('.lk-item-toggle')?.focus({ preventScroll: true })
    })
  }

  const approvedCount = questions.filter((q) => q.approved).length
  const approvedBroken = questions.filter((q) => q.approved && questionIssues(q).length).length
  const ready = questions.filter((q) => !q.approved && !questionIssues(q).length)
  const notReady = questions.filter((q) => !q.approved && questionIssues(q).length).length
  const aiReady = ready.filter(isAiQuestion).length

  const approveAll = () => {
    const ids = new Set(ready.map((q) => q.id))
    setQuestions(questions.map((q) => (ids.has(q.id) ? { ...q, approved: true } : q)))
    setApproveAllOpen(false)
    setStatus(t('quiz.edit.approveAllDone', { count: ids.size }))
  }

  const removeIndex = pendingRemove ? questions.findIndex((q) => q.id === pendingRemove.id) : -1

  return (
    <div className="lk-editor qz-editor">
      <BlockMetaFields block={block} onChange={onChange} />

      <Alert tone={approvedCount && !approvedBroken ? 'info' : 'warning'} title={t('quiz.edit.gateTitle')}>
        <p style={{ margin: 0 }}>{t('quiz.edit.gateBody')}</p>
        <p className="qz-gate-count">
          {questions.length ? t('quiz.edit.gateCount', { approved: approvedCount, count: questions.length }) : t('quiz.edit.gateEmpty')}
        </p>
        {approvedBroken ? <p className="qz-gate-count">{t('quiz.edit.gateBroken', { count: approvedBroken })}</p> : null}
      </Alert>

      <QuizAiPanel block={block} questionCount={questions.length} onGenerated={appendGenerated} onReveal={revealQuestion} />

      <section className="lk-section" aria-labelledby={listId}>
        <div className="qz-list-head">
          <h3 id={listId} ref={listHeading} tabIndex={-1} className="lk-section-title">
            <ListChecks aria-hidden="true" />
            {t('quiz.edit.listTitle', { count: questions.length })}
          </h3>
          {ready.length ? (
            <Button size="sm" icon={CircleCheck} onClick={() => setApproveAllOpen(true)}>
              {t('quiz.edit.approveAll', { count: ready.length })}
            </Button>
          ) : null}
        </div>
        {questions.length ? (
          <ol className="list-reset stack-sm">
            {questions.map((question, i) => {
              const issues = questionIssues(question)
              return (
                <EditorItem
                  key={question.id}
                  id={itemDomId(question.id)}
                  index={i}
                  count={questions.length}
                  title={questionTitle(question, 90)}
                  emptyTitle={t('quiz.edit.untitled', { n: i + 1 })}
                  itemName={t('quiz.edit.itemName', { n: i + 1 })}
                  open={openId === question.id}
                  onToggle={() => setOpenId(openId === question.id ? null : question.id)}
                  onMove={(delta) => setQuestions(moveItem(questions, i, i + delta))}
                  onRemove={() => (hasContent(question) ? setPendingRemove(question) : removeQuestion(question.id))}
                  flags={<QuestionFlags question={question} issues={issues} />}
                >
                  <QuestionFields
                    question={question}
                    issues={issues}
                    promptRef={(el) => {
                      promptInputs.current[question.id] = el
                    }}
                    onPatch={(patch) => patchQuestion(question.id, patch)}
                    onKind={(kind) => switchKind(question, kind)}
                  />
                </EditorItem>
              )
            })}
          </ol>
        ) : (
          <EmptyState icon={ListChecks} title={t('quiz.edit.emptyTitle')}>
            {t('quiz.edit.emptyBody')}
          </EmptyState>
        )}
        <Button icon={Plus} className="lk-add" onClick={addQuestion} disabled={questions.length >= LIMITS.questions}>
          {t('quiz.edit.addQuestion')}
        </Button>
        {questions.length >= LIMITS.questions ? <p className="lk-limit">{t('quiz.edit.limit', { max: LIMITS.questions })}</p> : null}
        <p className="visually-hidden" role="status">
          {status}
        </p>
      </section>

      <ConfirmDialog
        open={Boolean(pendingRemove)}
        onClose={() => setPendingRemove(null)}
        onConfirm={() => {
          if (pendingRemove) removeQuestion(pendingRemove.id)
          setPendingRemove(null)
        }}
        tone="danger"
        title={t('quiz.edit.removeTitle')}
        confirmLabel={t('common.actions.delete')}
      >
        <p style={{ margin: 0 }}>
          {t('quiz.edit.removeBody', { title: questionTitle(pendingRemove, 120) || t('quiz.edit.untitled', { n: removeIndex + 1 }) })}
        </p>
        {pendingRemove?.approved ? <p style={{ margin: '0.6rem 0 0' }}>{t('quiz.edit.removeApproved')}</p> : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={approveAllOpen}
        onClose={() => setApproveAllOpen(false)}
        onConfirm={approveAll}
        title={t('quiz.edit.approveAllTitle', { count: ready.length })}
        confirmLabel={t('quiz.edit.approveAllConfirm', { count: ready.length })}
      >
        <div className="stack-sm">
          <p style={{ margin: 0 }}>{t('quiz.edit.approveAllBody', { count: ready.length })}</p>
          {aiReady ? <p style={{ margin: 0 }}>{t('quiz.edit.approveAllAi', { count: aiReady })}</p> : null}
          {notReady ? <p className="muted" style={{ margin: 0 }}>{t('quiz.edit.approveAllSkipped', { count: notReady })}</p> : null}
        </div>
      </ConfirmDialog>
    </div>
  )
}

function QuestionFlags({ question, issues }) {
  const { t } = useT()
  const kind = safeKind(question.kind)
  const KindIcon = KIND_ICONS[kind]
  return (
    <>
      <Badge icon={KindIcon}>{t(`quiz.kinds.${kind}`)}</Badge>
      {isAiQuestion(question) && !question.approved ? <AIBadge /> : null}
      {question.approved ? (
        <Badge tone="success" icon={CircleCheck}>
          {t('quiz.edit.flagApproved')}
        </Badge>
      ) : null}
      {issues.length ? (
        <Badge tone="warning" icon={TriangleAlert}>
          {t('quiz.edit.flagIssues')}
        </Badge>
      ) : !question.approved ? (
        <Badge tone="outline">{t('quiz.edit.flagDraft')}</Badge>
      ) : null}
    </>
  )
}

function QuestionFields({ question, issues, promptRef, onPatch, onKind }) {
  const { t } = useT()
  const kind = safeKind(question.kind)
  return (
    <>
      <div className="qz-meta-fields">
        <SelectField
          label={t('quiz.edit.kind')}
          hint={t('quiz.edit.kindHint')}
          value={kind}
          options={KINDS.map((k) => ({ value: k, label: t(`quiz.kinds.${k}`) }))}
          onChange={(event) => onKind(event.target.value)}
        />
        <SelectField
          label={t('quiz.edit.level')}
          hint={t('quiz.edit.levelHint')}
          value={questionLevel(question) || ''}
          options={[{ value: '', label: t('quiz.edit.levelNone') }, ...LEVELS.map((level) => ({ value: level, label: t(`quiz.levels.${level}`) }))]}
          onChange={(event) => onPatch({ cognitive_level: LEVELS.includes(event.target.value) ? event.target.value : null })}
        />
      </div>
      <TextArea
        label={t('quiz.edit.context')}
        hint={t('quiz.edit.contextHint')}
        rows={2}
        maxLength={LIMITS.medium}
        value={question.context || ''}
        onChange={(event) => onPatch({ context: event.target.value })}
      />
      <TextArea
        ref={promptRef}
        label={t('quiz.edit.prompt')}
        hint={kind === 'truefalse' ? t('quiz.edit.promptHintTf') : t('quiz.edit.promptHint')}
        rows={3}
        maxLength={LIMITS.medium}
        value={question.prompt || ''}
        onChange={(event) => onPatch({ prompt: event.target.value })}
      />
      {kind === 'mcq' ? <McqEditor question={question} onPatch={onPatch} /> : null}
      {kind === 'truefalse' ? <TrueFalseEditor question={question} onPatch={onPatch} /> : null}
      {kind === 'order' ? <OrderEditor question={question} onPatch={onPatch} /> : null}
      {kind === 'numeric' ? <NumericEditor question={question} onPatch={onPatch} /> : null}
      <TextArea
        label={t('quiz.edit.hint')}
        hint={t('quiz.edit.hintHint')}
        rows={2}
        maxLength={LIMITS.medium}
        value={question.hint || ''}
        onChange={(event) => onPatch({ hint: event.target.value })}
      />
      <TextArea
        label={t('quiz.edit.explanation')}
        hint={t('quiz.edit.explanationHint')}
        rows={3}
        maxLength={LIMITS.medium}
        value={question.explanation || ''}
        onChange={(event) => onPatch({ explanation: event.target.value })}
      />
      <QuestionSources question={question} onPatch={onPatch} />
      <ApproveControl question={question} issues={issues} onPatch={onPatch} />
    </>
  )
}

/** Keeps keyboard focus on the same control after a row moves or disappears. */
function usePendingFocus() {
  const refs = useRef({})
  const pending = useRef(null)
  useLayoutEffect(() => {
    if (!pending.current) return
    const { key, fallback } = pending.current
    pending.current = null
    const el = refs.current[key]
    ;(el && !el.disabled ? el : refs.current[fallback])?.focus({ preventScroll: true })
  })
  const bind = (key) => (el) => {
    refs.current[key] = el
  }
  const focusLater = (key, fallback) => {
    pending.current = { key, fallback }
  }
  return { bind, focusLater }
}

function McqEditor({ question, onPatch }) {
  const { t } = useT()
  const name = useId()
  const options = question.options || []
  // one feedback line per option, kept in step with the options when they are added or removed
  const feedback = alignFeedback(question.option_feedback, options.length)
  const answer = Number.isInteger(question.answer_index) ? question.answer_index : null
  const { bind, focusLater } = usePendingFocus()

  const add = () => {
    if (options.length >= LIMITS.options) return
    focusLater(`input-${options.length}`)
    onPatch(addChoiceOption(question))
  }
  const remove = (i) => {
    const patch = removeChoiceOption(question, i)
    if (!patch.options) return
    focusLater(`input-${Math.min(i, patch.options.length - 1)}`)
    onPatch(patch)
  }

  return (
    <fieldset className="qz-fieldset">
      <legend className="field-label">{t('quiz.edit.optionsLegend')}</legend>
      <p className="lk-hint">{t('quiz.edit.optionsHint')}</p>
      <p className="lk-hint">{t('quiz.edit.feedbackHint')}</p>
      <ul className="qz-opt-list">
        {options.map((option, i) => {
          const letter = optionLetter(i)
          const correct = answer === i
          return (
            <li key={i} className={['qz-opt-row', 'has-feedback', correct ? 'is-correct' : ''].filter(Boolean).join(' ')}>
              {/* the letter itself is the "correct answer" radio */}
              <label className="qz-opt-key" title={t('quiz.edit.markCorrect', { letter })}>
                <input type="radio" name={name} checked={correct} onChange={() => onPatch({ answer_index: i })} />
                <span className="qz-opt-key-mark" aria-hidden="true">
                  {letter}
                </span>
                <span className="visually-hidden">{t('quiz.edit.markCorrect', { letter })}</span>
              </label>
              <input
                ref={bind(`input-${i}`)}
                className="input qz-opt-input"
                value={option ?? ''}
                maxLength={LIMITS.short}
                aria-label={correct ? `${t('quiz.edit.optionLabel', { letter })} (${t('quiz.edit.correctTag')})` : t('quiz.edit.optionLabel', { letter })}
                placeholder={t('quiz.edit.optionPlaceholder', { letter })}
                onChange={(event) => onPatch({ options: options.map((o, j) => (j === i ? event.target.value : o)) })}
              />
              <IconButton icon={Trash2} size="sm" label={t('quiz.edit.removeOption', { letter })} disabled={options.length <= 2} onClick={() => remove(i)} />
              <CornerDownRight className="qz-opt-feedback-mark" aria-hidden="true" />
              <input
                className="input qz-opt-feedback"
                value={feedback[i]}
                maxLength={FEEDBACK_MAX}
                aria-label={t('quiz.edit.feedbackLabel', { letter })}
                placeholder={correct ? t('quiz.edit.feedbackPlaceholderRight') : t('quiz.edit.feedbackPlaceholder')}
                onChange={(event) => onPatch(setFeedbackLine(question, i, event.target.value))}
              />
            </li>
          )
        })}
      </ul>
      <Button size="sm" icon={Plus} className="lk-add" disabled={options.length >= LIMITS.options} onClick={add}>
        {t('quiz.edit.addOption')}
      </Button>
      {options.length >= LIMITS.options ? <p className="lk-limit">{t('quiz.edit.optionsLimit', { max: LIMITS.options })}</p> : null}
    </fieldset>
  )
}

function TrueFalseEditor({ question, onPatch }) {
  const { t } = useT()
  const name = useId()
  const answer = question.answer_index
  const feedback = alignFeedback(question.option_feedback, 2)
  return (
    <>
      <fieldset className="qz-fieldset">
        <legend className="field-label">{t('quiz.edit.tfLegend')}</legend>
        <div className="qz-tf-edit">
          {[0, 1].map((i) => (
            <label key={i} className={['qz-tf-choice', answer === i ? 'is-correct' : ''].filter(Boolean).join(' ')}>
              <input type="radio" name={name} checked={answer === i} onChange={() => onPatch({ answer_index: i })} />
              <span>{i === 0 ? t('quiz.edit.tfTrue') : t('quiz.edit.tfFalse')}</span>
            </label>
          ))}
        </div>
        <p className="lk-hint">{t('quiz.edit.tfHint')}</p>
      </fieldset>
      {/* line 1 is shown to learners who answer True, line 2 to those who answer False */}
      <fieldset className="qz-fieldset">
        <legend className="field-label">{t('quiz.edit.tfFeedbackLegend')}</legend>
        <div className="qz-tf-feedback">
          {[0, 1].map((i) => (
            <TextField
              key={i}
              label={i === 0 ? t('quiz.edit.tfFeedbackTrue') : t('quiz.edit.tfFeedbackFalse')}
              value={feedback[i]}
              maxLength={FEEDBACK_MAX}
              placeholder={answer === i ? t('quiz.edit.feedbackPlaceholderRight') : t('quiz.edit.feedbackPlaceholder')}
              onChange={(event) => onPatch(setFeedbackLine(question, i, event.target.value))}
            />
          ))}
        </div>
      </fieldset>
    </>
  )
}

function OrderEditor({ question, onPatch }) {
  const { t } = useT()
  const items = orderedOptions(question)
  const broken = !validPermutation(question.answer_order, (question.options || []).length)
  const { bind, focusLater } = usePendingFocus()
  // the list on screen IS the correct order
  const commit = (next) => onPatch({ options: next, answer_order: identity(next.length) })

  const move = (i, delta, which) => {
    const to = i + delta
    if (to < 0 || to >= items.length) return
    focusLater(`${which}-${to}`, `input-${to}`)
    commit(moveItem(items, i, to))
  }
  const remove = (i) => {
    if (items.length <= 2) return
    const next = items.filter((_, j) => j !== i)
    focusLater(`input-${Math.min(i, next.length - 1)}`)
    commit(next)
  }
  const add = () => {
    if (items.length >= LIMITS.options) return
    focusLater(`input-${items.length}`)
    commit([...items, ''])
  }

  return (
    <fieldset className="qz-fieldset">
      <legend className="field-label">{t('quiz.edit.orderLegend')}</legend>
      <p className="lk-hint">{t('quiz.edit.orderHint')}</p>
      {broken ? <Alert tone="warning">{t('quiz.edit.orderBroken')}</Alert> : null}
      <ol className="qz-opt-list">
        {items.map((item, i) => (
          <li key={i} className="qz-opt-row">
            <span className="qz-opt-letter is-number" aria-hidden="true">
              {i + 1}
            </span>
            <input
              ref={bind(`input-${i}`)}
              className="input qz-opt-input"
              value={item ?? ''}
              maxLength={LIMITS.short}
              aria-label={t('quiz.edit.orderItemLabel', { n: i + 1 })}
              placeholder={t('quiz.edit.orderItemPlaceholder', { n: i + 1 })}
              onChange={(event) => commit(items.map((o, j) => (j === i ? event.target.value : o)))}
            />
            <span className="qz-opt-tools">
              <IconButton ref={bind(`up-${i}`)} icon={ArrowUp} size="sm" label={t('quiz.edit.orderUp', { n: i + 1 })} disabled={i === 0} onClick={() => move(i, -1, 'up')} />
              <IconButton
                ref={bind(`down-${i}`)}
                icon={ArrowDown}
                size="sm"
                label={t('quiz.edit.orderDown', { n: i + 1 })}
                disabled={i === items.length - 1}
                onClick={() => move(i, 1, 'down')}
              />
              <IconButton icon={Trash2} size="sm" label={t('quiz.edit.orderRemove', { n: i + 1 })} disabled={items.length <= 2} onClick={() => remove(i)} />
            </span>
          </li>
        ))}
      </ol>
      <Button size="sm" icon={Plus} className="lk-add" disabled={items.length >= LIMITS.options} onClick={add}>
        {t('quiz.edit.addOrderItem')}
      </Button>
      {items.length >= LIMITS.options ? <p className="lk-limit">{t('quiz.edit.optionsLimit', { max: LIMITS.options })}</p> : null}
    </fieldset>
  )
}

function NumericEditor({ question, onPatch }) {
  const { t, fmt } = useT()
  const range = acceptedRange(question)
  const unit = String(question.unit || '').trim()
  const tolerancePct = question.tolerance === null || question.tolerance === undefined ? null : Math.round(Number(question.tolerance) * 1_000_000) / 10_000
  return (
    <div className="stack-sm">
      <div className="lk-grid-3">
        <NumberInput label={t('quiz.edit.value')} value={question.answer_value} allowEmpty onCommit={(value) => onPatch({ answer_value: value })} />
        <NumberInput
          label={t('quiz.edit.tolerance')}
          hint={t('quiz.edit.toleranceHint')}
          value={tolerancePct}
          min={0.1}
          max={100}
          allowEmpty
          placeholder="2"
          onCommit={(value) => onPatch({ tolerance: value === null ? null : Math.round(value * 10_000) / 1_000_000 })}
        />
        <TextField
          label={t('quiz.edit.unit')}
          hint={t('quiz.edit.unitHint')}
          value={question.unit || ''}
          maxLength={LIMITS.unit}
          onChange={(event) => onPatch({ unit: event.target.value })}
        />
      </div>
      {range ? (
        <p className="lk-hint">
          {range.exact
            ? t('quiz.edit.rangeZero')
            : t('quiz.edit.range', { min: fmt.number(range.min, 4), max: fmt.number(range.max, 4), unit: unit ? ` ${unit}` : '', pct: fmt.percent(range.tolerance, 1) })}
        </p>
      ) : null}
    </div>
  )
}

function QuestionSources({ question, onPatch }) {
  const { t } = useT()
  const [editing, setEditing] = useState(false)
  const refs = question.source_refs || []
  return (
    <div className="qz-sources">
      <div className="qz-sources-head">
        {refs.length ? <SourceRefChips refs={refs} label={t('quiz.edit.sourcesLabel')} /> : <p className="lk-hint">{t('quiz.edit.noSources')}</p>}
        <Button size="sm" variant="ghost" icon={Pencil} aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
          {editing ? t('quiz.edit.closeSources') : t('quiz.edit.editSources')}
        </Button>
      </div>
      {editing ? (
        <SourceRefsEditor title={t('quiz.edit.sourcesTitle')} refs={refs} max={LIMITS.questionRefs} onChange={(source_refs) => onPatch({ source_refs })} />
      ) : null}
    </div>
  )
}

function ApproveControl({ question, issues, onPatch }) {
  const { t } = useT()
  const hintId = useId()
  const blocked = issues.length > 0
  const locked = blocked && !question.approved
  const ai = isAiQuestion(question)
  return (
    <div className={['qz-approve', question.approved ? 'is-on' : ''].filter(Boolean).join(' ')}>
      {blocked ? (
        <Alert tone="warning" title={question.approved ? t('quiz.edit.issuesApprovedTitle') : t('quiz.edit.issuesTitle')}>
          <ul className="qz-issues">
            {issues.map((code) => (
              <li key={code}>{t(`quiz.issues.${code}`)}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
      <div className="qz-approve-row">
        <Switch
          className={locked ? 'is-disabled' : undefined}
          label={t('quiz.edit.approveLabel')}
          checked={Boolean(question.approved)}
          disabled={locked}
          aria-describedby={hintId}
          onChange={(event) => onPatch({ approved: event.target.checked })}
        />
      </div>
      <p id={hintId} className="lk-hint">
        {question.approved ? t('quiz.edit.approvedHint') : locked ? t('quiz.edit.approveBlockedHint') : ai ? t('quiz.edit.approveHintAi') : t('quiz.edit.approveHint')}
      </p>
    </div>
  )
}
