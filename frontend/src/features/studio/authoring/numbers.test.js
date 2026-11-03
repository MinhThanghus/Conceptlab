import { describe, expect, it } from 'vitest'
import { formatDecimalInput, parseDecimal, roundSig } from './numbers.js'

describe('parseDecimal', () => {
  it('accepts a decimal comma and a decimal point', () => {
    expect(parseDecimal('0,25')).toBe(0.25)
    expect(parseDecimal('9.81')).toBe(9.81)
    expect(parseDecimal(' -3 ')).toBe(-3)
    expect(parseDecimal('+1,5')).toBe(1.5)
    expect(parseDecimal(',5')).toBe(0.5)
  })

  it('understands thousands separators when both kinds appear', () => {
    expect(parseDecimal('1.234,5')).toBe(1234.5)
    expect(parseDecimal('1,234.5')).toBe(1234.5)
    expect(parseDecimal('1 234,5')).toBe(1234.5)
    expect(parseDecimal('1,234,567')).toBe(1234567)
    expect(parseDecimal('1.234.567')).toBe(1234567)
  })

  it('accepts scientific notation and typographic minus', () => {
    expect(parseDecimal('2e-3')).toBe(0.002)
    expect(parseDecimal('6,67E-11')).toBeCloseTo(6.67e-11)
    expect(parseDecimal('−4,2')).toBe(-4.2)
  })

  it('returns null for empty and NaN for text', () => {
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('   ')).toBeNull()
    expect(parseDecimal(null)).toBeNull()
    expect(parseDecimal('abc')).toBeNaN()
    expect(parseDecimal('1,2,3.4.5')).toBeNaN()
    expect(parseDecimal('1-2')).toBeNaN()
  })

  it('passes numbers through', () => {
    expect(parseDecimal(3.5)).toBe(3.5)
    expect(parseDecimal(Infinity)).toBeNaN()
  })
})

describe('formatDecimalInput', () => {
  it('uses the decimal comma in Vietnamese only', () => {
    expect(formatDecimalInput(9.81, 'vi')).toBe('9,81')
    expect(formatDecimalInput(9.81, 'en')).toBe('9.81')
    expect(formatDecimalInput(1500, 'vi')).toBe('1500')
  })
  it('renders empty values as empty text', () => {
    expect(formatDecimalInput(null)).toBe('')
    expect(formatDecimalInput(undefined)).toBe('')
    expect(formatDecimalInput(NaN)).toBe('')
  })
  it('round-trips with parseDecimal', () => {
    for (const v of [0.25, -3, 9.81, 1e-7, 12345.678]) {
      expect(parseDecimal(formatDecimalInput(v, 'vi'))).toBe(v)
      expect(parseDecimal(formatDecimalInput(v, 'en'))).toBe(v)
    }
  })
})

describe('roundSig', () => {
  it('trims floating point noise', () => {
    expect(roundSig(2.0060000001)).toBe(2.006)
    expect(roundSig(2 * Math.PI * Math.sqrt(1 / 9.81))).toBe(2.006)
    expect(roundSig(0)).toBe(0)
  })
})
