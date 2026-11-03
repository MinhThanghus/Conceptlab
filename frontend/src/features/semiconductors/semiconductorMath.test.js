import { describe, expect, it } from 'vitest'
import { cmosInverter } from './semiconductorMath.js'

describe('ideal CMOS inverter truth table', () => {
  it('connects the output to the opposite rail for each stable binary input', () => {
    expect(cmosInverter(0)).toEqual({ input: 0, pOn: true, nOn: false, output: 1 })
    expect(cmosInverter(1)).toEqual({ input: 1, pOn: false, nOn: true, output: 0 })
  })
  it('does not silently interpret analog or invalid inputs as binary', () => {
    expect(() => cmosInverter(.5)).toThrow(RangeError)
    expect(() => cmosInverter('1')).toThrow(RangeError)
  })
})
