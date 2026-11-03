import { describe, expect, it } from 'vitest'
import { runModel } from '../../sim/models.js'
import { pendulumStandLength, scene3dState, springMaxAmp, STAGE_3D } from './scene3d.js'

const item = (model, values, extra = {}) => {
  const run = runModel(model, values)
  const result = run.result
  return { result, stateAt: result.stateAt, L: result.values.L, ...extra }
}

describe('3D scene state (a pure function of the clock and the results)', () => {
  it('offers 3D for the three physics models only', () => {
    expect(Object.keys(STAGE_3D)).toEqual(['pendulum', 'projectile', 'spring_mass'])
    expect(STAGE_3D.compound_interest).toBeUndefined()
  })

  it('sizes the pendulum stand from the slider, not from the value being dragged', () => {
    expect(pendulumStandLength(2.5, [{ L: 0.8 }])).toBe(2.5)
    expect(pendulumStandLength(2.4, [{ L: 0.8 }])).toBe(2.5)
    expect(pendulumStandLength(undefined, [{ L: 0.8 }])).toBe(1)
    expect(pendulumStandLength(12, [{ L: 0.8 }])).toBe(5)
    expect(pendulumStandLength(0, [{ L: 1.2 }, { L: 2.1 }])).toBe(2.5)
  })

  it('swings the pendulum by the model angle at time t', () => {
    const p = item('pendulum', { L: 0.8, g: 9.81, theta0: 8 })
    const at0 = scene3dState('pendulum', [p], 0)
    expect(at0.items).toHaveLength(1)
    expect(at0.items[0].length).toBe(0.8)
    expect(at0.items[0].theta).toBeCloseTo((8 * Math.PI) / 180, 9)
    expect(at0.items[0].amplitude).toBeCloseTo((8 * Math.PI) / 180, 12)
    // a quarter period later the bob passes the bottom
    const T = p.result.outputs.period_numeric
    expect(Math.abs(scene3dState('pendulum', [p], T / 4).items[0].theta)).toBeLessThan(0.01)
    // the same time gives the same picture: stepping and scrubbing agree
    expect(scene3dState('pendulum', [p], 1.234)).toEqual(scene3dState('pendulum', [p], 1.234))
  })

  it('places the ball on its path and draws the trail up to it', () => {
    const b = item('projectile', { v0: 12, angle: 45, g: 9.81, h0: 0 })
    const flight = b.result.duration
    const start = scene3dState('projectile', [b], 0, { num: (v, d) => v.toFixed(d) })
    expect(start.lanes[0].x).toBe(0)
    expect(start.lanes[0].progress).toBe(0)
    expect(start.lanes[0].landed).toBe(false)
    expect(start.lanes[0].rangeText).toBe(`${b.result.outputs.range.toFixed(1)} m`)
    expect(start.lanes[0].heightText).toMatch(/^H = /)
    const mid = scene3dState('projectile', [b], flight / 2).lanes[0]
    expect(mid.x).toBeCloseTo(b.result.outputs.range / 2, 9)
    expect(mid.y).toBeCloseTo(b.result.outputs.max_height, 6)
    expect(mid.apexX).toBeCloseTo(b.result.outputs.range / 2, 9)
    const end = scene3dState('projectile', [b], flight + 5).lanes[0]
    expect(end.landed).toBe(true)
    expect(end.progress).toBe(1)
    expect(end.x).toBeCloseTo(b.result.outputs.range, 9)
  })

  it('fits A and B on one field and labels the height of B only', () => {
    const a = item('projectile', { v0: 12, angle: 30, g: 9.81, h0: 0 })
    const b = item('projectile', { v0: 12, angle: 60, g: 9.81, h0: 0 })
    const st = scene3dState('projectile', [a, b], 0.5)
    expect(st.lanes).toHaveLength(2)
    expect(st.layout.metres).toBeGreaterThanOrEqual(Math.max(a.result.outputs.range, b.result.outputs.range))
    expect(st.lanes[0].heightText).toBe('')
    expect(st.lanes[1].heightText).not.toBe('')
  })

  it('moves the spring mass by the model displacement', () => {
    const s = item('spring_mass', { k: 20, m: 0.5, x0: 0.1, b: 0 })
    expect(scene3dState('spring_mass', [s], 0, { num: (v, d) => v.toFixed(d) }).lanes[0]).toEqual({ x: 0.1, massText: '0.50 kg' })
    const T = s.result.outputs.period
    expect(scene3dState('spring_mass', [s], T / 2).lanes[0].x).toBeCloseTo(-0.1, 3)
    expect(springMaxAmp(0.5, [s])).toBe(0.5)
    expect(springMaxAmp(undefined, [s])).toBe(0.1)
  })

  it('has no 3D state for compound interest', () => {
    const c = item('compound_interest', { P: 1000, r: 5, n: 12, t: 10 })
    expect(scene3dState('compound_interest', [c], 1)).toBeNull()
  })
})
