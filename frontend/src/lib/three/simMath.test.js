import { describe, expect, it } from 'vitest'
import {
  arcAt,
  arcFractions,
  fillHelixTube,
  flightProgress,
  helixFrame,
  helixPoint,
  helixPoints,
  helixTubeIndex,
  helixTubeSize,
  niceCeil,
  niceStep,
  oklchToHex,
  projectileLayout,
  springLayout,
  springLength,
  ticks,
} from './simMath.js'

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a) => Math.hypot(a[0], a[1], a[2])

describe('round numbers for scales and ticks', () => {
  it('picks 1, 2, 2.5 or 5 × 10^k steps', () => {
    expect(niceStep(10, 5)).toBe(2)
    expect(niceStep(40, 5)).toBe(10)
    expect(niceStep(12, 5)).toBe(2.5)
    expect(niceStep(0.3, 4)).toBe(0.1)
    expect(niceStep(0, 5)).toBe(1)
    expect(niceStep(NaN)).toBe(1)
  })

  it('rounds a length up to the next round number', () => {
    expect(niceCeil(14.68)).toBe(15)
    expect(niceCeil(15)).toBe(15)
    expect(niceCeil(41)).toBe(50)
    expect(niceCeil(0.115)).toBe(0.15)
    expect(niceCeil(-3)).toBe(1)
  })

  it('lists marks without floating-point dust', () => {
    expect(ticks(0, 1, 0.1)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1])
    expect(ticks(-0.15, 0.15, 0.1)).toEqual([-0.1, 0, 0.1])
    expect(ticks(0, 1, 0)).toEqual([])
  })
})

describe('spring helix', () => {
  const opts = { length: 1.2, radius: 0.08, coils: 10 }

  it('runs from the support to the mass and keeps its radius', () => {
    const pts = helixPoints(200, opts)
    expect(pts).toHaveLength(201)
    expect(pts[0][0]).toBe(0)
    expect(pts[200][0]).toBeCloseTo(1.2, 12)
    for (const p of pts) expect(Math.hypot(p[1], p[2])).toBeCloseTo(0.08, 12)
    // the wire is back where it started after a whole number of coils
    expect(pts[200][1]).toBeCloseTo(pts[0][1], 9)
    expect(pts[200][2]).toBeCloseTo(pts[0][2], 9)
  })

  it('stretches by its pitch: the same coils over a longer length', () => {
    const a = helixPoint(0.25, opts)
    const b = helixPoint(0.25, { ...opts, length: 1.8 })
    expect(b[0]).toBeCloseTo(0.45, 12)
    expect(b[1]).toBeCloseTo(a[1], 12)
    expect(b[2]).toBeCloseTo(a[2], 12)
  })

  it('has an orthonormal frame whose normal points at the axis', () => {
    for (const u of [0, 0.13, 0.5, 0.97]) {
      const { T, N, B } = helixFrame(u, opts)
      expect(len(T)).toBeCloseTo(1, 12)
      expect(len(N)).toBeCloseTo(1, 12)
      expect(len(B)).toBeCloseTo(1, 12)
      expect(dot(T, N)).toBeCloseTo(0, 12)
      expect(dot(T, B)).toBeCloseTo(0, 12)
      const p = helixPoint(u, opts)
      // p + radius·N lands on the axis
      expect(p[1] + 0.08 * N[1]).toBeCloseTo(0, 12)
      expect(p[2] + 0.08 * N[2]).toBeCloseTo(0, 12)
    }
  })

  it('builds a closed tube of constant wire thickness with unit normals', () => {
    const segments = 120
    const radial = 8
    const size = helixTubeSize(segments, radial)
    const positions = new Float32Array(size * 3)
    const normals = new Float32Array(size * 3)
    fillHelixTube(positions, normals, { ...opts, wire: 0.01, segments, radial })
    for (let i = 0; i <= segments; i += 30) {
      const centre = helixPoint(i / segments, opts)
      for (let j = 0; j <= radial; j += 1) {
        const k = (i * (radial + 1) + j) * 3
        const d = [positions[k] - centre[0], positions[k + 1] - centre[1], positions[k + 2] - centre[2]]
        expect(len(d)).toBeCloseTo(0.01, 6)
        expect(len([normals[k], normals[k + 1], normals[k + 2]])).toBeCloseTo(1, 6)
      }
    }
    const index = helixTubeIndex(segments, radial)
    expect(index.length).toBe(segments * radial * 6)
    expect(Math.max(...index)).toBe(size - 1)
  })
})

