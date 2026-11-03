import { describe, expect, it } from 'vitest'
import { direction, effectiveRange, isIdentifier, paramIssues, paramLabel, parseLocaleNumber, percentChange, plainNumber, sameValues, suggestChange, valuesOf } from './paramUtils.js'

describe('effectiveRange', () => {
  it('keeps a valid range', () => {
    expect(effectiveRange({ value: 1, min: 0.1, max: 3, step: 0.01 })).toMatchObject({ value: 1, min: 0.1, max: 3, step: 0.01 })
  })
  it('fills missing bounds and step', () => {
    const r = effectiveRange({ value: 2, min: null, max: null })
    expect(r.min).toBe(-2)
    expect(r.max).toBe(6)
    expect(r.step).toBeGreaterThan(0)
  })
  it('widens the range to include an out-of-range value and fixes reversed bounds', () => {
    expect(effectiveRange({ value: 12, min: 0, max: 10 }).max).toBe(12)
    const r = effectiveRange({ value: 1, min: 5, max: 2 })
    expect(r.max).toBeGreaterThan(r.min)
  })
  it('handles zero values', () => {
    expect(effectiveRange({ value: 0 })).toMatchObject({ min: -10, max: 10 })
  })
})

describe('labels and values', () => {
  it('paramLabel', () => {
    expect(paramLabel({ symbol: 'L', name: 'Chiều dài dây' })).toBe('Chiều dài dây (L)')
    expect(paramLabel({ symbol: 'a', name: 'a' })).toBe('a')
    expect(paramLabel({ symbol: 'b' })).toBe('b')
  })
  it('valuesOf and sameValues', () => {
    const v = valuesOf([{ symbol: 'a', value: 1 }, { symbol: 'b', value: null, min: 2, max: 4 }])
    expect(v).toEqual({ a: 1, b: 2 })
    expect(sameValues({ a: 1 }, { a: 1 })).toBe(true)
    expect(sameValues({ a: 1 }, { a: 2 })).toBe(false)
    expect(sameValues({ a: 1 }, { a: 1, b: 2 })).toBe(false)
  })
})

describe('parseLocaleNumber', () => {
  it('accepts Vietnamese and English decimal marks', () => {
    expect(parseLocaleNumber('2,5')).toBe(2.5)
    expect(parseLocaleNumber('2.5')).toBe(2.5)
    expect(parseLocaleNumber('1.234,5')).toBe(1234.5)
    expect(parseLocaleNumber('1,234.5')).toBe(1234.5)
    expect(parseLocaleNumber('−3')).toBe(-3)
    expect(parseLocaleNumber('1e-3')).toBe(0.001)
    expect(parseLocaleNumber(' 10 000 ')).toBe(10000)
  })
  it('rejects text', () => {
    expect(Number.isNaN(parseLocaleNumber(''))).toBe(true)
    expect(Number.isNaN(parseLocaleNumber('abc'))).toBe(true)
    expect(Number.isNaN(parseLocaleNumber('2,5,6.1.2'))).toBe(true)
  })
  it('plainNumber round-trips', () => {
    expect(plainNumber(2.5, 'vi')).toBe('2,5')
    expect(plainNumber(2.5, 'en')).toBe('2.5')
    expect(plainNumber(null)).toBe('')
    expect(parseLocaleNumber(plainNumber(-0.125, 'vi'))).toBe(-0.125)
  })
})

describe('validation & changes', () => {
  it('identifiers', () => {
    expect(isIdentifier('theta0')).toBe(true)
    expect(isIdentifier('θ')).toBe(true)
    expect(isIdentifier('2a')).toBe(false)
    expect(isIdentifier('a b')).toBe(false)
  })
  it('param issues', () => {
    const all = [{ symbol: 'a' }, { symbol: 'a' }]
    expect(paramIssues({ symbol: 'a', min: 5, max: 1 }, all).map((i) => i.code)).toEqual(['symbolDuplicate', 'rangeOrder'])
    expect(paramIssues({ symbol: '', value: 3, min: 0, max: 1, step: 0 }, []).map((i) => i.code)).toEqual(['symbolRequired', 'valueOutside', 'stepPositive'])
    expect(paramIssues({ symbol: 'x', value: 1, min: 0, max: 2, step: 0.1 }, [{ symbol: 'x' }])).toEqual([])
  })
  it('direction and percent change', () => {
    expect(direction(1, 2)).toBe('up')
    expect(direction(2, 1)).toBe('down')
    expect(direction(1, 1 + 1e-13)).toBe('same')
    expect(direction(NaN, 1)).toBeNull()
    expect(percentChange(2, 3)).toBe(50)
    expect(percentChange(0, 3)).toBeNull()
  })
  it('suggestChange moves towards the farther end', () => {
    expect(suggestChange({ value: 1, min: 0.1, max: 3, step: 0.01 })).toEqual({ from: 1, to: 2.2 })
    const s = suggestChange({ value: 9, min: 0, max: 10, step: 1 })
    expect(s.to).toBeLessThan(9)
  })
})
