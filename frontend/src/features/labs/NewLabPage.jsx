import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChartLine, Check, CircleAlert, CircleHelp, Dumbbell, FlaskConical, ShieldCheck, Sparkles, Workflow } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { post } from '../../lib/api.js'
import { Alert, Button, ErrorMessage, Segmented, TextField } from '../../components/ui/index.js'
import { fieldErrorsFromApi } from '../account/formErrors.js'
import { useDocumentTitle } from '../public/hooks.js'
import {
  AI_MODES,
  HIGH_GRADES,
  SECONDARY_GRADES,
  SPACES,
  draftForSpace,
  goalsFor,
  labCreateBody,
  subjectIcon,
  subjectsFor,
  validateLabDraft,
} from './labOptions.js'
import './newlab.css'

const GOAL_ICONS = { understand_process: Workflow, view_graph: ChartLine, practice: Dumbbell, answer_questions: CircleHelp }
const FIELD_ORDER = ['title', 'subject', 'grade', 'topic']

function FieldError({ id, children }) {
  if (!children) return null
  return (
    <span className="field-error" id={id}>
      <CircleAlert size={16} aria-hidden="true" />
      {children}
    </span>
  )
}

/** Visually-hidden native radio + styled body (keyboard + screen-reader friendly). */
function Choice({ name, value, checked, onChange, children, className, inputRef, describedBy }) {
  return (
    <label className={['choice', className].filter(Boolean).join(' ')}>
      <input
        ref={inputRef}
        className="choice-input"
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        aria-describedby={describedBy}
      />
      <span className="choice-body">
        {children}
        <span className="choice-check" aria-hidden="true">
          <Check />
        </span>
      </span>
    </label>
  )
}

