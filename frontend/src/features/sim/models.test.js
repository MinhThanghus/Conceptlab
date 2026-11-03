import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import localCases from './sim_cases.local.json'
import {
  checkReferenceCase,
  defaultValues,
  MODEL_SPECS,
  naturalDuration,
  outputKeys,
  pendulumExactPeriod,
  pendulumNumericPeriod,
  referenceInputs,
  referenceOutputs,
  resolveOutputKey,
  runModel,
  simulateCompoundInterest,
  simulatePendulum,
  simulateProjectile,
  simulateSpring,
  SIM_MODEL_IDS,
  suggestOutputKey,
  validateValues,
  zeroCrossings,
} from './models.js'

function closeTo(actual, expected, relTol) {
  if (expected === 0) return Math.abs(actual) <= relTol
  return Math.abs(actual - expected) <= relTol * Math.abs(expected)
}

/** Normalise the shapes a cases file may use into [{ model, inputs, key, expected, tolerance }]. */
function flattenCases(data) {
  const list = Array.isArray(data) ? data : data.cases || []
  const out = []
  for (const c of list) {
    const inputs = c.inputs || c.params || {}
    const tolerance = Number(c.tolerance ?? 1e-6)
    if (c.expected && typeof c.expected === 'object') {
      for (const [key, value] of Object.entries(c.expected)) out.push({ model: c.model, inputs, key, expected: value, tolerance })
    } else if (c.output !== undefined) {
      out.push({ model: c.model, inputs, key: c.output, expected: Number(c.expected), tolerance })
    }
  }
  return out
}

describe('sim models — analytic vectors (sim_cases.local.json)', () => {
  const cases = flattenCases(localCases)
  it('has at least 16 checks', () => {
    expect(cases.length).toBeGreaterThanOrEqual(16)
  })
  for (const c of cases) {
    it(`${c.model} ${JSON.stringify(c.inputs)} → ${c.key}`, () => {
      const run = runModel(c.model, c.inputs)
      expect(run.ok).toBe(true)
      const actual = run.result.outputs[c.key]
      expect(Number.isFinite(actual)).toBe(true)
      expect(closeTo(actual, c.expected, c.tolerance), `${actual} vs ${c.expected}`).toBe(true)
    })
  }
})

// Vitest runs from frontend/ (jsdom gives import.meta.url an http scheme, so resolve from cwd).
const sharedPath = [resolve(process.cwd(), '..', 'shared', 'sim_cases.json'), resolve(process.cwd(), 'shared', 'sim_cases.json')].find((p) => existsSync(p)) || ''

describe.skipIf(!sharedPath)('sim models — shared vectors (shared/sim_cases.json, same semantics as run_case)', () => {
  const data = sharedPath ? JSON.parse(readFileSync(sharedPath, 'utf8')) : { cases: [] }
  const cases = flattenCases(data)
  it('parses the shared file (≥ 16 cases)', () => {
    expect(cases.length).toBeGreaterThanOrEqual(16)
  })
  for (const c of cases) {
    it(`${c.model} ${JSON.stringify(c.inputs)} → ${c.key} ≈ ${c.expected}`, () => {
      expect(resolveOutputKey(c.model, c.key), `unknown output ${c.key}`).toBe(c.key)
      const res = checkReferenceCase(c.model, { inputs: c.inputs, output: c.key, expected: c.expected, tolerance: c.tolerance })
      expect(res.status, `${res.actual} vs ${c.expected} (${res.code || ''})`).toBe('pass')
    })
  }
})

