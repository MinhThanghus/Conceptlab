import { useEffect, useRef, useState } from 'react'
import { useT } from '../../i18n/index.jsx'
import { TextField } from '../../components/ui/index.js'
import { parseLocaleNumber, plainNumber } from './paramUtils.js'

/**
 * Number field for editors: accepts "2,5" and "2.5", keeps what the teacher is typing
 * ("-", "0,") and only commits valid numbers. Empty → null when `allowEmpty`.
 */
export function NumberInput({ label, value, onChange, hint, error, allowEmpty = false, placeholder, id, className, disabled, required }) {
  const { t, lang } = useT()
  const [text, setText] = useState(() => plainNumber(value, lang))
  const committed = useRef(value)

  useEffect(() => {
    const same = (value === null || value === undefined) ? committed.current === null || committed.current === undefined : Number(committed.current) === Number(value)
    if (!same) {
      committed.current = value
      setText(plainNumber(value, lang))
    }
  }, [value, lang])

  const parsed = parseLocaleNumber(text)
  const localError = text.trim() && !Number.isFinite(parsed) ? t('sim.form.notANumber') : !text.trim() && !allowEmpty && required ? t('sim.form.required') : null

  return (
    <TextField
      id={id}
      className={className}
      label={label}
      hint={hint}
      error={error || localError || undefined}
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      placeholder={placeholder}
      disabled={disabled}
      value={text}
      onChange={(e) => {
        const next = e.target.value
        setText(next)
        if (!next.trim()) {
          if (allowEmpty) {
            committed.current = null
            onChange(null)
          }
          return
        }
        const n = parseLocaleNumber(next)
        if (Number.isFinite(n)) {
          committed.current = n
          onChange(n)
        }
      }}
      onBlur={() => {
        if (text.trim() && !Number.isFinite(parseLocaleNumber(text))) return
        setText(plainNumber(committed.current, lang))
      }}
    />
  )
}