export default function NewLabPage() {
  const { t, lang } = useT()
  const { ai } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  useDocumentTitle(t('labs.new.metaTitle'))

  const preset = SPACES.includes(params.get('space')) ? params.get('space') : ''
  const [step, setStep] = useState(preset ? 2 : 1)
  const [draft, setDraft] = useState(() => ({
    ...draftForSpace(preset || 'school2lab', {}),
    space: preset,
    title: '',
    topic: '',
    language: lang,
    level: 'simple',
    ai_mode: AI_MODES.includes(ai?.default_mode) ? ai.default_mode : 'contributor',
  }))
  const [spaceError, setSpaceError] = useState('')
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState(null)
  const [busy, setBusy] = useState(false)
  const headingRef = useRef(null)
  const refs = { title: useRef(null), subject: useRef(null), grade: useRef(null), topic: useRef(null) }
  const shownStep = useRef(step)

  // Move focus to the step heading when the step changes (not on first load). Comparing with
  // the step last shown, not a first-render flag, keeps a re-run effect (React strict mode in
  // development) from focusing the heading on load.
  useEffect(() => {
    if (shownStep.current === step) return
    shownStep.current = step
    headingRef.current?.focus()
  }, [step])

  const update = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const chooseSpace = (space) => {
    setSpaceError('')
    setDraft((d) => draftForSpace(space, d))
  }
  const goToDetails = () => {
    if (!SPACES.includes(draft.space)) {
      setSpaceError(t('labs.new.errors.space'))
      return
    }
    setParams({ space: draft.space }, { replace: true })
    setStep(2)
  }

  const submit = async (event) => {
    event.preventDefault()
    const found = validateLabDraft(draft)
    const messages = Object.fromEntries(Object.entries(found).map(([field, key]) => [field, t(`labs.new.errors.${key}`)]))
    setErrors(messages)
    setApiError(null)
    if (found.space) {
      setStep(1)
      setSpaceError(t('labs.new.errors.space'))
      return
    }
    const first = FIELD_ORDER.find((field) => messages[field])
    if (first) {
      refs[first].current?.focus()
      return
    }
    setBusy(true)
    try {
      const lab = await post('/api/labs', labCreateBody(draft))
      navigate(`/app/labs/${lab.id}/sources`)
    } catch (error) {
      setBusy(false)
      const fields = fieldErrorsFromApi(error, {
        title: t('labs.new.errors.titleRequired'),
        subject: t('labs.new.errors.subjectRequired'),
        grade: t('labs.new.errors.gradeRequired'),
        topic: t('labs.new.errors.topicTooLong'),
      })
      setErrors(fields)
      const firstApi = FIELD_ORDER.find((field) => fields[field])
      if (firstApi) refs[firstApi].current?.focus()
      else setApiError(error)
    }
  }

  const school = draft.space === 'school2lab'
  const subjects = subjectsFor(draft.space)
  const goals = goalsFor(draft.space)

  return (
    <div className="container page new-lab">
      <header className="new-lab-header">
        <h1>{t('labs.new.title')}</h1>
        <p>{t('labs.new.lead')}</p>
      </header>

      <ol className="wizard-steps list-reset" aria-label={t('labs.new.stepsLabel')}>
        {[1, 2].map((n) => (
          <li key={n} className={[step === n && 'current', step > n && 'done'].filter(Boolean).join(' ')} aria-current={step === n ? 'step' : undefined}>
            {step > n ? (
              <button type="button" className="wizard-step-btn" onClick={() => setStep(n)}>
                <span className="wizard-num" aria-hidden="true">
                  <Check />
                </span>
                {t(`labs.new.steps.s${n}`)}
                <span className="visually-hidden"> ({t('labs.new.stepDone')})</span>
              </button>
            ) : (
              <span className="wizard-step-btn">
                <span className="wizard-num" aria-hidden="true">
                  {n}
                </span>
                {t(`labs.new.steps.s${n}`)}
              </span>
            )}
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <section className="wizard-panel" aria-labelledby="new-lab-step1">
          <h2 id="new-lab-step1" ref={headingRef} tabIndex={-1} className="wizard-title">
            {t('labs.new.spaceTitle')}
          </h2>
          <fieldset className="space-options" aria-describedby={spaceError ? 'space-error' : undefined}>
            <legend className="visually-hidden">{t('labs.new.spaceTitle')}</legend>
            {SPACES.map((space) => {
              const key = space === 'school2lab' ? 'school' : 'paper'
              return (
                <Choice key={space} name="space" value={space} checked={draft.space === space} onChange={chooseSpace} className={`space-option ${key}`}>
                  <span className="space-option-name">{t(`common.spaces.${space}`)}</span>
                  <span className="space-option-audience">{t(`labs.new.spaces.${key}.audience`)}</span>
                  <span className="space-option-list">
                    {['a', 'b', 'c'].map((item) => (
                      <span key={item}>{t(`labs.new.spaces.${key}.points.${item}`)}</span>
                    ))}
                  </span>
                </Choice>
              )
            })}
          </fieldset>
          <FieldError id="space-error">{spaceError}</FieldError>
          <div className="wizard-actions">
            <Button variant="primary" size="lg" onClick={goToDetails}>
              {t('common.actions.continue')}
            </Button>
          </div>
        </section>
      ) : (
        <form className="wizard-panel wizard-form" onSubmit={submit} noValidate aria-labelledby="new-lab-step2">
          <div className="wizard-form-head">
            <h2 id="new-lab-step2" ref={headingRef} tabIndex={-1} className="wizard-title">
              {t('labs.new.detailsTitle')}
            </h2>
            <span className="wizard-space-chip">
              {t(`common.spaces.${draft.space}`)}
              <button type="button" className="wizard-change" onClick={() => setStep(1)}>
                {t('labs.new.changeSpace')}
              </button>
            </span>
          </div>

          {apiError ? <ErrorMessage error={apiError} title={t('labs.new.createError')} /> : null}

          <div className="wizard-grid">
            <div className="stack">
              <TextField
                ref={refs.title}
                label={t('labs.new.fields.title')}
                placeholder={t(`labs.new.placeholders.${school ? 'school' : 'paper'}Title`)}
                hint={t('labs.new.hints.title')}
                value={draft.title}
                onChange={(e) => update({ title: e.target.value })}
                error={errors.title}
                required
                maxLength={160}
              />

              <fieldset className="choice-group" aria-describedby={errors.subject ? 'subject-error' : undefined}>
                <legend className="field-label">
                  {t('labs.new.fields.subject')} <span aria-hidden="true" className="req">*</span>
                  <span className="visually-hidden"> ({t('common.a11y.required')})</span>
                </legend>
                <div className="subject-choices">
                  {subjects.map((subject, index) => {
                    const Icon = subjectIcon(subject)
                    return (
                      <Choice
                        key={subject}
                        name="subject"
                        value={subject}
                        checked={draft.subject === subject}
                        onChange={(value) => update({ subject: value })}
                        className="subject-choice"
                        inputRef={index === 0 ? refs.subject : undefined}
                      >
                        <Icon aria-hidden="true" className="subject-choice-icon" />
                        <span className="subject-choice-name">{t(`common.subjects.${subject}`)}</span>
                      </Choice>
                    )
                  })}
                </div>
                <FieldError id="subject-error">{errors.subject}</FieldError>
              </fieldset>

              {school ? (
                <fieldset className="choice-group" aria-describedby={errors.grade ? 'grade-error' : undefined}>
                  <legend className="field-label">
                    {t('labs.new.fields.grade')} <span aria-hidden="true" className="req">*</span>
                    <span className="visually-hidden"> ({t('common.a11y.required')})</span>
                  </legend>
                  {[
                    { key: 'secondary', grades: SECONDARY_GRADES },
                    { key: 'high', grades: HIGH_GRADES },
                  ].map(({ key, grades }, groupIndex) => (
                    <div key={key} className="grade-group" role="group" aria-label={t(`labs.new.gradeGroups.${key}`)}>
                      <span className="grade-group-label" aria-hidden="true">
                        {t(`labs.new.gradeGroups.${key}`)}
                      </span>
                      <div className="grade-choices">
                        {grades.map((grade, index) => (
                          <Choice
                            key={grade}
                            name="grade"
                            value={grade}
                            checked={draft.grade === grade}
                            onChange={(value) => update({ grade: value })}
                            className="grade-choice"
                            inputRef={groupIndex === 0 && index === 0 ? refs.grade : undefined}
                          >
                            <span className="grade-choice-name">{t(`common.grades.${grade}`)}</span>
                          </Choice>
                        ))}
                      </div>
                    </div>
                  ))}
                  <FieldError id="grade-error">{errors.grade}</FieldError>
                </fieldset>
              ) : (
                <div className="field">
                  <span className="field-label">{t('labs.new.fields.grade')}</span>
                  <p className="fixed-value">{t('common.grades.university')}</p>
                </div>
              )}

              <TextField
                ref={refs.topic}
                label={`${t('labs.new.fields.topic')} (${t('common.states.optional').toLowerCase()})`}
                placeholder={t(`labs.new.placeholders.${school ? 'school' : 'paper'}Topic`)}
                hint={t('labs.new.hints.topic')}
                value={draft.topic}
                onChange={(e) => update({ topic: e.target.value })}
                error={errors.topic}
                maxLength={200}
              />
            </div>

            <div className="stack">
              <div className="field">
                <span className="field-label" id="lang-label">
                  {t('labs.new.fields.language')}
                </span>
                <Segmented
                  label={t('labs.new.fields.language')}
                  value={draft.language}
                  onChange={(value) => update({ language: value })}
                  options={[
                    { value: 'vi', label: t('common.language.vi') },
                    { value: 'en', label: t('common.language.en') },
                  ]}
                />
                <span className="field-hint">{t('labs.new.hints.language')}</span>
              </div>

              {school ? (
                <fieldset className="choice-group">
                  <legend className="field-label">{t('labs.new.fields.goal')}</legend>
                  <div className="goal-choices">
                    {goals.map((goal) => {
                      const Icon = GOAL_ICONS[goal] || Sparkles
                      return (
                        <Choice key={goal} name="goal" value={goal} checked={draft.goal === goal} onChange={(value) => update({ goal: value })} className="goal-choice">
                          <Icon aria-hidden="true" className="goal-icon" />
                          <span className="goal-text">
                            <span className="goal-name">{t(`common.goals.${goal}`)}</span>
                            <span className="goal-desc">{t(`labs.new.goalHints.${goal}`)}</span>
                          </span>
                        </Choice>
                      )
                    })}
                  </div>
                </fieldset>
              ) : (
                <div className="field">
                  <span className="field-label">{t('labs.new.fields.goal')}</span>
                  <p className="fixed-value">
                    <FlaskConical aria-hidden="true" />
                    {t('common.goals.explore_paper')}
                  </p>
                  <span className="field-hint">{t('labs.new.goalHints.explore_paper')}</span>
                </div>
              )}

              <div className="field">
                <span className="field-label">{t('labs.new.fields.level')}</span>
                <Segmented
                  label={t('labs.new.fields.level')}
                  value={draft.level}
                  onChange={(value) => update({ level: value })}
                  options={[
                    { value: 'simple', label: t('common.levels.simple') },
                    { value: 'detailed', label: t('common.levels.detailed') },
                  ]}
                />
                <span className="field-hint">{t(`labs.new.levelHints.${draft.level}`)}</span>
              </div>

              <fieldset className="choice-group">
                <legend className="field-label">{t('labs.new.fields.aiMode')}</legend>
                <div className="mode-choices">
                  {AI_MODES.map((mode) => (
                    <Choice key={mode} name="ai_mode" value={mode} checked={draft.ai_mode === mode} onChange={(value) => update({ ai_mode: value })} className="mode-choice">
                      <span className="mode-head">
                        {mode === 'standard' ? <ShieldCheck aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
                        <span className="mode-name">{t(`common.aiMode.${mode}`)}</span>
                      </span>
                      <span className="mode-desc">{t(`common.aiMode.${mode}Hint`)}</span>
                    </Choice>
                  ))}
                </div>
                <span className="field-hint">{t('labs.new.hints.aiMode')}</span>
              </fieldset>

              {ai && !ai.configured ? <Alert tone="warning">{t('labs.new.aiOff')}</Alert> : null}
            </div>
          </div>

          <aside className="wizard-next" aria-labelledby="wizard-next-title">
            <h3 id="wizard-next-title">{t('labs.new.nextTitle')}</h3>
            <ol className="list-reset">
              {(school ? ['sources', 'analyze', 'review', 'build', 'publish'] : ['sources', 'paper', 'build', 'publish']).map((key, i) => (
                <li key={key}>
                  <span className="wizard-next-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  {t(`studio.steps.${key}`)}
                </li>
              ))}
            </ol>
          </aside>

          <div className="wizard-actions">
            <Button icon={ArrowLeft} onClick={() => setStep(1)} disabled={busy}>
              {t('common.actions.back')}
            </Button>
            <Button type="submit" variant="primary" size="lg" loading={busy}>
              {busy ? t('labs.new.creating') : t('labs.new.create')}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