describe('pendulum', () => {
  it('numeric period matches the exact elliptic period without damping', () => {
    for (const th of [5, 30, 60, 90]) {
      expect(closeTo(pendulumNumericPeriod(1, 9.81, th, 0), pendulumExactPeriod(1, 9.81, th), 1e-6)).toBe(true)
    }
  })
  it('θ0 = 0 gives the small-angle limit; over-damping gives NaN', () => {
    expect(pendulumNumericPeriod(1, 9.81, 0, 0)).toBeCloseTo(2 * Math.PI * Math.sqrt(1 / 9.81), 12)
    expect(Number.isNaN(pendulumNumericPeriod(1, 9.81, 10, 20))).toBe(true)
    expect(simulatePendulum({ L: 1, theta0: 10, b: 20 }).outputs.period_numeric).toBeNull()
  })
  it('numeric period grows with amplitude', () => {
    const small = simulatePendulum({ L: 1, theta0: 5 }).outputs.period_numeric
    const large = simulatePendulum({ L: 1, theta0: 70 }).outputs.period_numeric
    expect(large).toBeGreaterThan(small)
  })
  it('damping shrinks the amplitude over time', () => {
    const r = simulatePendulum({ L: 1, theta0: 20, b: 0.3 })
    const late = Math.max(...r.plot.points.filter(([t]) => t > r.duration - 3).map(([, th]) => Math.abs(th)))
    expect(late).toBeLessThan(10)
  })
  it('state starts at θ0 and passes zero after a quarter period', () => {
    const r = simulatePendulum({ L: 1, theta0: 10 })
    expect(r.stateAt(0).thetaDeg).toBeCloseTo(10, 6)
    expect(Math.abs(r.stateAt(r.outputs.period_numeric / 4).thetaDeg)).toBeLessThan(0.05)
  })
  it('animation series crosses zero at the numeric period rhythm', () => {
    const r = simulatePendulum({ L: 1, theta0: 10 })
    const h = r.duration / (r.plot.points.length - 1)
    const crossings = zeroCrossings(r.plot.points.map((p) => p[1]), h)
    expect(crossings.length).toBeGreaterThan(10)
  })
})

describe('projectile', () => {
  it('trajectory starts at h0 and lands at the range', () => {
    const r = simulateProjectile({ v0: 15, angle: 30, h0: 2 })
    const pts = r.plot.points
    expect(pts[0]).toEqual([0, 2])
    expect(pts[pts.length - 1][0]).toBeCloseTo(r.outputs.range, 9)
    expect(pts[pts.length - 1][1]).toBe(0)
    expect(Math.max(...pts.map((p) => p[1]))).toBeLessThanOrEqual(r.outputs.max_height + 1e-9)
  })
  it('45° maximises the range on flat ground', () => {
    const at = (angle) => simulateProjectile({ v0: 20, angle, h0: 0 }).outputs.range
    expect(at(45)).toBeGreaterThan(at(30))
    expect(at(45)).toBeGreaterThan(at(60))
    expect(at(30)).toBeCloseTo(at(60), 9)
  })
  it('a vertical throw has zero range', () => {
    const r = simulateProjectile({ v0: 10, angle: 90 })
    expect(r.outputs.range).toBeCloseTo(0, 9)
    expect(r.outputs.max_height).toBeCloseTo(100 / (2 * 9.81), 9)
  })
})

describe('compound interest', () => {
  it('yearly series covers 0..t and ends at the amount', () => {
    const r = simulateCompoundInterest({ P: 1000, r: 5, n: 12, t: 10 })
    expect(r.yearly).toHaveLength(11)
    expect(r.yearly[0].amount).toBe(1000)
    expect(r.yearly[10].amount).toBeCloseTo(r.outputs.amount, 9)
  })
  it('fractional years add a final point', () => {
    expect(simulateCompoundInterest({ P: 1000, r: 5, n: 1, t: 2.5 }).yearly.map((y) => y.year)).toEqual([0, 1, 2, 2.5])
  })
  it('compound beats simple interest for positive rates', () => {
    const r = simulateCompoundInterest({ P: 1000, r: 8, n: 4, t: 20 })
    expect(r.outputs.amount).toBeGreaterThan(r.outputs.simple_amount)
  })
  it('zero rate keeps the principal', () => {
    const r = simulateCompoundInterest({ P: 500, r: 0, n: 12, t: 5 })
    expect(r.outputs.amount).toBe(500)
    expect(r.outputs.interest).toBe(0)
  })
})

