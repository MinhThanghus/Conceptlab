import { useId } from 'react'
import { AMPLITUDE_DEG, LENGTH_MAX, bobPosition } from './pendulum.js'

const PIVOT = { x: 180, y: 34 }
const PX_PER_M = 100 // the ruler is in metres: 10 px per 10 cm, so L reads true

/**
 * The light 2D stand: what the hero shows when the device or the network should not load 3D.
 * A diagram of the real setup (pivot, string, bob, the swing it keeps, L on a ruler), drawn in
 * the page's inks; a pure function of the length and the angle.
 */
export default function PendulumStage2D({ length, angleDeg, amplitudeDeg = AMPLITUDE_DEG, label }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const lengthPx = Math.min(LENGTH_MAX, Math.max(0, Number(length) || 0)) * PX_PER_M
  const bob = bobPosition(PIVOT.x, PIVOT.y, lengthPx, angleDeg)
  const left = bobPosition(PIVOT.x, PIVOT.y, lengthPx, -amplitudeDeg)
  const right = bobPosition(PIVOT.x, PIVOT.y, lengthPx, amplitudeDeg)
  return (
    <svg className="hero-lab-2d" viewBox="0 0 360 320" role="img" aria-label={label}>
      <defs>
        <clipPath id={`${uid}-r`}>
          <rect x="44" y={PIVOT.y} width="22" height={lengthPx} rx="3" />
        </clipPath>
      </defs>
      <rect x="110" y="20" width="140" height="10" rx="4" className="s2-beam" />
      <rect x="44" y={PIVOT.y - 6} width="22" height={lengthPx + 12} rx="4" className="s2-ruler" />
      <g clipPath={`url(#${uid}-r)`}>
        {Array.from({ length: LENGTH_MAX * 10 + 1 }, (_, i) => (
          <line key={i} x1="44" x2={i % 5 === 0 ? 60 : 52} y1={PIVOT.y + i * 10} y2={PIVOT.y + i * 10} className="s2-tick" />
        ))}
      </g>
      <path d={`M ${left.x} ${left.y} A ${lengthPx} ${lengthPx} 0 0 0 ${right.x} ${right.y}`} className="s2-arc" />
      <line x1={PIVOT.x} y1={PIVOT.y} x2={bob.x} y2={bob.y} className="s2-string" />
      <circle cx={PIVOT.x} cy={PIVOT.y} r="5" className="s2-pivot" />
      <circle cx={bob.x} cy={bob.y} r="14" className="s2-bob" />
      <rect x="66" y={PIVOT.y + lengthPx - 4} width="14" height="8" rx="2" className="s2-tab" />
    </svg>
  )
}
