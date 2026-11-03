import { describe, expect, it } from 'vitest'
import { AMBIGUOUS, CODE_ALPHABET, checkCode, extractCode, normalizeCode, sharePath } from './classCode.js'

describe('class codes', () => {
  it('uses the same alphabet as the server (no look-alike characters)', () => {
    expect(CODE_ALPHABET).toBe('ABCDEFGHJKMNPQRSTUVWXYZ23456789')
    AMBIGUOUS.forEach((ch) => expect(CODE_ALPHABET.includes(ch)).toBe(false))
  })

  it('uppercases and removes spaces, dashes and dots', () => {
    expect(normalizeCode(' k7m 2qx ')).toBe('K7M2QX')
    expect(normalizeCode('k7m-2qx')).toBe('K7M2QX')
    expect(normalizeCode('K7M.2QX')).toBe('K7M2QX')
  })

  it('extracts a code from a pasted link', () => {
    expect(extractCode('https://conceptlab.example/s/K7M2QX')).toBe('K7M2QX')
    expect(extractCode('http://localhost:5173/join/k7m2qx?x=1')).toBe('K7M2QX')
    expect(extractCode('conceptlab.vn/s/ab3cde/')).toBe('AB3CDE')
  })

  it('limits the input length', () => {
    expect(normalizeCode('ABCDEFGHJK')).toHaveLength(8)
  })

  it('explains look-alike characters', () => {
    expect(checkCode('K7M2QO')).toEqual({ ok: false, reason: 'ambiguous', chars: ['O'] })
    expect(checkCode('K0M1QX').chars).toEqual(['0', '1'])
    expect(checkCode('AB$CDE')).toEqual({ ok: false, reason: 'invalid', chars: ['$'] })
  })

  it('accepts valid codes and rejects empty/short ones', () => {
    expect(checkCode('K7M2QX').ok).toBe(true)
    expect(checkCode('').reason).toBe('empty')
    expect(checkCode('K7M').reason).toBe('short')
  })

  it('builds the learner path', () => {
    expect(sharePath('k7m2qx')).toBe('/s/K7M2QX')
  })
})
