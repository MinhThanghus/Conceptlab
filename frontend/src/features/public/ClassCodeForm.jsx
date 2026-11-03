import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircleAlert } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { Button } from '../../components/ui/index.js'
import { CODE_LENGTH, checkCode, normalizeCode, sharePath } from './classCode.js'
import './classcode.css'

/**
 * Class-code entry. Uppercases as you type, ignores spaces/dashes, accepts a pasted link,
 * and explains look-alike characters (O/0, I/1, L are never used in codes).
 *
 * - `size="inline"` (home hero): navigates straight to /s/CODE.
 * - `size="large"` (join page): pass `onSubmitCode(code)` to validate with the server first;
 *   it may return an error message to show under the input.
 */
export default function ClassCodeForm({ size = 'inline', initialCode = '', onSubmitCode, autoFocus = false, label, submitLabel, submitVariant }) {
  const { t } = useT()
  const navigate = useNavigate()
  const ids = useId().replace(/[:]/g, '')
  const inputId = `code-${ids}`
  const hintId = `code-hint-${ids}`
  const errorId = `code-error-${ids}`
  const [value, setValue] = useState(() => normalizeCode(initialCode))
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState('')
  const [busy, setBusy] = useState(false)

  const check = checkCode(value)
  const liveProblem = check.reason === 'ambiguous' || check.reason === 'invalid'
  const showProblem = !check.ok && (liveProblem || submitted)
  let problem = ''
  if (showProblem) {
    if (check.reason === 'ambiguous') problem = t('join.errors.ambiguous', { chars: check.chars.join(', ') })
    else if (check.reason === 'invalid') problem = t('join.errors.invalid', { chars: check.chars.join(' ') })
    else if (check.reason === 'empty') problem = t('join.errors.empty')
    else if (check.reason === 'short') problem = t('join.errors.short', { length: CODE_LENGTH })
  }
  const error = problem || serverError

  const onSubmit = async (event) => {
    event.preventDefault()
    setSubmitted(true)
    setServerError('')
    if (!check.ok) {
      document.getElementById(inputId)?.focus()
      return
    }
    if (!onSubmitCode) {
      navigate(sharePath(value))
      return
    }
    setBusy(true)
    try {
      const message = await onSubmitCode(value)
      if (message) {
        setServerError(message)
        document.getElementById(inputId)?.focus()
      }
    } finally {
      setBusy(false)
    }
  }

  const large = size === 'large'
  return (
    <form className={['code-form', large ? 'code-form-large' : 'code-form-inline'].join(' ')} onSubmit={onSubmit} noValidate>
      <label className={large ? 'code-label-large' : 'field-label'} htmlFor={inputId}>
        {label || t('join.codeLabel')}
      </label>
      <div className="code-row">
        <input
          id={inputId}
          className={['input', 'code-input', large && 'code-input-large'].filter(Boolean).join(' ')}
          value={value}
          onChange={(e) => {
            setValue(normalizeCode(e.target.value))
            setServerError('')
          }}
          placeholder={t('join.placeholder')}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          enterKeyHint="go"
          autoFocus={autoFocus}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={[hintId, error && errorId].filter(Boolean).join(' ')}
        />
        <Button type="submit" variant={submitVariant ?? (large ? 'primary' : undefined)} size={large ? 'lg' : undefined} loading={busy}>
          {submitLabel || t('join.submit')}
        </Button>
      </div>
      <p id={hintId} className="field-hint code-hint">
        {t('join.hint', { length: CODE_LENGTH })}
      </p>
      {error ? (
        <p id={errorId} className="field-error code-error" role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </form>
  )
}
