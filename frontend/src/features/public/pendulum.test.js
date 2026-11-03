import { describe, expect, it } from 'vitest'
import {
  LENGTH_MAX,
  LENGTH_MIN,
  advancePhase,
  angleAt,
  bobPosition,
  lengthToPixels,
  pendulumPeriod,
  snapLength,
} from './pendulum.js'

describe('pendulum demo model', () => {
  it('matches the worked examples in the spec (§6.3)', () => {
    expect(pendulumPeriod(1)).toBeCloseTo(2.006, 3)
    expect(pendulumPeriod(0.25)).toBeCloseTo(1.003, 3)
    expect(Number(pendulumPeriod(1).toFixed(2))).toBe(2.01)
    expect(Number(pendulumPeriod(0.25).toFixed(2))).toBe(1)
  })

  it('quadrupling the length doubles the period', () => {
    expect(pendulumPeriod(2) / pendulumPeriod(0.5)).toBeCloseTo(2, 10)
  })

  it('rejects non-physical input', () => {
    expect(Number.isNaN(pendulumPeriod(0))).toBe(true)
    expect(Number.isNaN(pendulumPeriod(-1))).toBe(true)
    expect(Number.isNaN(pendulumPeriod(1, 0))).toBe(true)
  })

  it('advances one full turn of phase per period and clamps large frame gaps', () => {
    const T = 2
    let phase = 0
    for (let i = 0; i < 50; i += 1) phase = advancePhase(phase, 0.02, T) // 1 s
    expect(phase).toBeCloseTo(Math.PI, 6)
    expect(advancePhase(0, 5, T)).toBeCloseTo((2 * Math.PI * 0.1) / T, 10)
  })

  it('swings symmetrically', () => {
    expect(angleAt(0, 12)).toBe(12)
    expect(angleAt(Math.PI, 12)).toBeCloseTo(-12, 10)
    const left = bobPosition(100, 10, 100, -12)
    const right = bobPosition(100, 10, 100, 12)
    expect(left.y).toBeCloseTo(right.y, 10)
    expect(100 - left.x).toBeCloseTo(right.x - 100, 10)
  })

  it('maps lengths to pixels monotonically and snaps slider values', () => {
    expect(lengthToPixels(LENGTH_MIN)).toBe(46)
    expect(lengthToPixels(LENGTH_MAX)).toBe(196)
    expect(lengthToPixels(1)).toBeGreaterThan(lengthToPixels(0.5))
    expect(snapLength(0.30000000000000004)).toBeCloseTo(0.3, 12)
    expect(snapLength(99)).toBe(LENGTH_MAX)
  })
})
