import { useId } from 'react'
import { Lightbulb, Plus, Trash2, WandSparkles } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { Alert, Button, IconButton, SelectField, Switch, TextArea, TextField } from '../../components/ui/index.js'
import { NumberInput } from './NumberInput.jsx'
import { paramLabel } from './paramUtils.js'

const MAX_OPTIONS = 6

/** Problems of an ActiveLearning config for inline hints. */
export function activeIssues(active, params) {
  if (!active) return []
  const issues = []
  if (!params.some((p) => p.symbol === active.param)) issues.push('param')
  if (!Number.isFinite(active.from_value) || !Number.isFinite(active.to_value)) issues.push('values')
  else if (active.from_value === active.to_value) issues.push('sameValues')
  const options = (active.options || []).filter((o) => String(o || '').trim())
  if (options.length === 1) issues.push('oneOption')
  if (options.length >= 2 && active.correct_option !== null && active.correct_option !== undefined && !(active.correct_option >= 0 && active.correct_option < (active.options || []).length)) issues.push('correct')
  return issues
}

/**
 * Teacher config for active learning (spec §10.2): question, the parameter change,
 * what to observe, optional answer options with the correct one, explanation.
 * `suggest()` returns a ready config computed from the model (used to prefill).
 */
export function ActiveLearningEditor({ value, onChange, params = [], observeOptions = [], suggest }) {
  const { t } = useT()
  const uid = useId().replace(/[:]/g, '')
  const inputParams = params.filter((p) => p.symbol && p.role !== 'output')

  if (!value) {
    return (
      <div className="ix-panel">
        <p className="ix-heading">
          <Lightbulb aria-hidden="true" />
          {t('sim.alEditor.notSet')}
        </p>
        <p className="ix-sub">{t('sim.alEditor.notSetHint')}</p>
        <div>
          <Button icon={WandSparkles} variant="paper" disabled={!inputParams.length} onClick={() => onChange({ ...suggest(), enabled: true, auto: undefined })}>
            {t('sim.alEditor.setUp')}
          </Button>
        </div>
      </div>
    )
  }

  const set = (patch) => onChange({ ...value, ...patch })
  const options = Array.isArray(value.options) ? value.options : []
  const issues = activeIssues(value, inputParams)
  const unitOf = (symbol) => inputParams.find((p) => p.symbol === symbol)?.unit || ''

  return (
    <div className="stack">
      <Switch label={t('sim.alEditor.enabled')} checked={Boolean(value.enabled)} onChange={(e) => set({ enabled: e.target.checked })} />
      <p className="field-hint" style={{ marginBlockStart: 'calc(-1 * var(--space-xs))' }}>
        {t('sim.alEditor.enabledHint')}
      </p>
      <TextArea label={t('sim.alEditor.question')} hint={t('sim.alEditor.questionHint')} rows={2} maxLength={2000} value={value.question || ''} onChange={(e) => set({ question: e.target.value })} />
      <div className="ix-grid">
        <SelectField
          label={t('sim.alEditor.param')}
          value={inputParams.some((p) => p.symbol === value.param) ? value.param : ''}
          placeholder={t('sim.alEditor.choose')}
          options={inputParams.map((p) => ({ value: p.symbol, label: paramLabel(p) }))}
          error={issues.includes('param') ? t('sim.alEditor.issues.param') : undefined}
          onChange={(e) => set({ param: e.target.value })}
        />
        <NumberInput label={`${t('sim.alEditor.from')}${unitOf(value.param) ? ` (${unitOf(value.param)})` : ''}`} value={value.from_value} allowEmpty onChange={(v) => set({ from_value: v })} />
        <NumberInput
          label={`${t('sim.alEditor.to')}${unitOf(value.param) ? ` (${unitOf(value.param)})` : ''}`}
          value={value.to_value}
          allowEmpty
          error={issues.includes('sameValues') ? t('sim.alEditor.issues.sameValues') : issues.includes('values') ? t('sim.alEditor.issues.values') : undefined}
          onChange={(v) => set({ to_value: v })}
        />
        <SelectField
          label={t('sim.alEditor.observe')}
          value={observeOptions.some((o) => o.value === value.observe) ? value.observe : ''}
          placeholder={t('sim.alEditor.choose')}
          options={observeOptions}
          onChange={(e) => set({ observe: e.target.value })}
        />
      </div>

      <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0, minInlineSize: 0 }}>
        <legend className="field-label" style={{ marginBlockEnd: 'var(--space-2xs)' }}>
          {t('sim.alEditor.options')}
        </legend>
        <p className="field-hint" style={{ margin: 0 }}>
          {t('sim.alEditor.optionsHint')}
        </p>
        {options.map((opt, i) => (
          <div className="ix-option-row" key={i}>
            <label className="correct">
              <input type="radio" name={`${uid}-correct`} checked={value.correct_option === i} onChange={() => set({ correct_option: i })} />
              {t('sim.alEditor.correct')}
            </label>
            <TextField
              aria-label={t('sim.alEditor.optionLabel', { n: i + 1 })}
              value={opt}
              maxLength={200}
              onChange={(e) => set({ options: options.map((o, k) => (k === i ? e.target.value : o)) })}
            />
            <IconButton
              icon={Trash2}
              size="sm"
              label={t('sim.alEditor.removeOption', { n: i + 1 })}
              onClick={() => {
                const next = options.filter((_, k) => k !== i)
                let correct = value.correct_option
                if (correct === i) correct = null
                else if (Number.isInteger(correct) && correct > i) correct -= 1
                set({ options: next, correct_option: correct })
              }}
            />
          </div>
        ))}
        <div className="row">
          <Button size="sm" icon={Plus} disabled={options.length >= MAX_OPTIONS} onClick={() => set({ options: [...options, ''] })}>
            {t('sim.alEditor.addOption')}
          </Button>
          {options.length >= 2 && !Number.isInteger(value.correct_option) ? <span className="small muted">{t('sim.alEditor.noCorrect')}</span> : null}
        </div>
        {issues.includes('oneOption') ? <span className="field-error">{t('sim.alEditor.issues.oneOption')}</span> : null}
        {issues.includes('correct') ? <span className="field-error">{t('sim.alEditor.issues.correct')}</span> : null}
      </fieldset>

      <TextArea label={t('sim.alEditor.explanation')} hint={t('sim.alEditor.explanationHint')} rows={3} maxLength={2000} value={value.explanation || ''} onChange={(e) => set({ explanation: e.target.value })} />

      {issues.length ? (
        <Alert tone="warning">{t('sim.alEditor.fixFirst')}</Alert>
      ) : null}
      <div className="ix-toolbar">
        <Button icon={WandSparkles} onClick={() => onChange({ ...suggest(), enabled: value.enabled, auto: undefined })}>
          {t('sim.alEditor.refill')}
        </Button>
        <Button variant="ghost" icon={Trash2} onClick={() => onChange(null)}>
          {t('sim.alEditor.clear')}
        </Button>
      </div>
    </div>
  )
}
