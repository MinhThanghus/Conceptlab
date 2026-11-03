import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Table2 } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { clampTo, extent, linearScale, nearestIndex, niceDomain, niceTicks, robustDomain, sampleIndices, segments, toPoints } from './scale.js'
import './charts.css'

const SLOT_COLORS = ['var(--cl-series-1)', 'var(--cl-series-2)', 'var(--cl-series-3)', 'var(--cl-series-4)']
const NO_MARKERS = []
// The size the axis figures are drawn at unless a stylesheet says otherwise (--cl-plot-tick).
const TICK_PX = 12

/** Series colour: slot 1–4 → --cl-series-n, otherwise any CSS colour string. */
export function seriesColor(color, index = 0) {
  if (typeof color === 'number') return SLOT_COLORS[(color - 1 + SLOT_COLORS.length) % SLOT_COLORS.length]
  if (typeof color === 'string' && color) return color
  return SLOT_COLORS[index % SLOT_COLORS.length]
}

function useWidth(ref, fallback = 640) {
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const measure = () => {
      const w = Math.round(el.getBoundingClientRect().width)
      if (w > 0) setWidth(w)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

/**
 * The size of the axis figures in px: the `fixed` prop when given, else the size the stylesheet
 * gives them (`--cl-plot-tick`, read from a 1em probe, so a deck sheet that grows its type grows
 * the chart's margins with it).
 */
function useTickSize(probeRef, fixed) {
  const [size, setSize] = useState(TICK_PX)
  useEffect(() => {
    if (fixed) return undefined
    const el = probeRef.current
    if (!el) return undefined
    const measure = () => {
      const px = el.getBoundingClientRect().width
      if (px > 0) setSize((prev) => (Math.abs(prev - px) < 0.25 ? prev : px))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [probeRef, fixed])
  return fixed > 0 ? fixed : size
}

function pathFor(run, sx, sy, yDom) {
  let d = ''
  for (let i = 0; i < run.length; i += 1) {
    const x = sx(run[i][0])
    const y = sy(clampTo(run[i][1], yDom))
    d += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
  }
  return d
}

/**
 * Responsive SVG line/area plot.
 *
 * <Plot
 *   series={[{ id, label, points: [[x,y]…] | {x:[],y:[]}, color: 1..4 | css, dash, area, showPoints }]}
 *   xDomain={[min,max]} yDomain={[min,max]}   // optional; y is "nice" auto otherwise
 *   xLabel xUnit yLabel yUnit
 *   cursorX={t}                                // vertical line (current time)
 *   markers={[{ x, y, label, color }]}         // labelled points (vertex, current position…)
 *   title summary                              // accessible name + longer description
 *   height={260} equalAspect zeroLines digits
 *   tickSize={16}                              // optional px; else CSS --cl-plot-tick (12px)
 * />
 * Gaps: NaN/±Infinity break the line. Hover/keyboard crosshair lists every series at that x;
 * a toggleable data table gives the same values without a pointer.
 * The margins, the figure positions and the tick density follow the size of the axis figures,
 * so a larger size (a lesson slide sets --cl-plot-tick to its small type) never collides.
 */
export function Plot({
  series = [],
  xDomain,
  yDomain,
  xLabel,
  xUnit,
  yLabel,
  yUnit,
  cursorX = null,
  markers = NO_MARKERS,
  title,
  summary,
  height = 260,
  equalAspect = false,
  zeroLines = true,
  digits = 3,
  includeZero = false,
  tableRows = 21,
  tickSize,
  className,
}) {
  const { t, fmt, locale } = useT()
  const frameRef = useRef(null)
  const probeRef = useRef(null)
  const width = useWidth(frameRef)
  const tick = useTickSize(probeRef, tickSize)
  // Everything measured in figures scales with them; never tighter than the 12px layout.
  const k = Math.max(1, tick / TICK_PX)
  const uid = useId().replace(/[:]/g, '')
  const [hoverX, setHoverX] = useState(null)
  const [showTable, setShowTable] = useState(false)

  const prepared = useMemo(
    () =>
      series
        .filter(Boolean)
        .map((s, i) => ({ ...s, key: s.id ?? String(i), color: seriesColor(s.color, i), pts: toPoints(s.points) })),
    [series],
  )

  const compact = useMemo(() => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }), [locale])

  // Direct labels beat a legend (data-viz): with two to four named lines that all run to the last
  // eighth of the x range, each name sits at the end of its line, in a right margin sized for the
  // longest name. A line that stops early (a projectile that lands) keeps the legend instead.
  const directChars = useMemo(() => {
    const named = prepared.filter((s) => s.label)
    if (named.length < 2 || named.length > 4 || named.some((s) => s.lineless)) return 0
    let lo
    let hi
    if (xDomain && Number.isFinite(xDomain[0]) && Number.isFinite(xDomain[1]) && xDomain[1] > xDomain[0]) [lo, hi] = xDomain
    else {
      const ex = extent(prepared.flatMap((s) => s.pts.map((p) => p[0])))
      if (!ex || ex[1] - ex[0] < 1e-12) return 0
      ;[lo, hi] = ex
    }
    const reachesEnd = (s) => {
      for (let i = s.pts.length - 1; i >= 0; i -= 1) {
        const [px, py] = s.pts[i]
        if (Number.isFinite(px) && Number.isFinite(py) && px >= lo && px <= hi) return px >= hi - (hi - lo) / 8
      }
      return false
    }
    return named.every(reachesEnd) ? Math.max(...named.map((s) => String(s.label).length)) : 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepared, xDomain?.[0], xDomain?.[1]])
  const directRight = directChars ? Math.ceil(directChars * 6.8 * k + 30) : 0
  const directFits = directChars > 0 && width >= 480 && directRight <= width * 0.26

  const layout = useMemo(() => {
    const allX = []
    const allY = []
    prepared.forEach((s) =>
      s.pts.forEach(([x, y]) => {
        allX.push(x)
        if (Number.isFinite(x)) allY.push(y)
      }),
    )
    markers.forEach((m) => {
      if (Number.isFinite(m.x) && Number.isFinite(m.y)) {
        allX.push(m.x)
        allY.push(m.y)
      }
    })
    let [x0, x1] = xDomain && Number.isFinite(xDomain[0]) && Number.isFinite(xDomain[1]) && xDomain[1] > xDomain[0] ? xDomain : extent(allX) || [0, 1]
    if (x1 - x0 < 1e-12) {
      x0 -= 1
      x1 += 1
    }
    let y0
    let y1
    if (yDomain && Number.isFinite(yDomain[0]) && Number.isFinite(yDomain[1]) && yDomain[1] > yDomain[0]) [y0, y1] = yDomain
    else [y0, y1] = niceDomain(...robustDomain(allY, { includeZero }), Math.max(2, Math.floor(height / (50 * k))))

    const yTicksTmp = niceTicks(y0, y1, Math.max(2, Math.floor(height / (48 * k))))
    const label = (v, decimals) => (Math.abs(v) >= 1e5 ? compact.format(v) : fmt.number(v, decimals))
    const widest = Math.max(1, ...yTicksTmp.ticks.map((v) => label(v, yTicksTmp.decimals).length))
    // left: the widest y figure plus its gap; bottom: one line of x figures under the 4px marks
    const left = Math.min(84 * k, Math.max(30, widest * 7.4 * k + 12))
    const right = directFits ? directRight : 14
    const top = Math.max(10, Math.ceil(tick * 0.7))
    const bottom = Math.round(tick + 14)
    const w = Math.max(40, width - left - right)
    const h = Math.max(40, height - top - bottom)
    if (equalAspect) {
      const ux = (x1 - x0) / w
      const uy = (y1 - y0) / h
      if (ux > uy) y1 = y0 + ux * h
      else x1 = x0 + uy * w
    }
    const sx = linearScale([x0, x1], [left, left + w])
    const sy = linearScale([y0, y1], [top + h, top])
    const xTicks = niceTicks(x0, x1, Math.max(2, Math.floor(w / (78 * k))))
    const yTicks = niceTicks(y0, y1, Math.max(2, Math.floor(h / (44 * k))))
    // the x figures hang one figure height (plus the marks and a gap) under the axis
    const xLabelY = top + h + Math.round(tick + 6)
    return { x0, x1, y0, y1, left, top, w, h, sx, sy, xTicks, yTicks, label, xLabelY }
    // Domains by value: callers often pass a fresh [min, max] array on every render (e.g. each animation frame).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepared, markers, xDomain?.[0], xDomain?.[1], yDomain?.[0], yDomain?.[1], height, width, equalAspect, includeZero, compact, fmt, directFits, directRight, tick, k])

  const { x0, x1, y0, y1, left, top, w, h, sx, sy, xTicks, yTicks, label, xLabelY } = layout

  // End-of-line names: only when every named line reaches the last eighth of the x range
  // (a projectile that lands early keeps the legend); names are pushed apart by 16px.
  const directLabels = useMemo(() => {
    if (!directFits) return null
    const items = []
    for (const s of prepared) {
      if (!s.label) continue
      let end = null
      for (let i = s.pts.length - 1; i >= 0; i -= 1) {
        const [px, py] = s.pts[i]
        if (Number.isFinite(px) && Number.isFinite(py) && px >= x0 && px <= x1) {
          end = [px, py]
          break
        }
      }
      if (!end) return null
      items.push({ key: s.key, label: String(s.label), color: s.color, dash: s.dash, y: sy(clampTo(end[1], [y0, y1])) })
    }
    items.sort((a, b) => a.y - b.y)
    const gap = 16 * k
    for (let i = 1; i < items.length; i += 1) if (items[i].y - items[i - 1].y < gap) items[i].y = items[i - 1].y + gap
    const floor = top + h - 4
    for (let i = items.length - 1; i >= 0; i -= 1) {
      if (items[i].y > floor) items[i].y = floor
      if (i < items.length - 1 && items[i + 1].y - items[i].y < gap) items[i].y = items[i + 1].y - gap
    }
    return items
  }, [directFits, prepared, x0, x1, y0, y1, sy, top, h, k])

  const paths = useMemo(
    () =>
      prepared.map((s) => {
        const runs = segments(s.pts)
        const lines = runs.map((run) => pathFor(run, sx, sy, [y0, y1]))
        let area = null
        if (s.area) {
          const base = sy(Math.min(Math.max(0, y0), y1))
          area = runs
            .filter((run) => run.length > 1)
            .map((run) => `${pathFor(run, sx, sy, [y0, y1])}L${sx(run[run.length - 1][0]).toFixed(1)},${base.toFixed(1)}L${sx(run[0][0]).toFixed(1)},${base.toFixed(1)}Z`)
        }
        return { ...s, lines, area }
      }),
    [prepared, sx, sy, y0, y1],
  )

  const fmtX = useCallback((v) => (Math.abs(v) >= 1e5 ? compact.format(v) : fmt.number(v, digits)), [compact, fmt, digits])
  const fmtY = fmtX
  const unitText = (u) => (u ? ` ${u}` : '')

  const readout = useMemo(() => {
    if (hoverX === null || !prepared.length) return null
    const rows = prepared
      .map((s) => {
        const i = nearestIndex(s.pts, hoverX)
        if (i < 0) return null
        const [px, py] = s.pts[i]
        if (!Number.isFinite(py)) return { key: s.key, label: s.label, color: s.color, value: null, x: px }
        return { key: s.key, label: s.label, color: s.color, value: py, x: px }
      })
      .filter(Boolean)
    const snapX = rows[0]?.x ?? hoverX
    return { x: snapX, rows }
  }, [hoverX, prepared])

  const liveText = readout
    ? `${xLabel || 'x'} = ${fmtX(readout.x)}${unitText(xUnit)}: ` +
      readout.rows.map((r) => `${r.label ? `${r.label} ` : ''}${r.value === null ? t('sim.chart.noValue') : fmtY(r.value)}${unitText(yUnit)}`).join('; ')
    : ''

  const onPointer = (event) => {
    const rect = frameRef.current?.getBoundingClientRect()
    if (!rect) return
    const px = ((event.clientX - rect.left) / rect.width) * width
    if (px < left - 4 || px > left + w + 4) {
      setHoverX(null)
      return
    }
    setHoverX(Math.min(x1, Math.max(x0, sx.invert(px))))
  }

  const onKeyDown = (event) => {
    const step = (x1 - x0) / 50
    let next = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = (hoverX ?? x0 - step) + step
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = (hoverX ?? x1 + step) - step
    else if (event.key === 'Home') next = x0
    else if (event.key === 'End') next = x1
    else if (event.key === 'Escape') {
      setHoverX(null)
      return
    }
    if (next === null) return
    event.preventDefault()
    setHoverX(Math.min(x1, Math.max(x0, next)))
  }

  const tableData = useMemo(() => {
    if (!showTable || !prepared.length) return null
    const base = prepared[0].pts.filter((p) => Number.isFinite(p[0]))
    const idx = sampleIndices(base.length, tableRows)
    return idx.map((i) => {
      const x = base[i][0]
      return {
        x,
        values: prepared.map((s, k) => {
          if (k === 0) return base[i][1]
          const ex = extent(s.pts.map((p) => p[0]))
          if (!ex || x < ex[0] - 1e-9 || x > ex[1] + 1e-9) return null
          return s.pts[nearestIndex(s.pts, x)]?.[1] ?? null
        }),
      }
    })
  }, [showTable, prepared, tableRows])

  const legend = prepared.filter((s) => s.label)
  const hoverPx = readout ? sx(readout.x) : null
  const tipOnLeft = hoverPx !== null && hoverPx > left + w * 0.6
  const yAxisText = [yLabel, yUnit ? `(${yUnit})` : ''].filter(Boolean).join(' ')
  const xAxisText = [xLabel, xUnit ? `(${xUnit})` : ''].filter(Boolean).join(' ')
  const zeroX = zeroLines && x0 < 0 && x1 > 0 ? sx(0) : null
  const zeroY = zeroLines && y0 < 0 && y1 > 0 ? sy(0) : null

  return (
    <figure className={['cl-plot', className].filter(Boolean).join(' ')} style={tickSize > 0 ? { '--cl-plot-tick': `${tickSize}px` } : undefined}>
      <div className="cl-plot-head">
        {yAxisText ? <span className="cl-plot-ylabel">{yAxisText}</span> : <span />}
        {legend.length > 1 ? (
          <ul className={directLabels ? 'visually-hidden' : 'cl-plot-legend'} aria-label={t('sim.chart.legend')}>
            {legend.map((s) => (
              <li key={s.key}>
                <span className={['cl-plot-key', s.dash ? 'dash' : '', s.lineless ? 'dot' : ''].join(' ')} style={{ color: s.color }} aria-hidden="true" />
                {s.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div
        ref={frameRef}
        className="cl-plot-frame"
        tabIndex={0}
        aria-label={t('sim.chart.exploreHint', { title: title || yAxisText || '' })}
        aria-describedby={summary ? `${uid}-sum` : undefined}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => setHoverX(null)}
        onKeyDown={onKeyDown}
        onBlur={() => setHoverX(null)}
      >
        {/* 1em at the axis figures' size: tells the layout how large the stylesheet draws them */}
        <span ref={probeRef} className="cl-plot-em" aria-hidden="true" />
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title || yAxisText}>
          <defs>
            <clipPath id={`${uid}-clip`}>
              <rect x={left} y={top - 2} width={w} height={h + 4} />
            </clipPath>
          </defs>
          {/* hairlines across at each y tick only; x ticks are short marks on the baseline */}
          <g className="grid" aria-hidden="true">
            {yTicks.ticks.map((v) => (
              <line key={`gy${v}`} x1={left} x2={left + w} y1={sy(v)} y2={sy(v)} />
            ))}
          </g>
          <line className="frame-line" x1={left} x2={left + w} y1={top + h} y2={top + h} aria-hidden="true" />
          <g aria-hidden="true">
            {xTicks.ticks.map((v) => (
              <line key={`mx${v}`} className="tick-mark" x1={sx(v)} x2={sx(v)} y1={top + h} y2={top + h + 4} />
            ))}
          </g>
          {zeroY !== null ? <line className="axis-zero" x1={left} x2={left + w} y1={zeroY} y2={zeroY} aria-hidden="true" /> : null}
          {zeroX !== null ? <line className="axis-zero" x1={zeroX} x2={zeroX} y1={top} y2={top + h} aria-hidden="true" /> : null}
          <g aria-hidden="true">
            {yTicks.ticks.map((v) => (
              <text key={`ty${v}`} className="tick" x={left - 6} y={sy(v)} dy="0.32em" textAnchor="end">
                {label(v, yTicks.decimals)}
              </text>
            ))}
            {xTicks.ticks.map((v) => (
              <text key={`tx${v}`} className="tick" x={sx(v)} y={xLabelY} textAnchor="middle">
                {label(v, xTicks.decimals)}
              </text>
            ))}
          </g>
          <g clipPath={`url(#${uid}-clip)`} aria-hidden="true">
            {paths.map((s) => (s.area ? s.area.map((d, i) => <path key={`a${s.key}${i}`} className="series-area" d={d} style={{ fill: s.color }} />) : null))}
            {paths.map((s) =>
              s.lineless ? null : s.lines.map((d, i) => <path key={`l${s.key}${i}`} className={['series', s.dash ? 'dash' : ''].join(' ')} d={d} style={{ stroke: s.color, strokeWidth: s.width }} />),
            )}
            {paths.map((s) =>
              s.showPoints
                ? s.pts
                    .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))
                    .map((p, i) => <circle key={`p${s.key}${i}`} className="series-dot" cx={sx(p[0])} cy={sy(clampTo(p[1], [y0, y1]))} r={4} style={{ fill: s.color }} />)
                : null,
            )}
            {cursorX !== null && Number.isFinite(cursorX) && cursorX >= x0 && cursorX <= x1 ? (
              <line className="cursor" x1={sx(cursorX)} x2={sx(cursorX)} y1={top} y2={top + h} />
            ) : null}
          </g>
          <g aria-hidden="true">
            {markers
              .filter((m) => Number.isFinite(m.x) && Number.isFinite(m.y) && m.x >= x0 && m.x <= x1 && m.y >= y0 && m.y <= y1)
              .map((m, i) => {
                const cx = sx(m.x)
                const cy = sy(m.y)
                const anchorEnd = cx > left + w - 80
                return (
                  <g key={`m${i}`}>
                    <circle className="marker" cx={cx} cy={cy} r={m.r || 5.5} style={{ fill: seriesColor(m.color, 0) }} />
                    {m.label ? (
                      <text className="marker-label" x={anchorEnd ? cx - 9 : cx + 9} y={cy - 9} textAnchor={anchorEnd ? 'end' : 'start'}>
                        {m.label}
                      </text>
                    ) : null}
                  </g>
                )
              })}
          </g>
          {directLabels ? (
            <g aria-hidden="true">
              {directLabels.map((d) => (
                <g key={`dl${d.key}`}>
                  <line className={['series-swatch', d.dash ? 'dash' : ''].join(' ')} x1={left + w + 6} x2={left + w + 18} y1={d.y} y2={d.y} style={{ stroke: d.color }} />
                  <text className="series-label" x={left + w + 22} y={d.y} dy="0.32em">
                    {d.label}
                  </text>
                </g>
              ))}
            </g>
          ) : null}
          {readout ? (
            <g aria-hidden="true">
              <line className="hover-line" x1={hoverPx} x2={hoverPx} y1={top} y2={top + h} />
              {readout.rows.map((r) =>
                r.value === null || r.value < y0 || r.value > y1 ? null : (
                  <circle key={`h${r.key}`} className="hover-dot" cx={sx(r.x)} cy={sy(r.value)} r={5} style={{ fill: r.color }} />
                ),
              )}
            </g>
          ) : null}
        </svg>
        {readout ? (
          <div className="cl-plot-tip" style={tipOnLeft ? { insetInlineEnd: `${width - hoverPx + 12}px` } : { insetInlineStart: `${hoverPx + 12}px` }} aria-hidden="true">
            <div className="tip-x">
              {xLabel || 'x'} = {fmtX(readout.x)}
              {unitText(xUnit)}
            </div>
            {readout.rows.map((r) => (
              <div className="tip-row" key={r.key}>
                <span className={['tip-key', prepared.find((s) => s.key === r.key)?.dash ? 'dash' : ''].join(' ')} style={{ color: r.color }} />
                {r.value === null ? <span className="tip-none">{t('sim.chart.noValue')}</span> : <strong>{`${fmtY(r.value)}${unitText(yUnit)}`}</strong>}
                {r.label ? <span className="muted">{r.label}</span> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="cl-plot-foot">
        <button type="button" className="btn btn-ghost btn-sm cl-plot-tablebtn" aria-expanded={showTable} aria-controls={`${uid}-table`} onClick={() => setShowTable((v) => !v)}>
          <Table2 aria-hidden="true" />
          {showTable ? t('sim.chart.hideTable') : t('sim.chart.showTable')}
        </button>
        {xAxisText ? <span className="cl-plot-xlabel">{xAxisText}</span> : null}
      </div>
      {showTable && tableData ? (
        <div className="table-wrap cl-plot-table" id={`${uid}-table`}>
          <table className="table">
            <caption>{title || yAxisText}</caption>
            <thead>
              <tr>
                <th scope="col" className="num">
                  {xAxisText || 'x'}
                </th>
                {prepared.map((s) => (
                  <th scope="col" className="num" key={s.key}>
                    {s.label || yAxisText || 'y'}
                    {s.label && yUnit ? ` (${yUnit})` : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, i) => (
                <tr key={i}>
                  <td className="num">{fmtX(row.x)}</td>
                  {row.values.map((v, k) => (
                    <td className="num" key={k}>
                      {v === null || !Number.isFinite(v) ? <span className="visually-hidden">{t('sim.chart.noValue')}</span> : fmtY(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {summary ? (
        <p id={`${uid}-sum`} className="visually-hidden">
          {summary}
        </p>
      ) : null}
      <div className="visually-hidden" aria-live="polite">
        {liveText}
      </div>
    </figure>
  )
}

export default Plot
