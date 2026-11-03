import { useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, Check, CircleCheck, CircleHelp, Lightbulb, Play, RotateCcw, Sparkles, TriangleAlert, X } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { post } from '../../lib/api.js'
import { AIBadge, Button, ErrorMessage, IconButton, RichText, TextArea } from '../../components/ui/index.js'
import { useBlockEnv } from '../blocks/BlockEnv.jsx'
import { SourceRefChips } from '../sources/SourceRefChips.jsx'
import { direction, percentChange } from './paramUtils.js'

export const AL_STEPS = ['predict', 'change', 'run', 'compare', 'explain']

/**
 * Active learning (spec §10.2): predict → change → run → compare → explain.
 *
 * Props
 *  config      { question, param, from_value, to_value, observe, options[], correct_option, explanation, auto }
 *  paramText   label of the changed parameter, e.g. "Chiều dài dây (L)"
 *  formatParam (value) → "1 m"
 *  observeText label of the observed quantity, e.g. "chu kỳ T"
 *  observed    { before, after } numbers (computed by the block from its model)
 *  formatObserved (value) → "2,01 s"
 *  onApply()   show the change in the interactive (scenario A = from, B = to)
 *  onRun()     optional: start the animation (simulations)
 *  sourceRefs  citations shown with the explanation
 *  explainSlot optional node (e.g. <ExplainChange/>) when no teacher explanation exists
 *  onProgress({ step, prediction }) for the AI tutor context; onClose()
 */
