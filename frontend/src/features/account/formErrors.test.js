import { describe, expect, it } from 'vitest'
import { fieldErrorsFromApi, isEmail, passwordStrength, retryMinutes, safeNext } from './formErrors.js'

describe('form helpers', () => {
  it('validates email addresses like the server', () => {
    expect(isEmail('lan@truong.edu.vn')).toBe(true)
    expect(isEmail(' lan@truong.edu.vn ')).toBe(true)
    expect(isEmail('lan@truong')).toBe(false)
    expect(isEmail('lan truong@x.vn')).toBe(false)
  })

  it('maps API field errors to friendly messages and ignores unknown fields', () => {
    const error = { code: 'validation_error', fields: { email: 'value error', 'password': 'too short', other: 'x' } }
    expect(fieldErrorsFromApi(error, { email: 'Email?', password: (raw) => `pw:${raw}` })).toEqual({ email: 'Email?', password: 'pw:too short' })
    expect(fieldErrorsFromApi({ code: 'email_taken', fields: { email: 'taken' } }, { email: 'Taken' })).toEqual({ email: 'Taken' })
    expect(fieldErrorsFromApi(null, {})).toEqual({})
  })

  it('only redirects to same-site paths', () => {
    expect(safeNext('/app/labs/abc')).toBe('/app/labs/abc')
    expect(safeNext('//evil.example')).toBe('/app')
    expect(safeNext('https://evil.example')).toBe('/app')
    expect(safeNext('/\\evil')).toBe('/app')
    expect(safeNext('/login?next=/app')).toBe('/app')
    expect(safeNext(null, '/')).toBe('/')
  })

  it('turns a rate-limit retry_after into whole minutes (at least 1)', () => {
    expect(retryMinutes({ code: 'rate_limited', extra: { retry_after: 840 } })).toBe(14)
    expect(retryMinutes({ code: 'rate_limited', extra: { retry_after: 61 } })).toBe(2)
    expect(retryMinutes({ code: 'rate_limited', extra: { retry_after: 5 } })).toBe(1)
    expect(retryMinutes({ code: 'rate_limited', extra: null })).toBe(1)
    expect(retryMinutes(undefined)).toBe(1)
  })

  it('scores password strength without blocking valid passwords', () => {
    expect(passwordStrength('short')).toBe(0)
    expect(passwordStrength('abcdefgh')).toBe(1)
    expect(passwordStrength('abcdefghijkl')).toBe(2)
    expect(passwordStrength('Abcdefgh1234!')).toBe(3)
  })
})
