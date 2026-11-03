import { describe, expect, it } from 'vitest'
import { heatOpacity } from './Heatmap.jsx'
import { clampTo, decimalsFor, extent, linearScale, nearestIndex, niceDomain, niceNum, niceTicks, robustDomain, sampleIndices, segments, toPoints } from './scale.js'

describe('nice ticks', () => {
  it('niceNum picks 1/2/5×10^k', () => {
    expect(niceNum(0.73)).toBe(1)
    expect(niceNum(0.6)).toBe(0.5)
    expect(niceNum(2.6)).toBe(2)
    expect(niceNum(4)).toBe(5)
    expect(niceNum(8)).toBe(10)
  })
  it('ticks are round and cover the range', () => {
    expect(niceTicks(-10, 10, 5).ticks).toEqual([-10, -5, 0, 5, 10])
    expect(niceTicks(0, 1, 4).ticks).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
    const { ticks, decimals } = niceTicks(0.1, 0.35, 4)
    expect(ticks).toEqual([0.1, 0.15, 0.2, 0.25, 0.3, 0.35])
    expect(decimals).toBe(2)
  })
  it('no floating-point dust and no negative zero', () => {
    const { ticks } = niceTicks(-0.3, 0.3, 6)
    expect(ticks).toContain(0.1)
    expect(ticks.every((v) => !Object.is(v, -0))).toBe(true)
  })
  it('handles degenerate ranges', () => {
    expect(niceTicks(5, 5).ticks.length).toBeGreaterThan(1)
    expect(niceTicks(NaN, 1).ticks).toEqual([])
    expect(niceDomain(3, 3)[0]).toBeLessThan(3)
  })
  it('niceDomain snaps outward', () => {
    expect(niceDomain(0.3, 9.2, 5)).toEqual([0, 10])
    expect(niceDomain(-2.6, 2.6, 5)).toEqual([-3, 3])
  })
  it('decimalsFor', () => {
    expect(decimalsFor(0.25)).toBe(2)
    expect(decimalsFor(5)).toBe(0)
    expect(decimalsFor(0.1)).toBe(1)
    expect(decimalsFor(2e-5)).toBe(5)
  })
})

describe('scales and data helpers', () => {
  it('linear scale and inverse', () => {
    const s = linearScale([0, 10], [0, 200])
    expect(s(5)).toBe(100)
    expect(s.invert(50)).toBe(2.5)
    const flipped = linearScale([0, 1], [100, 0])
    expect(flipped(0.25)).toBe(75)
  })
  it('accepts several point formats', () => {
    expect(toPoints([[1, 2]])).toEqual([[1, 2]])
    expect(toPoints([{ x: 1, y: 2 }])).toEqual([[1, 2]])
    expect(toPoints({ x: [1, 2], y: [3, 4] })).toEqual([
      [1, 3],
      [2, 4],
    ])
    expect(toPoints(null)).toEqual([])
  })
  it('segments break at NaN and Infinity', () => {
    const runs = segments([
      [0, 1],
      [1, 2],
      [2, NaN],
      [3, 4],
      [4, Infinity],
      [5, 6],
      [6, 7],
    ])
    expect(runs).toEqual([
      [
        [0, 1],
        [1, 2],
      ],
      [[3, 4]],
      [
        [5, 6],
        [6, 7],
      ],
    ])
  })
  it('robust domain ignores asymptote spikes but keeps ordinary extremes', () => {
    const parabola = Array.from({ length: 201 }, (_, i) => ((i - 100) / 10) ** 2)
    const [lo, hi] = robustDomain(parabola)
    expect(lo).toBeLessThan(0.01)
    expect(hi).toBeGreaterThan(100)
    const spiky = [...Array.from({ length: 200 }, (_, i) => Math.sin(i / 10)), 1e9]
    expect(robustDomain(spiky)[1]).toBeLessThan(10)
    expect(robustDomain([2, 2, 2])).toEqual([1, 3])
    expect(robustDomain([5], { includeZero: true })[0]).toBeLessThan(0.01)
  })
  it('nearestIndex works on sorted and unsorted data', () => {
    const pts = [
      [0, 0],
      [1, 1],
      [2, 4],
      [3, 9],
    ]
    expect(nearestIndex(pts, 1.4)).toBe(1)
    expect(nearestIndex(pts, 2.6)).toBe(3)
    expect(
      nearestIndex(
        [
          [3, 0],
          [1, 0],
          [2, 0],
        ],
        1.2,
      ),
    ).toBe(1)
    expect(nearestIndex([], 1)).toBe(-1)
  })
  it('sampleIndices includes both ends', () => {
    expect(sampleIndices(100, 5)).toEqual([0, 25, 50, 74, 99])
    expect(sampleIndices(3, 10)).toEqual([0, 1, 2])
  })
  it('extent and clamp', () => {
    expect(extent([3, NaN, -1, Infinity, 2])).toEqual([-1, 3])
    expect(extent([NaN])).toBeNull()
    expect(clampTo(1e12, [0, 10])).toBe(90)
  })
})

describe('heatmap ramp', () => {
  it('is monotonic and skips the low-contrast band', () => {
    let prev = -1
    for (let w = 0; w <= 1.0001; w += 0.05) {
      const o = heatOpacity(w)
      expect(o).toBeGreaterThanOrEqual(prev)
      expect(o <= 0.6 + 1e-9 || o >= 0.76 - 1e-9).toBe(true)
      prev = o
    }
    expect(heatOpacity(1)).toBeCloseTo(1, 12)
  })
})
