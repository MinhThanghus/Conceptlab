import { forwardRef, useId } from 'react'
import { CircleAlert } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'

function useFieldIds(id) {
  const auto = useId()
  const base = id || `f${auto.replace(/[:]/g, '')}`
  return { id: base, hintId: `${base}-hint`, errorId: `${base}-error` }
}

function describedBy(hint, error, ids) {
  return [hint && ids.hintId, error && ids.errorId].filter(Boolean).join(' ') || undefined
}

export function FieldShell({ label, hint, error, required, ids, children, className }) {
  const { t } = useT()
  return (
    <div className={['field', className].filter(Boolean).join(' ')}>
      {label ? (
        <label className="field-label" htmlFor={ids.id}>
          {label}
          {required ? (
            <span aria-hidden="true" style={{ color: 'var(--cl-danger)' }}>
              {' '}
              *
            </span>
          ) : null}
          {required ? <span className="visually-hidden"> ({t('common.a11y.required')})</span> : null}
        </label>
      ) : null}
      {children}
      {hint ? (
        <span className="field-hint" id={ids.hintId}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="field-error" id={ids.errorId}>
          <CircleAlert size={16} aria-hidden="true" />
          {error}
        </span>
      ) : null}
    </div>
  )
}

export const TextField = forwardRef(function TextField({ id, label, hint, error, required, className, inputClassName, ...rest }, ref) {
  const ids = useFieldIds(id)
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} ids={ids} className={className}>
      <input
        ref={ref}
        id={ids.id}
        className={['input', inputClassName].filter(Boolean).join(' ')}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(hint, error, ids)}
        required={required}
        {...rest}
      />
    </FieldShell>
  )
})

export const TextArea = forwardRef(function TextArea({ id, label, hint, error, required, className, rows = 4, ...rest }, ref) {
  const ids = useFieldIds(id)
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} ids={ids} className={className}>
      <textarea
        ref={ref}
        id={ids.id}
        rows={rows}
        className="textarea"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(hint, error, ids)}
        required={required}
        {...rest}
      />
    </FieldShell>
  )
})

/** options: [{ value, label }] */
export const SelectField = forwardRef(function SelectField({ id, label, hint, error, required, className, options = [], placeholder, ...rest }, ref) {
  const ids = useFieldIds(id)
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} ids={ids} className={className}>
      <select
        ref={ref}
        id={ids.id}
        className="select"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(hint, error, ids)}
        required={required}
        {...rest}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
})

export function Checkbox({ label, hint, className, ...rest }) {
  const ids = useFieldIds(rest.id)
  return (
    <div className={className}>
      <label className="check" htmlFor={ids.id}>
        <input type="checkbox" id={ids.id} aria-describedby={hint ? ids.hintId : undefined} {...rest} />
        <span>
          {label}
          {hint ? (
            // Inside the label so it is clickable, but kept out of the accessible name: it is
            // announced once, as the description (aria-describedby), not twice.
            <span className="field-hint" id={ids.hintId} aria-hidden="true" style={{ display: 'block' }}>
              {hint}
            </span>
          ) : null}
        </span>
      </label>
    </div>
  )
}

export function Switch({ label, className, ...rest }) {
  const ids = useFieldIds(rest.id)
  return (
    <label className={['switch', className].filter(Boolean).join(' ')} htmlFor={ids.id}>
      <input type="checkbox" role="switch" id={ids.id} {...rest} />
      <span>{label}</span>
    </label>
  )
}

/**
 * Slider + number input bound to the same value (keyboard and touch friendly).
 * Shows unit and optional provenance badge (node) next to the label.
 */
export function SliderField({ id, label, value, min = 0, max = 100, step = 1, unit, onChange, badge, hint, disabled, digits = 3 }) {
  const ids = useFieldIds(id)
  const { fmt } = useT()
  const numeric = Number.isFinite(Number(value)) ? Number(value) : min
  const clamp = (v) => Math.min(max, Math.max(min, v))
  return (
    <div className="field">
      <div className="row-between" style={{ gap: '0.5rem' }}>
        <label className="field-label" htmlFor={ids.id}>
          {label}
          {unit ? <span className="muted"> ({unit})</span> : null}
        </label>
        {badge}
      </div>
      <div className="row" style={{ gap: '0.75rem', flexWrap: 'nowrap' }}>
        <input
          id={ids.id}
          type="range"
          className="range"
          min={min}
          max={max}
          step={step}
          value={numeric}
          disabled={disabled}
          aria-describedby={hint ? ids.hintId : undefined}
          aria-valuetext={`${fmt.number(numeric, digits)}${unit ? ` ${unit}` : ''}`}
          onChange={(e) => onChange?.(Number(e.target.value))}
        />
        <input
          type="number"
          className="input input-sm"
          style={{ inlineSize: '6.5rem', flex: 'none' }}
          min={min}
          max={max}
          step={step}
          value={numeric}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (e.target.value !== '' && Number.isFinite(v)) onChange?.(clamp(v))
          }}
        />
      </div>
      {hint ? (
        <span className="field-hint" id={ids.hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Index of the radio to select for a key press in a radio group (Arrow keys wrap, Home/End
 * jump), or -1 when the key is not handled. `current` is the focused/checked index.
 */
export function radioKeyTarget(key, current, count) {
  if (!count) return -1
  const from = current < 0 ? 0 : current
  if (key === 'ArrowRight' || key === 'ArrowDown') return (from + 1) % count
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (from - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return -1
}

/** Segmented single-choice control. options: [{ value, label }] */
export function Segmented({ value, onChange, options, label, size }) {
  const hasSelection = options.some((o) => o.value === value)
  return (
    <div className="segmented" role="radiogroup" aria-label={label} style={size === 'sm' ? { fontSize: '0.85rem' } : undefined}>
      {options.map((opt, index) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          onKeyDown={(e) => {
            const next = radioKeyTarget(e.key, index, options.length)
            if (next < 0) return
            e.preventDefault()
            // Selection follows focus (WAI-ARIA radio group): move focus with the choice so
            // keyboard and screen-reader users land on — and hear — the option they picked.
            e.currentTarget.parentElement?.children[next]?.focus()
            if (options[next].value !== value) onChange(options[next].value)
          }}
          tabIndex={value === opt.value || (!hasSelection && opt === options[0]) ? 0 : -1}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