describe('spring track ruler', () => {
  it('reads true metres around the rest position, magnified to stay visible', () => {
    const lay = springLayout(0.1)
    expect(lay.half).toBe(0.15)
    expect(lay.ticks).toEqual([-0.1, 0, 0.1])
    expect(lay.scale).toBeCloseTo(0.5 / 0.15, 12)
    const small = springLayout(0.02)
    expect(small.half).toBe(0.025)
    expect(small.scale).toBeGreaterThan(lay.scale)
  })

  it('stretches the spring by the displacement and never turns it inside out', () => {
    const lay = springLayout(0.1)
    expect(springLength(0, lay, 1)).toBe(1)
    expect(springLength(0.1, lay, 1)).toBeCloseTo(1 + 0.1 * lay.scale, 12)
    expect(springLength(-10, lay, 1)).toBe(0.25)
  })
})

describe('projectile field', () => {
  it('fits the longest throw on a round number of metres with one scale for both axes', () => {
    const lay = projectileLayout([{ range: 14.68, maxHeight: 3.67, h0: 0 }], { length: 5, height: 2.5 })
    expect(lay.metres).toBeGreaterThanOrEqual(14.68)
    expect(lay.scale * 14.68).toBeLessThanOrEqual(5)
    expect(lay.scale * 3.67).toBeLessThanOrEqual(2.5)
    expect(lay.ticks[0]).toBe(0)
    expect(lay.ticks.at(-1)).toBeLessThanOrEqual(lay.metres)
    expect(lay.step).toBe(niceStep(lay.metres, 5))
  })

  it('keeps the field when a throw changes a little, so the change is seen', () => {
    const a = projectileLayout([{ range: 12.1, maxHeight: 3, h0: 0 }])
    const b = projectileLayout([{ range: 13.4, maxHeight: 3.3, h0: 0 }])
    expect(b.scale).toBe(a.scale)
  })

  it('fits A and B together and a tall throw by its height', () => {
    const both = projectileLayout([{ range: 10, maxHeight: 2, h0: 0 }, { range: 30, maxHeight: 8, h0: 0 }], { length: 5, height: 2.5 })
    expect(both.scale * 30).toBeLessThanOrEqual(5)
    const tall = projectileLayout([{ range: 4, maxHeight: 20, h0: 0 }], { length: 5, height: 2.5 })
    expect(tall.scale * 20).toBeLessThanOrEqual(2.5)
    expect(tall.metres).toBeGreaterThan(4)
  })

  it('maps equal-time samples to the length of the trail', () => {
    // a straight run: time and length agree
    const line = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]
    const f = arcFractions(line)
    expect(Array.from(f)).toEqual([0, 1 / 3, 2 / 3, 1])
    expect(arcAt(f, 0.5)).toBeCloseTo(0.5, 12)
    // a throw climbs fast and slows near the top: half the time covers more than half the path
    const v = 10
    const path = Array.from({ length: 41 }, (_, i) => {
      const t = (i / 40) * 2
      return [v * 0.6 * t, v * 0.8 * t - 4.905 * t * t]
    })
    const g = arcFractions(path)
    expect(g[0]).toBe(0)
    expect(g[40]).toBe(1)
    expect(arcAt(g, 0.25)).toBeGreaterThan(0.25)
    expect(arcAt(g, 0)).toBe(0)
    expect(arcAt(g, 1)).toBe(1)
  })

  it('tracks the flight from launch to landing', () => {
    expect(flightProgress(0, 2)).toBe(0)
    expect(flightProgress(1, 2)).toBe(0.5)
    expect(flightProgress(5, 2)).toBe(1)
    expect(flightProgress(1, 0)).toBe(1)
  })
})

describe('token colours for the 3D materials', () => {
  it('turns OKLCH into sRGB hex', () => {
    expect(oklchToHex('oklch(100% 0 0)')).toBe('#ffffff')
    expect(oklchToHex('oklch(0% 0 0)')).toBe('#000000')
    expect(oklchToHex('oklch(62.796% 0.25768 29.2338)')).toBe('#ff0000')
    expect(oklchToHex(' oklch(97% 0.012 95) ')).toBe('#f7f5ec')
    expect(oklchToHex('oklch(0.5 0.17 250)')).toBe(oklchToHex('oklch(50% 0.17 250)'))
    expect(oklchToHex('#123456')).toBeNull()
  })
})
