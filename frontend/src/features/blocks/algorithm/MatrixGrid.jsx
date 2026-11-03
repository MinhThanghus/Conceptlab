import { useEffect, useRef, useState } from 'react'
import { useT } from '../../../i18n/index.jsx'
import { parseLocaleNumber, plainNumber } from '../../sim/paramUtils.js'

/** One editable number: accepts "0,5" and "0.5", keeps "-" while typing, commits valid numbers. */
function CellInput({ value, onCommit, label }) {
  const { lang } = useT()
  const [text, setText] = useState(() => plainNumber(value, lang))
  const committed = useRef(value)
  const shownLang = useRef(lang)

  useEffect(() => {
    if (Number(committed.current) !== Number(value) || shownLang.current !== lang) {
      committed.current = value
      shownLang.current = lang
      setText(plainNumber(value, lang))
    }
  }, [value, lang])

  const invalid = text.trim() !== '' && !Number.isFinite(parseLocaleNumber(text))
  return (
    <input
      className="alg-cell"
      type="text"
      autoComplete="off"
      spellCheck={false}
      value={text}
      aria-label={label}
      aria-invalid={invalid || undefined}
      onChange={(e) => {
        setText(e.target.value)
        const n = parseLocaleNumber(e.target.value)
        if (Number.isFinite(n)) {
          committed.current = n
          onCommit(n)
        }
      }}
      onBlur={() => {
        if (!text.trim()) {
          committed.current = 0
          onCommit(0)
          setText(plainNumber(0, lang))
          return
        }
        if (!invalid) setText(plainNumber(committed.current, lang))
      }}
    />
  )
}

/**
 * A small matrix as a real table: row headers are tokens, columns d1…dn. Editable cells
 * (text inputs with explicit labels) or read-only values; `highlightRow` marks a row.
 */
export function MatrixGrid({ name, matrix = [], rowLabels = [], onChange, readOnly = false, highlightRow = null, caption, digits = 2 }) {
  const { t, fmt } = useT()
  const cols = matrix[0]?.length || 0
  const setCell = (i, j, n) => onChange?.(matrix.map((row, ri) => (ri === i ? row.map((c, cj) => (cj === j ? n : c)) : row)))
  return (
    <div className={`alg-matrix${readOnly ? ' readonly' : ''}`}>
      <table>
        <caption>{caption || name}</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">{t('algorithm.attention.token')}</span>
            </th>
            {Array.from({ length: cols }, (_, j) => (
              <th key={j} scope="col">
                d{j + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i} className={highlightRow === i ? 'hl' : undefined}>
              <th scope="row" title={rowLabels[i]}>
                {rowLabels[i]}
              </th>
              {row.map((v, j) => (
                <td key={j}>
                  {readOnly ? (
                    <span className="alg-val">{fmt.number(v, digits)}</span>
                  ) : (
                    <CellInput value={v} label={t('algorithm.attention.cellLabel', { matrix: name, token: rowLabels[i] ?? i + 1, dim: j + 1 })} onCommit={(n) => setCell(i, j, n)} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