export function ActiveLearningPanel({ blockId, config, paramText, formatParam, observeText, observed, formatObserved, onApply, onRun, sourceRefs = [], explainSlot, onProgress, onClose, focusOnMount = false }) {
  const { t, fmt } = useT()
  const env = useBlockEnv()
  const uid = useId().replace(/[:]/g, '')
  const headingRef = useRef(null)
  const [step, setStep] = useState(0)
  const shownStep = useRef(step)
  const [choice, setChoice] = useState(null)
  const [text, setText] = useState('')
  const [reasoning, setReasoning] = useState('')
  const [feedback, setFeedback] = useState({ status: 'idle', text: '', correct: null, error: null })
  const [selfCheck, setSelfCheck] = useState(null)
  const abortRef = useRef(null)

  const options = (config.options || []).filter((o) => String(o || '').trim())
  const hasOptions = options.length >= 2
  const hasKey = hasOptions && Number.isInteger(config.correct_option) && config.correct_option >= 0 && config.correct_option < options.length
  const predictionText = hasOptions ? (choice !== null ? options[choice] : '') : text.trim()
  const canLock = hasOptions ? choice !== null : text.trim().length >= 2
  const stepName = AL_STEPS[step]
  const dir = direction(observed?.before, observed?.after)
  const pct = percentChange(observed?.before, observed?.after)
  const feedbackPath = env.aiPath ? env.aiPath('prediction-feedback') : null
  const aiFeedback = !hasKey && env.aiAvailable && Boolean(feedbackPath)

  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => {
    onProgress?.({ step: stepName, prediction: step > 0 ? predictionText : null })
    // Move focus only when the step really changed. A "first render" flag is not enough: React
    // StrictMode runs this effect twice on mount, and the heading would steal focus from the page.
    if (shownStep.current === step) {
      // just mounted: take focus only when the learner opened the challenge (not the lesson on load)
      if (focusOnMount) headingRef.current?.focus()
      return
    }
    shownStep.current = step
    headingRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const askFeedback = async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setFeedback({ status: 'loading', text: '', correct: null, error: null })
    try {
      const res = await post(
        feedbackPath,
        {
          block_id: blockId,
          prediction: predictionText.slice(0, 1000),
          observed: {
            question: config.question || '',
            param: config.param,
            from_value: config.from_value,
            to_value: config.to_value,
            observe: config.observe,
            before: observed?.before ?? null,
            after: observed?.after ?? null,
            direction: dir,
          },
          reasoning: reasoning.trim() ? reasoning.trim().slice(0, 1500) : null,
        },
        { signal: controller.signal },
      )
      setFeedback({ status: 'done', text: String(res?.feedback || ''), correct: typeof res?.correct === 'boolean' ? res.correct : null, error: null })
    } catch (error) {
      if (error?.name === 'AbortError') return
      setFeedback({ status: 'error', text: '', correct: null, error })
    }
  }

  const goCompare = () => {
    setStep(3)
    if (aiFeedback && feedback.status === 'idle') askFeedback()
  }

  const restart = () => {
    abortRef.current?.abort()
    setStep(0)
    setChoice(null)
    setText('')
    setReasoning('')
    setSelfCheck(null)
    setFeedback({ status: 'idle', text: '', correct: null, error: null })
  }

  const fmtObs = (v) => (v === null || v === undefined || !Number.isFinite(v) ? t('sim.view.noValue') : formatObserved(v))

  return (
    <section className="ix-al" aria-labelledby={`${uid}-title`}>
      <div className="ix-al-head">
        <h3 id={`${uid}-title`} className="ix-heading">
          <Lightbulb aria-hidden="true" />
          {t('sim.active.title')}
        </h3>
        {onClose ? <IconButton icon={X} label={t('sim.active.close')} size="sm" onClick={onClose} /> : null}
      </div>
      <ol className="ix-al-steps" aria-label={t('sim.active.progress')}>
        {AL_STEPS.map((name, i) => (
          <li key={name} aria-current={i === step ? 'step' : undefined} className={i < step ? 'done' : undefined}>
            <span className="n" aria-hidden="true">
              {i < step ? <Check /> : i + 1}
            </span>
            <span className="ix-al-step-name">{t(`sim.active.steps.${name}`)}</span>
            {i < step ? <span className="visually-hidden"> ({t('sim.active.stepDone')})</span> : null}
          </li>
        ))}
      </ol>

      <div className="ix-al-body">
        {stepName === 'predict' ? (
          <>
            <h3 ref={headingRef} tabIndex={-1}>
              {t('sim.active.predictTitle')}
            </h3>
            {config.question ? <RichText text={config.question} /> : null}
            {config.auto ? <p className="small muted">{t('sim.active.autoNote')}</p> : null}
            {hasOptions ? (
              <fieldset className="ix-options">
                <legend>{t('sim.active.chooseOption')}</legend>
                {options.map((opt, i) => (
                  <label key={i} className="ix-option">
                    <input type="radio" name={`${uid}-opt`} checked={choice === i} onChange={() => setChoice(i)} />
                    <span>{opt}</span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <TextArea label={t('sim.active.freeTextLabel')} rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
            )}
            <TextArea label={t('sim.active.reasoningLabel')} hint={t('sim.active.reasoningHint')} rows={2} maxLength={1500} value={reasoning} onChange={(e) => setReasoning(e.target.value)} />
            <div className="ix-toolbar">
              <Button variant="primary" disabled={!canLock} onClick={() => setStep(1)}>
                {t('sim.active.lockPrediction')}
              </Button>
              {!canLock ? <span className="ix-sub">{hasOptions ? t('sim.active.pickFirst') : t('sim.active.writeFirst')}</span> : null}
            </div>
          </>
        ) : null}

        {stepName === 'change' ? (
          <>
            <h3 ref={headingRef} tabIndex={-1}>
              {t('sim.active.changeTitle')}
            </h3>
            <p className="ix-change">
              <span>{paramText}</span>
              <span className="ix-pill">{formatParam(config.from_value)}</span>
              <ArrowRight className="arrow" aria-label={t('sim.active.to')} />
              <span className="ix-pill">{formatParam(config.to_value)}</span>
            </p>
            <p className="ix-sub">{t('sim.active.changeHint')}</p>
            <div className="ix-toolbar">
              <Button
                variant="primary"
                onClick={() => {
                  onApply?.()
                  setStep(2)
                }}
              >
                {t('sim.active.apply')}
              </Button>
            </div>
          </>
        ) : null}

        {stepName === 'run' ? (
          <>
            <h3 ref={headingRef} tabIndex={-1}>
              {t('sim.active.runTitle')}
            </h3>
            {onRun ? (
              <div className="ix-toolbar">
                <Button icon={Play} onClick={onRun}>
                  {t('sim.active.run')}
                </Button>
                <span className="ix-sub">{t('sim.active.runHint')}</span>
              </div>
            ) : (
              <p className="ix-sub">{t('sim.active.lookHint')}</p>
            )}
            <div className="ix-observed" aria-live="polite">
              <p>
                <strong>{observeText}</strong>
              </p>
              <p className="ix-change">
                <span className="ix-pill">{fmtObs(observed?.before)}</span>
                <ArrowRight className="arrow" aria-label={t('sim.active.to')} />
                <span className="ix-pill">{fmtObs(observed?.after)}</span>
                {dir ? (
                  <span className="badge badge-info">
                    {t(`sim.active.dir.${dir}`)}
                    {pct !== null && dir !== 'same' ? ` ${pct > 0 ? '+' : '−'}${fmt.number(Math.abs(pct), Math.abs(pct) < 10 ? 1 : 0)}%` : ''}
                  </span>
                ) : null}
              </p>
              {observed?.before === null || observed?.after === null ? <p className="ix-sub">{t('sim.active.noObserved')}</p> : null}
            </div>
            <div className="ix-toolbar">
              <Button variant="primary" onClick={goCompare}>
                {t('sim.active.toCompare')}
              </Button>
            </div>
          </>
        ) : null}

        {stepName === 'compare' ? (
          <>
            <h3 ref={headingRef} tabIndex={-1}>
              {t('sim.active.compareTitle')}
            </h3>
            <p className="ix-prediction">
              <span className="muted">{t('sim.active.yourPrediction')} </span>
              <strong>{predictionText}</strong>
            </p>
            {hasKey ? (
              choice === config.correct_option ? (
                <div className="ix-verdict good" role="status">
                  <CircleCheck aria-hidden="true" />
                  <div>
                    <strong>{t('sim.active.correct')}</strong>
                    <div>{t('sim.active.correctMore')}</div>
                  </div>
                </div>
              ) : (
                <div className="ix-verdict retry" role="status">
                  <TriangleAlert aria-hidden="true" />
                  <div>
                    <strong>{t('sim.active.incorrect')}</strong>
                    <div>{t('sim.active.correctAnswer', { answer: options[config.correct_option] })}</div>
                    <ChoiceWhy config={config} choice={choice} options={options} observeText={observeText} observed={observed} dir={dir} format={fmtObs} />
                  </div>
                </div>
              )
            ) : aiFeedback ? (
              <div className="stack-sm">
                {feedback.status === 'loading' ? (
                  <p className="ix-sub" role="status">
                    {t('sim.active.feedbackLoading')}
                  </p>
                ) : null}
                {feedback.status === 'error' ? <ErrorMessage error={feedback.error} onRetry={askFeedback} /> : null}
                {feedback.status === 'done' ? (
                  <div className={`ix-verdict ${feedback.correct === true ? 'good' : feedback.correct === false ? 'retry' : 'neutral'}`} role="status">
                    {feedback.correct === true ? <CircleCheck aria-hidden="true" /> : feedback.correct === false ? <TriangleAlert aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
                    <div className="stack-sm">
                      <AIBadge label={t('sim.active.aiFeedbackLabel')} />
                      <RichText text={feedback.text} />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="stack-sm">
                <p className="ix-prediction">{t('sim.active.selfCheck')}</p>
                <div className="ix-toolbar" role="group" aria-label={t('sim.active.selfCheck')}>
                  <Button size="sm" aria-pressed={selfCheck === 'same'} onClick={() => setSelfCheck('same')}>
                    {t('sim.active.same')}
                  </Button>
                  <Button size="sm" aria-pressed={selfCheck === 'different'} onClick={() => setSelfCheck('different')}>
                    {t('sim.active.different')}
                  </Button>
                </div>
                {selfCheck ? (
                  <div className={`ix-verdict ${selfCheck === 'same' ? 'good' : 'neutral'}`} role="status">
                    {selfCheck === 'same' ? <CircleCheck aria-hidden="true" /> : <CircleHelp aria-hidden="true" />}
                    <div>{selfCheck === 'same' ? t('sim.active.selfSame') : t('sim.active.selfDifferent')}</div>
                  </div>
                ) : null}
              </div>
            )}
            <div className="ix-toolbar">
              <Button variant="primary" onClick={() => setStep(4)}>
                {t('sim.active.toExplain')}
              </Button>
            </div>
          </>
        ) : null}

        {stepName === 'explain' ? (
          <>
            <h3 ref={headingRef} tabIndex={-1}>
              {t('sim.active.explainTitle')}
            </h3>
            {config.explanation ? (
              <RichText text={config.explanation} />
            ) : (
              <>
                <p className="ix-sub">{t('sim.active.noExplanation')}</p>
                {explainSlot}
              </>
            )}
            {sourceRefs.length ? <SourceRefChips refs={sourceRefs} /> : null}
            <div className="ix-toolbar">
              <Button icon={RotateCcw} onClick={restart}>
                {t('sim.active.restart')}
              </Button>
              {onClose ? (
                <Button variant="ghost" onClick={onClose}>
                  {t('sim.active.finish')}
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}

/**
 * Why the learner's choice differs from the result, when there is something to say it with:
 * the teacher's line for that option (`option_feedback`, one per option, when present), else
 * what the model itself shows for the observed quantity. Nothing when neither exists.
 */
function ChoiceWhy({ config, choice, options, observeText, observed, dir, format }) {
  const { t } = useT()
  const lines = Array.isArray(config.option_feedback) ? config.option_feedback : []
  const line = Number.isInteger(choice) && lines.length === options.length ? String(lines[choice] ?? '').trim() : ''
  if (line) {
    return (
      <div className="ix-verdict-why">
        <RichText text={line} />
      </div>
    )
  }
  const known = (v) => v !== null && v !== undefined && Number.isFinite(v)
  if (!dir || !known(observed?.before) || !known(observed?.after)) return null
  return (
    <div className="ix-verdict-why">
      {t('quiz.prediction.observedLead')} <strong>{observeText}</strong> {t(`quiz.prediction.${dir}`, { before: format(observed.before), after: format(observed.after) })}
    </div>
  )
}

/**
 * Automatic challenge when the teacher configured none: change `param` from→to and
 * predict whether `observe` goes up, down or stays the same. The correct option is
 * computed from the model itself (`observed`), never guessed.
 */
export function autoActiveConfig({ t, param, from, to, paramText, observe, observeText, observed }) {
  const dir = direction(observed?.before, observed?.after)
  const correct = dir === 'up' ? 0 : dir === 'down' ? 1 : dir === 'same' ? 2 : null
  return {
    enabled: true,
    auto: true,
    question: t('sim.active.autoQuestion', { param: paramText, from: from.text, to: to.text, observe: observeText }),
    param,
    from_value: from.value,
    to_value: to.value,
    observe,
    options: [t('sim.active.optUp'), t('sim.active.optDown'), t('sim.active.optSame')],
    correct_option: correct,
    explanation: '',
  }
}
