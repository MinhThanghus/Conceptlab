import { useId } from 'react'
import { useT } from '../../../i18n/index.jsx'

/*
 * SVG stages for the four supported models, and the fallback of the 3D ones. Each scene is a
 * pure function of the clock time `t` and the scenario results (stateAt(t) from
 * features/sim/models.js), so stepping, scrubbing and reduced motion all work the same way.
 * Scenario B (current) uses --cl-series-1, scenario A (kept for comparison) --cl-series-2 and
 * an "A"/"B" label; one scenario alone is drawn in coral. `describedBy` points at the words
 * that say what the scene shows (the parameters and the result), kept up to date.
 */

const W = 480

function Tag({ x, y, text, color }) {
  if (!text) return null
  return (
    <g aria-hidden="true">
      <rect x={x - 13} y={y - 11} width={26} height={22} rx={11} className="sim-tag" style={{ stroke: color }} />
      <text x={x} y={y + 4.5} textAnchor="middle" className="sim-tag-text">
        {text}
      </text>
    </g>
  )
}

function ArrowDefs({ id }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" className="sim-arrowhead" />
      </marker>
    </defs>
  )
}

// ----------------------------------------------------------------------------- pendulum
export function PendulumScene({ items, t, maxLength, title, describedBy }) {
  const { fmt } = useT()
  const H = 300
  const top = 30
  const pivots = items.length === 1 ? [W / 2] : [W * 0.28, W * 0.72]
  const scale = (H - top - 40) / Math.max(maxLength, 0.05)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sim-scene" role="img" aria-label={title} aria-describedby={describedBy}>
      <rect x={24} y={top - 12} width={W - 48} height={9} rx={3} className="sim-ceiling" />
      {Array.from({ length: 22 }, (_, i) => (
        <line key={i} x1={30 + i * 20} y1={top - 12} x2={40 + i * 20} y2={top - 22} className="sim-hatch" />
      ))}
      {items.map((it, i) => {
        const px = pivots[i] ?? W / 2
        const py = top
        const s = it.stateAt(t)
        const len = it.L * scale
        const bx = px + len * Math.sin(s.theta)
        const by = py + len * Math.cos(s.theta)
        const trail = []
        for (let k = 0; k <= 18; k += 1) {
          const tt = t - 0.9 * (1 - k / 18)
          if (tt < 0) continue
          const ss = it.stateAt(tt)
          trail.push(`${(px + len * Math.sin(ss.theta)).toFixed(1)},${(py + len * Math.cos(ss.theta)).toFixed(1)}`)
        }
        const r = Math.min(38, len * 0.45)
        const ax = px + r * Math.sin(s.theta)
        const ay = py + r * Math.cos(s.theta)
        const sweep = s.theta > 0 ? 0 : 1
        // Labels stay clear of each other: θ on the side away from the bob, L beside the rod on the bob's side.
        const side = s.theta >= 0 ? 1 : -1
        const lx = px + len * 0.62 * Math.sin(s.theta) + side * 10
        const ly = py + len * 0.62 * Math.cos(s.theta)
        return (
          <g key={it.key}>
            <line x1={px} y1={py} x2={px} y2={py + len + 18} className="sim-guide" />
            {trail.length > 1 ? <polyline points={trail.join(' ')} className="sim-trail" style={{ stroke: it.color }} /> : null}
            {Math.abs(s.theta) > 0.01 ? <path d={`M${px},${py + r} A${r},${r} 0 0 ${sweep} ${ax.toFixed(1)},${ay.toFixed(1)}`} className="sim-angle" /> : null}
            <text x={px - side * 7} y={py + r + 6} textAnchor={side > 0 ? 'end' : 'start'} className="sim-label small">
              {`θ ${fmt.number(s.thetaDeg, 1)}°`}
            </text>
            <line x1={px} y1={py} x2={bx} y2={by} className="sim-rod" />
            <circle cx={px} cy={py} r={4.5} className="sim-pivot" />
            {it.imageUrl ? (
              <image href={it.imageUrl} x={bx - 24} y={by - 24} width={48} height={48} preserveAspectRatio="xMidYMid meet" />
            ) : (
              <circle cx={bx} cy={by} r={14} className="sim-body" style={{ fill: it.color }} />
            )}
            <text x={lx} y={ly} className="sim-label" textAnchor={side > 0 ? 'start' : 'end'}>
              {`L = ${fmt.number(it.L, 2)} m`}
            </text>
            <Tag x={px - 96} y={top + 18} text={items.length > 1 ? it.label : ''} color={it.color} />
          </g>
        )
      })}
    </svg>
  )
}

