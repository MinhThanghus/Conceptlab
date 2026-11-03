import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { I18nProvider, useT } from './index.jsx'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

function fmtFor(lang) {
  window.localStorage.setItem('cl.lang', lang)
  return renderHook(() => useT(), { wrapper: I18nProvider }).result.current
}

describe('fmt dates', () => {
  it('says a missing or unreadable timestamp is missing instead of throwing', () => {
    const { fmt, t } = fmtFor('en')
    const none = t('common.states.none')
    for (const value of ['not-a-date', '2026-13-99', null, '']) {
      expect(fmt.date(value)).toBe(none)
      expect(fmt.dateTime(value)).toBe(none)
      expect(fmt.relative(value)).toBe(none)
    }
  })

  it('still formats a valid timestamp', () => {
    const { fmt } = fmtFor('en')
    expect(fmt.date('2026-11-02T08:00:00Z')).toMatch(/2026/)
    expect(fmt.relative(new Date(Date.now() - 2 * 3600 * 1000).toISOString())).toBe('2 hours ago')
  })
})
