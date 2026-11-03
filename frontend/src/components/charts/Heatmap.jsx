import { useRef, useState } from 'react'
import { useT } from '../../i18n/index.jsx'
import './charts.css'

/**
 * Fill opacity for a normalised value w ∈ [0, 1]. The ramp skips the 0.60–0.76 band where
 * neither dark nor white text reaches 4.5:1 on --cl-primary-strong, so numbers stay readable:
 * w ≤ 0.5 → light fill + dark text, w > 0.5 → strong fill + white text. Monotonic.
 */
export function heatOpacity(w) {
  const v = Math.max(0, Math.min(1, Number.isFinite(w) ? w : 0))
  return v <= 0.5 ? 0.04 + 1.12 * v : 0.76 + 0.48 * (v - 0.5)
}

/**
 * Accessible heatmap: a real <table> (row/column headers, every value printed) with a
 * single-hue fill. Arrow keys move between cells; hover/focus report the cell via
 * onActiveChange({ row, col } | null) so the parent can highlight related inputs.
 *
 * <Heatmap matrix={[[…]]} rowLabels colLabels min={0} max={1} digits={2}
 *          caption rowAxis colAxis active={{row, col}} onActiveChange cellLabel={(r,c,v)=>string} />
 *
 * A cell is read from its contents (aria-label is not allowed on a cell): the printed value after
 * hidden row/column words, or cellLabel's whole sentence (value included) in place of both.
 */
export function Heatmap({ matrix = [], rowLabels = [], colLabels = [], min = 0, max = 1, digits = 2, caption, rowAxis, colAxis, active = null, onActiveChange, cellLabel, showScale = true }) {
  const { t, fmt } = useT()
  const tableRef = useRef(null)
  const [focus, setFocus] = useState({ row: 0, col: 0 })
  const span = max - min || 1
  const rows = matrix.length
  const cols = matrix[0]?.length || 0

  const moveTo = (row, col) => {
    const r = Math.max(0, Math.min(rows - 1, row))
    const c = Math.max(0, Math.min(cols - 1, col))
    setFocus({ row: r, col: c })
    onActiveChange?.({ row: r, col: c })
    requestAnimationFrame(() => tableRef.current?.querySelector(`[data-cell="${r}-${c}"]`)?.focus())
  }

  const onKeyDown = (event, r, c) => {
    const map = { ArrowRight: [r, c + 1], ArrowLeft: [r, c - 1], ArrowDown: [r + 1, c], ArrowUp: [r - 1, c], Home: [r, 0], End: [r, cols - 1] }
    const next = map[event.key]
    if (!next) return
    event.preventDefault()
    moveTo(next[0], next[1])
  }

  return (
    <div className="stack-sm">
      <div className="cl-heatmap-wrap">
        <table className="cl-heatmap" ref={tableRef} onMouseLeave={() => onActiveChange?.(null)}>
          {caption ? <caption>{caption}</caption> : null}
          <thead>
            <tr>
              <th scope="col" className="corner">
                {rowAxis && colAxis ? `${rowAxis} \\ ${colAxis}` : ''}
              </th>
              {colLabels.map((label, c) => (
                <th key={c} scope="col" className={active && active.col === c ? 'hl' : undefined} title={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, r) => (
              <tr key={r}>
                <th scope="row" className={active && active.row === r ? 'hl' : undefined} title={rowLabels[r]}>
                  {rowLabels[r]}
                </th>
                {row.map((value, c) => {
                  const w = (value - min) / span
                  const light = w > 0.5
                  const isCell = active && active.row === r && active.col === c
                  const inLine = active && (active.row === r || active.col === c)
                  const cls = [light ? 'light-text' : 'dark-text', isCell ? 'hl-cell' : inLine ? 'hl-line' : ''].filter(Boolean).join(' ')
                  const text = fmt.number(value, digits)
                  const said = cellLabel ? cellLabel(r, c, value) : `${rowLabels[r] ?? r + 1} → ${colLabels[c] ?? c + 1}:`
                  return (
                    <td
                      key={c}
                      className={cls}
                      data-cell={`${r}-${c}`}
                      tabIndex={focus.row === r && focus.col === c ? 0 : -1}
                      onMouseEnter={() => onActiveChange?.({ row: r, col: c })}
                      onFocus={() => {
                        setFocus({ row: r, col: c })
                        onActiveChange?.({ row: r, col: c })
                      }}
                      onKeyDown={(e) => onKeyDown(e, r, c)}
                    >
                      <span className="hm-fill" style={{ opacity: heatOpacity(w) }} aria-hidden="true" />
                      <span className="visually-hidden">{said}</span>{' '}
                      <span className="hm-val" aria-hidden={cellLabel ? 'true' : undefined}>
                        {text}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showScale ? (
        <div className="cl-heatmap-scale" aria-hidden="true">
          <span>{fmt.number(min, digits)}</span>
          <span className="swatches">
            {[0, 0.25, 0.5, 0.75, 1].map((w) => (
              <span className="swatch" key={w}>
                <span style={{ opacity: heatOpacity(w) }} />
              </span>
            ))}
          </span>
          <span>{fmt.number(max, digits)}</span>
          <span className="muted">{t('sim.chart.heatScale')}</span>
        </div>
      ) : null}
    </div>
  )
}

export default Heatmap