// ----------------------------------------------------------------------------- projectile
export function ProjectileScene({ items, t, title, describedBy }) {
  const { fmt } = useT()
  const uid = useId().replace(/[:]/g, '')
  const H = 300
  const left = 40
  const right = 18
  const top = 22
  const bottom = 36
  const worldW = Math.max(0.5, ...items.map((it) => it.result.outputs.range)) * 1.08
  const worldH = Math.max(0.5, ...items.map((it) => Math.max(it.result.outputs.max_height, it.result.values.h0))) * 1.18
  const scale = Math.min((W - left - right) / worldW, (H - top - bottom) / worldH)
  const X = (x) => left + x * scale
  const Y = (y) => H - bottom - y * scale
  const lastRange = X(items[items.length - 1]?.result.outputs.range ?? 0)
  // Range labels: skip ones that would collide with "0" or with the current scenario's label.
  const showRange = (i) => {
    const x = X(items[i].result.outputs.range)
    if (x - X(0) < 28) return false
    return i === items.length - 1 || Math.abs(x - lastRange) > 64
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sim-scene" role="img" aria-label={title} aria-describedby={describedBy}>
      <ArrowDefs id={`${uid}-arrow`} />
      <line x1={left - 24} x2={W - right} y1={Y(0)} y2={Y(0)} className="sim-ground" />
      {Array.from({ length: 24 }, (_, i) => (
        <line key={i} x1={left - 22 + i * 20} y1={Y(0) + 2} x2={left - 30 + i * 20} y2={Y(0) + 10} className="sim-hatch" />
      ))}
      <text x={X(0)} y={Y(0) + 26} textAnchor="middle" className="sim-label small">
        0
      </text>
      {items.map((it, i) => {
        const res = it.result
        const tt = Math.min(t, res.duration)
        const s = res.stateAt(tt)
        const h0 = res.values.h0
        const traveled = []
        const steps = 40
        for (let k = 0; k <= steps; k += 1) {
          const sk = res.stateAt((tt * k) / steps)
          traveled.push(`${X(sk.x).toFixed(1)},${Y(sk.y).toFixed(1)}`)
        }
        const full = res.plot.points.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')
        const speed = Math.hypot(s.vx, s.vy)
        const k = speed > 0 ? Math.min(46, 10 + speed * 1.6) / speed : 0
        const apexX = res.values.v0 * Math.cos((res.values.angle * Math.PI) / 180) * res.outputs.time_to_apex
        const landed = t >= res.duration - 1e-9
        return (
          <g key={it.key}>
            {h0 > 0 ? <rect x={X(0) - 16} y={Y(h0)} width={16} height={Math.max(0, Y(0) - Y(h0))} className="sim-platform" /> : null}
            <polyline points={full} className="sim-path-full" style={{ stroke: it.color }} />
            <polyline points={traveled.join(' ')} className="sim-path" style={{ stroke: it.color, strokeDasharray: it.dash ? '7 5' : undefined }} />
            {res.outputs.max_height > h0 + 1e-6 && i === items.length - 1 ? (
              <g>
                <line x1={X(apexX)} x2={X(apexX)} y1={Y(res.outputs.max_height)} y2={Y(0)} className="sim-guide" />
                <text x={X(apexX) + 6} y={Y(res.outputs.max_height) - 6} className="sim-label small">
                  {`H = ${fmt.number(res.outputs.max_height, 2)} m`}
                </text>
              </g>
            ) : null}
            {showRange(i) ? (
              <text x={X(res.outputs.range)} y={Y(0) + 26} textAnchor={X(res.outputs.range) > W - 70 ? 'end' : 'middle'} className="sim-label small">
                {`${fmt.number(res.outputs.range, 1)} m`}
              </text>
            ) : null}
            {speed > 0 && !landed ? <line x1={X(s.x)} y1={Y(s.y)} x2={X(s.x) + s.vx * k} y2={Y(s.y) - s.vy * k} className="sim-arrow" markerEnd={`url(#${uid}-arrow)`} /> : null}
            {it.imageUrl ? (
              <image href={it.imageUrl} x={X(s.x) - 15} y={Y(s.y) - 15} width={30} height={30} preserveAspectRatio="xMidYMid meet" />
            ) : (
              <circle cx={X(s.x)} cy={Y(s.y)} r={9} className="sim-body" style={{ fill: it.color }} />
            )}
            {items.length > 1 ? <Tag x={X(0) + 18 + i * 32} y={top + 6} text={it.label} color={it.color} /> : null}
          </g>
        )
      })}
    </svg>
  )
}