describe('spring–mass', () => {
  it('starts at x0 and reaches −x0 after half a period', () => {
    const r = simulateSpring({ k: 100, m: 1, x0: 0.2 })
    expect(r.stateAt(0).x).toBeCloseTo(0.2, 9)
    expect(r.stateAt(r.outputs.period / 2).x).toBeCloseTo(-0.2, 4)
  })
  it('critical damping ratio is 1 at b = 2√(km)', () => {
    expect(simulateSpring({ k: 25, m: 1, b: 10 }).outputs.damping_ratio).toBeCloseTo(1, 12)
  })
})

describe('reference cases & helpers', () => {
  it('reference outputs are exactly the backend ones; aliases only suggest', () => {
    expect(referenceOutputs('pendulum')).toEqual(['period', 'frequency', 'period_numeric'])
    expect(referenceOutputs('spring_mass')).toEqual(['angular_frequency', 'period', 'frequency'])
    expect(resolveOutputKey('pendulum', 'T')).toBeNull()
    expect(suggestOutputKey('pendulum', 'T')).toBe('period')
    expect(suggestOutputKey('projectile', 'time_of_flight')).toBe('flight_time')
    expect(suggestOutputKey('projectile', 'Range')).toBe('range')
    expect(suggestOutputKey('compound_interest', 'A')).toBe('amount')
    expect(suggestOutputKey('pendulum', 'banana')).toBeNull()
  })
  it('uses model input defaults and reports missing required inputs', () => {
    expect(referenceInputs('compound_interest', { P: 1000, r: 5, t: 10 }).values.n).toBe(1)
    expect(referenceInputs('pendulum', { g: 9.81 }).missing).toBe('L')
    expect(checkReferenceCase('projectile', { inputs: { v0: 10 }, output: 'range', expected: 1 })).toMatchObject({ status: 'error', code: 'missingInput', symbol: 'angle' })
  })
  it('checks the spec §6.3 examples', () => {
    expect(checkReferenceCase('pendulum', { inputs: { L: 1, g: 9.81 }, output: 'period', expected: 2.01, tolerance: 0.01 }).status).toBe('pass')
    expect(checkReferenceCase('pendulum', { inputs: { L: 0.25, g: 9.81 }, output: 'period', expected: 1.0, tolerance: 0.01 }).status).toBe('pass')
    expect(checkReferenceCase('pendulum', { inputs: { L: 1 }, output: 'period', expected: 3, tolerance: 0.01 }).status).toBe('fail')
    expect(checkReferenceCase('pendulum', { inputs: { L: 1 }, output: 'T', expected: 2 })).toMatchObject({ status: 'error', code: 'unknownOutput', suggestion: 'period' })
    expect(checkReferenceCase('pendulum', { inputs: { L: -1 }, output: 'period', expected: 1 })).toMatchObject({ status: 'error', code: 'invalidInput', symbol: 'L' })
  })
  it('lists outputs and durations for every model', () => {
    for (const id of SIM_MODEL_IDS) {
      expect(outputKeys(id)).toContain(MODEL_SPECS[id].primary)
      expect(Object.keys(defaultValues(id)).length).toBe(4)
      expect(naturalDuration(id, defaultValues(id))).toBeGreaterThan(0)
      expect(runModel(id, defaultValues(id)).ok).toBe(true)
    }
  })
  it('validates impossible inputs instead of throwing', () => {
    expect(validateValues('pendulum', { L: 0, g: 9.81, theta0: 10, b: 0 })).toEqual([{ symbol: 'L', code: 'positive' }])
    expect(validateValues('projectile', { v0: 1, angle: 10, g: 9.81, h0: -1 })).toEqual([{ symbol: 'h0', code: 'nonNegative' }])
    expect(runModel('spring_mass', { m: -1 }).ok).toBe(false)
    expect(runModel('unknown', {}).ok).toBe(false)
  })
})
