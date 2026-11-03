import { forwardRef, useEffect, useRef, useState } from 'react'
import { useT } from '../../../i18n/index.jsx'
import { formatDecimalInput, parseDecimal } from './numbers.js'

/**
 * Number input that accepts "0,25" and "0.25" (mobile decimal keypad). Calls
 * onChange(number | null) only with valid values; invalid text stays visible and is marked
 * aria-invalid until fixed. The parent supplies the label (aria-label or <label htmlFor>).
 */
export const DecimalInput = forwardRef(function DecimalInput({ value, onChange, className, invalid, onFocus, onBlur, ...rest }, ref) {
  const { lang } = useT()
  const [draft, setDraft] = useState(() => formatDecimalInput(value, lang))
  const [bad, setBad] = useState(false)
  const focused = useRef(false)

  useEffect(() => {
    if (focused.current) return
    setDraft(formatDecimalInput(value, lang))
    setBad(false)
  }, [value, lang])

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      className={['input', className].filter(Boolean).join(' ')}
      value={draft}
      aria-invalid={bad || invalid ? 'true' : undefined}
      onFocus={(e) => {
        focused.current = true
        onFocus?.(e)
      }}
      onBlur={(e) => {
        focused.current = false
        if (!bad) setDraft(formatDecimalInput(value, lang))
        onBlur?.(e)
      }}
      onChange={(e) => {
        const text = e.target.value
        setDraft(text)
        const n = parseDecimal(text)
        if (n === null) {
          setBad(false)
          onChange?.(null)
        } else if (Number.isNaN(n)) {
          setBad(true)
        } else {
          setBad(false)
          onChange?.(n)
        }
      }}
      {...rest}
    />
  )
})
