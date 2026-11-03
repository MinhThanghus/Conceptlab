import { forwardRef, useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { FieldShell } from '../../components/ui/index.js'
import { passwordStrength } from './formErrors.js'
import './auth.css'

/**
 * Password input with a show/hide toggle (aria-pressed) and an optional strength meter
 * (text + segments, never colour alone). Used by sign-in, sign-up and account settings.
 */
const PasswordField = forwardRef(function PasswordField(
  { id, label, hint, error, required, value, onChange, autoComplete = 'current-password', showStrength = false, ...rest },
  ref,
) {
  const { t } = useT()
  const [visible, setVisible] = useState(false)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const ids = { id: id || `pw-${uid}`, hintId: `pw-${uid}-hint`, errorId: `pw-${uid}-error` }
  const strengthId = `pw-${uid}-strength`
  const strength = showStrength && value ? passwordStrength(value) : null
  const describedBy = [hint && ids.hintId, error && ids.errorId, strength !== null && strengthId].filter(Boolean).join(' ') || undefined
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} ids={ids}>
      <div className="pw-wrap">
        <input
          ref={ref}
          id={ids.id}
          type={visible ? 'text' : 'password'}
          className="input pw-input"
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required={required}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          {...rest}
        />
        <button
          type="button"
          className="pw-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-controls={ids.id}
          aria-label={t('auth.password.show')}
          title={visible ? t('auth.password.hide') : t('auth.password.show')}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>
      {strength !== null ? (
        <div className="pw-strength" id={strengthId}>
          <span className={`pw-meter s${strength}`} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="small">{t(`auth.password.strength${strength}`)}</span>
        </div>
      ) : null}
    </FieldShell>
  )
})

export default PasswordField
