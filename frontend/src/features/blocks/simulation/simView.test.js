import { describe, expect, it } from 'vitest'
import { runModel } from '../../sim/models.js'
import { clockSettings, digitsFor, displaySymbol, modelUnit, outputSymbol, outputUnit, pickObserve, roundOutputs, simParamLabel, toModelValues, unitFactors } from './simView.js'
import { defaultParams, modelParams, sampleReferenceCases, unusedParams } from './simParams.js'
import { checkReferenceCase } from '../../sim/models.js'

const tl = (key) => key.split('.').pop()

describe('simulation display helpers', () => {
  it('writes code symbols the textbook way', () => {
    expect(displaySymbol('theta0')).toBe('θ₀')
    expect(displaySymbol('angle')).toBe('α')
    expect(displaySymbol('L')).toBe('L')
    expect(simParamLabel({ symbol: 'theta0', name: 'Góc lệch ban đầu' })).toBe('Góc lệch ban đầu (θ₀)')
    expect(simParamLabel({ symbol: 'v0', name: '' })).toBe('v₀')
  })

  it('picks readable digits by magnitude', () => {
    expect(digitsFor(1.7943)).toBe(3)
    expect(digitsFor(12.7)).toBe(2)
    expect(digitsFor(181.94)).toBe(1)
    expect(digitsFor(18194)).toBe(0)
    expect(digitsFor(0.5, 2)).toBe(2)
    expect(digitsFor(NaN)).toBe(0)
  })

  it('knows output units and symbols; money uses the unit of P', () => {
    expect(outputUnit('pendulum', 'period')).toBe('s')
    expect(outputSymbol('projectile', 'range')).toBe('d')
    expect(outputUnit('compound_interest', 'amount', 'nghìn đồng')).toBe('nghìn đồng')
    expect(modelUnit('compound_interest', 'P', (k) => `[${k}]`, '')).toBe('[money]')
    expect(modelUnit('compound_interest', 'r', (k) => `[${k}]`)).toBe('[percentPerYear]')
    expect(modelUnit('pendulum', 'L')).toBe('m')
  })

  it('converts known units into the model unit (80 cm → 0.8 m) and leaves free text alone', () => {
    const params = [
      { symbol: 'L', unit: 'cm', value: 80 },
      { symbol: 'g', unit: 'm/s²', value: 9.81 },
    ]
    const f = unitFactors('pendulum', params)
    expect(f).toEqual({ L: 0.01, g: 1 })
    const v = toModelValues({ L: 80, g: 9.81 }, f)
    expect(v.L).toBeCloseTo(0.8, 12)
    const run = runModel('pendulum', v)
    expect(run.ok).toBe(true)
    expect(run.result.outputs.period).toBeCloseTo(1.7943, 3)
    expect(unitFactors('compound_interest', [{ symbol: 'P', unit: 'nghìn đồng', value: 10 }])).toEqual({ P: 1 })
  })

  it('clock: real time for physics, about 8 s for a savings plan, step = 1/16 period', () => {
    expect(clockSettings('projectile', 2).rate).toBe(1)
    expect(clockSettings('compound_interest', 40).rate).toBe(5)
    expect(clockSettings('compound_interest', 40).step).toBe(1)
    const s = clockSettings('pendulum', 20, { period: 1.6 })
    expect(s.step).toBeCloseTo(0.1, 12)
  })

  it('observes the primary output unless it does not change (θ₀ leaves the small-angle period unchanged)', () => {
    const at = (base, symbol) => (v, key) => {
      const run = runModel('pendulum', { ...base, [symbol]: v }, { duration: 1 })
      return run.ok ? run.result.outputs[key] : null
    }
    expect(pickObserve('pendulum', 0.5, 2, at({ g: 9.81, theta0: 8 }, 'L'))).toBe('period')
    expect(pickObserve('pendulum', 5, 60, at({ L: 1, g: 9.81 }, 'theta0'))).toBe('period_numeric')
  })

  it('rounds outputs for the tutor and keeps nulls', () => {
    expect(roundOutputs({ period: 2.0060666807, period_numeric: null })).toEqual({ period: 2.0061, period_numeric: null })
  })
})

describe('simulation params', () => {
  it('fills missing model params from defaults and flags them', () => {
    const list = modelParams('pendulum', [{ symbol: 'L', name: 'Chiều dài', unit: 'm', value: 0.8 }], tl)
    expect(list.map((p) => p.symbol)).toEqual(['L', 'g', 'theta0', 'b'])
    expect(list[0].added).toBeUndefined()
    expect(list[1].added).toBe(true)
    expect(list[0].name).toBe('Chiều dài')
  })

  it('lists params the model does not read', () => {
    expect(unusedParams('pendulum', [{ symbol: 'L' }, { symbol: 'G' }]).map((p) => p.symbol)).toEqual(['G'])
  })

  it('new blocks get every model param, and the sample reference cases pass', () => {
    for (const model of ['pendulum', 'projectile', 'compound_interest', 'spring_mass']) {
      expect(defaultParams(model, tl).length).toBeGreaterThanOrEqual(4)
      for (const c of sampleReferenceCases(model)) expect(checkReferenceCase(model, c).status).toBe('pass')
    }
  })
})