// ----------------------------------------------------------------------------- compound interest
export function InterestScene({ result, t, title, formatMoney, labels, describedBy }) {
  const H = 270
  const left = 14
  const right = 14
  const top = 58
  const bottom = 30
  const marks = result.yearly
  const n = Math.max(1, marks.length)
  const slot = (W - left - right) / n
  const bw = Math.max(4, Math.min(24, slot * 0.68))
  const maxV = Math.max(...marks.map((m) => Math.max(m.amount, m.simple)), 1) * 1.06
  const Y = (v) => H - bottom - (v / maxV) * (H - top - bottom)
  const P = result.values.P
  const live = result.stateAt(t)
  const every = Math.ceil(n / 10)
  const simplePts = marks.filter((m) => m.year <= t + 1e-9).map((m, i) => `${(left + slot * (i + 0.5)).toFixed(1)},${Y(m.simple).toFixed(1)}`)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sim-scene" role="img" aria-label={title} aria-describedby={describedBy}>
      <text x={left} y={22} className="sim-label small">
        {labels.year}
      </text>
      <text x={left} y={50} className="sim-big">
        {formatMoney(live.amount)}
      </text>
      <line x1={left} x2={W - right} y1={Y(0)} y2={Y(0)} className="sim-ground" />
      {marks.map((m, i) => {
        const cx = left + slot * (i + 0.5)
        const shown = m.year <= t + 1e-9
        const value = shown ? m.amount : null
        const label =
          i % every === 0 || i === n - 1 ? (
            <text key={`l${i}`} x={cx} y={H - 10} textAnchor="middle" className="sim-label small">
              {Number.isInteger(m.year) ? m.year : m.year.toFixed(1)}
            </text>
          ) : null
        if (value === null) {
          return (
            <g key={i}>
              <rect x={cx - bw / 2} y={Y(0) - 2} width={bw} height={2} className="sim-bar-ghost" />
              {label}
            </g>
          )
        }
        const yP = Y(Math.min(P, value))
        const yA = Y(value)
        const interestH = Math.max(0, yP - yA - 2)
        return (
          <g key={i}>
            <rect x={cx - bw / 2} y={yP} width={bw} height={Math.max(0, Y(0) - yP)} className="sim-bar-principal" />
            {interestH > 0 ? <path d={`M${cx - bw / 2},${yP - 2} V${yA + 4} Q${cx - bw / 2},${yA} ${cx - bw / 2 + 4},${yA} H${cx + bw / 2 - 4} Q${cx + bw / 2},${yA} ${cx + bw / 2},${yA + 4} V${yP - 2} Z`} className="sim-bar-interest" /> : null}
            {label}
          </g>
        )
      })}
      {simplePts.length > 1 ? <polyline points={simplePts.join(' ')} className="sim-simple-line" /> : null}
    </svg>
  )
}

// ----------------------------------------------------------------------------- spring–mass
function springPath(x1, x2, y, coils = 11, amp = 9) {
  const lead = Math.min(10, Math.max(2, (x2 - x1) * 0.08))
  const a = x1 + lead
  const b = x2 - lead
  const seg = (b - a) / (coils * 2)
  let d = `M${x1.toFixed(1)},${y} L${a.toFixed(1)},${y}`
  for (let i = 1; i <= coils * 2; i += 1) {
    const x = a + seg * i
    const yy = i === coils * 2 ? y : y + (i % 2 ? -amp : amp)
    d += ` L${x.toFixed(1)},${yy}`
  }
  return `${d} L${x2.toFixed(1)},${y}`
}

export function SpringScene({ items, t, maxAmp, title, labels, describedBy }) {
  const { fmt } = useT()
  const uid = useId().replace(/[:]/g, '')
  const laneH = 118
  const H = items.length * laneH + 16
  const wallX = 34
  const eqX = W / 2 + 20
  const scale = (W / 2 - 74) / Math.max(maxAmp, 0.01)
  const size = 46
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sim-scene" role="img" aria-label={title} aria-describedby={describedBy}>
      <ArrowDefs id={`${uid}-arrow`} />
      {items.map((it, i) => {
        const y0 = 10 + i * laneH
        const floor = y0 + 84
        const cy = floor - size / 2
        const x = it.result.stateAt(t).x
        const cx = eqX + x * scale
        return (
          <g key={it.key}>
            <rect x={wallX - 14} y={y0 + 10} width={14} height={floor - y0 - 10} className="sim-wall" />
            <line x1={wallX - 14} x2={W - 16} y1={floor} y2={floor} className="sim-ground" />
            <line x1={eqX} x2={eqX} y1={y0 + 8} y2={floor + 4} className="sim-guide" />
            {i === 0 ? (
              <text x={eqX + 5} y={y0 + 18} className="sim-label small">
                {labels.equilibrium}
              </text>
            ) : null}
            <path d={springPath(wallX, cx - size / 2, cy)} className="sim-spring" />
            {it.imageUrl ? (
              <image href={it.imageUrl} x={cx - size / 2} y={cy - size / 2} width={size} height={size} preserveAspectRatio="xMidYMid meet" />
            ) : (
              <rect x={cx - size / 2} y={cy - size / 2} width={size} height={size} rx={6} className="sim-body" style={{ fill: it.color }} />
            )}
            <text x={cx} y={cy + 5} textAnchor="middle" className="sim-mass-text" aria-hidden="true">
              {it.imageUrl ? '' : 'm'}
            </text>
            {Math.abs(x * scale) > 6 ? <line x1={eqX} x2={cx} y1={floor + 14} y2={floor + 14} className="sim-arrow" markerEnd={`url(#${uid}-arrow)`} /> : null}
            <text x={eqX} y={floor + 30} textAnchor="middle" className="sim-label small">
              {`x = ${fmt.number(x, 3)} m`}
            </text>
            {items.length > 1 ? <Tag x={wallX + 26} y={y0 + 16} text={it.label} color={it.color} /> : null}
          </g>
        )
      })}
    </svg>
  )
}
