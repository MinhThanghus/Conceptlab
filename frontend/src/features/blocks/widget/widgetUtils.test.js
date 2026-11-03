import { describe, expect, it } from 'vitest'
import {
  applyRuntimeResult,
  clampHeight,
  hashString,
  htmlStats,
  initialStatus,
  isLearnerVisible,
  normalizeErrors,
  parseWidgetMessage,
  repairErrors,
  runtimeChanges,
  staticState,
  widgetSrc,
} from './widgetUtils.js'

const pass = [
  { code: 'no_network', status: 'pass', message: 'No network calls' },
  { code: 'size', status: 'warn', message: 'Large file' },
]
const fail = [...pass, { code: 'no_eval', status: 'fail', message: 'Uses eval()' }]

describe('hash and sizes', () => {
  it('hashes deterministically to 8 hex chars', () => {
    expect(hashString('<p>hi</p>')).toMatch(/^[0-9a-f]{8}$/)
    expect(hashString('<p>hi</p>')).toBe(hashString('<p>hi</p>'))
    expect(hashString('<p>hi</p>')).not.toBe(hashString('<p>ho</p>'))
    expect(hashString('')).toBe('811c9dc5')
  })

  it('clamps frame heights to 200..900 px', () => {
    expect(clampHeight(50)).toBe(200)
    expect(clampHeight(450.4)).toBe(450)
    expect(clampHeight(5000)).toBe(900)
    expect(clampHeight('x')).toBeNull()
    expect(clampHeight(undefined)).toBeNull()
  })

  it('counts bytes and lines', () => {
    expect(htmlStats('a\nb')).toEqual({ bytes: 3, lines: 2 })
    expect(htmlStats('ă')).toEqual({ bytes: 2, lines: 1 })
    expect(htmlStats('')).toEqual({ bytes: 0, lines: 0 })
  })
})

describe('harness messages', () => {
  it('accepts only cl-widget messages', () => {
    expect(parseWidgetMessage({ type: 'other', status: 'ready' })).toBeNull()
    expect(parseWidgetMessage('ready')).toBeNull()
    expect(parseWidgetMessage({ type: 'cl-widget' })).toBeNull()
    expect(parseWidgetMessage({ type: 'cl-widget', status: 'ready', height: 1200 })).toEqual({ status: 'ready', errors: [], height: 900 })
    expect(parseWidgetMessage({ type: 'cl-widget', height: 300 })).toEqual({ status: null, errors: [], height: 300 })
    expect(parseWidgetMessage({ type: 'cl-widget', status: 'error', errors: [{ message: 'x is not defined', line: 12, column: 4 }] })).toEqual({
      status: 'error',
      errors: ['x is not defined (12:4)'],
      height: null,
    })
  })

  it('normalizes error lists defensively', () => {
    expect(normalizeErrors('boom')).toEqual(['boom'])
    expect(normalizeErrors([null, '', '  ok  '])).toEqual(['ok'])
    expect(normalizeErrors(['a'.repeat(1500)])[0]).toHaveLength(1000)
    expect(normalizeErrors(Array.from({ length: 30 }, (_, i) => `e${i}`))).toHaveLength(20)
  })
})

describe('validation state', () => {
  it('summarizes static checks', () => {
    expect(staticState(pass)).toBe('pass')
    expect(staticState(fail)).toBe('fail')
    expect(staticState([])).toBe('unknown')
    expect(staticState(undefined)).toBe('unknown')
  })

  it('never marks fresh HTML as validated', () => {
    expect(initialStatus({ html: '<p/>', checks: pass, status: 'validated' })).toBe('draft')
    expect(initialStatus({ html: '<p/>', checks: fail, status: 'draft' })).toBe('failed')
    expect(initialStatus({ html: '', checks: pass })).toBe('failed')
  })

  it('validates only when static checks pass and the sandbox is ready', () => {
    const block = { id: 'w1', html: '<p/>', status: 'draft', approved: false, validation: { checks: pass } }
    const now = new Date('2026-10-28T00:00:00Z')
    const ok = applyRuntimeResult(block, { ok: true }, now)
    expect(ok.status).toBe('validated')
    expect(ok.validation.runtime).toEqual({ ok: true, at: '2026-10-28T00:00:00.000Z' })
    expect(runtimeChanges(ok, { ok: true })).toBe(false)

    const staticFail = applyRuntimeResult({ ...block, validation: { checks: fail } }, { ok: true }, now)
    expect(staticFail.status).toBe('failed')

    const noChecks = applyRuntimeResult({ ...block, validation: {} }, { ok: true }, now)
    expect(noChecks.status).toBe('draft')
  })

  it('fails and un-approves on runtime errors', () => {
    const block = { id: 'w1', html: '<p/>', status: 'validated', approved: true, validation: { checks: pass, runtime: { ok: true } } }
    const failed = applyRuntimeResult(block, { ok: false, errors: ['TypeError: boom'] })
    expect(failed.status).toBe('failed')
    expect(failed.approved).toBe(false)
    expect(failed.validation.runtime.errors).toEqual(['TypeError: boom'])
    expect(runtimeChanges(failed, { ok: false, errors: ['TypeError: boom'] })).toBe(false)
    expect(runtimeChanges(failed, { ok: false, errors: ['Other'] })).toBe(true)
  })

  it('collects repair errors from checks and runtime', () => {
    const block = { validation: { checks: fail, runtime: { ok: false, errors: ['ReferenceError: x'] } } }
    expect(repairErrors(block)).toEqual(['[no_eval] Uses eval()', 'ReferenceError: x'])
    expect(repairErrors(block, ['live error'])).toEqual(['[no_eval] Uses eval()', 'live error'])
    expect(repairErrors({ validation: { checks: pass } })).toEqual([])
  })
})

describe('render routes', () => {
  it('uses the share route for learners and the owner route in the studio', () => {
    expect(widgetSrc({ shareCode: 'ABC234', labId: 'lab1', blockId: 'b1', version: 'deadbeef' })).toBe('/api/share/ABC234/widgets/b1/render?v=deadbeef')
    expect(widgetSrc({ labId: 'lab1', blockId: 'b1', version: 'deadbeef' })).toBe('/api/labs/lab1/widgets/b1/render?v=deadbeef')
    expect(widgetSrc({ blockId: 'b1' })).toBeNull()
    expect(widgetSrc({ labId: 'lab1' })).toBeNull()
  })

  it('shows learners approved + validated widgets only', () => {
    expect(isLearnerVisible({ approved: true, status: 'validated', html: '<p/>' })).toBe(true)
    expect(isLearnerVisible({ approved: false, status: 'validated', html: '<p/>' })).toBe(false)
    expect(isLearnerVisible({ approved: true, status: 'draft', html: '<p/>' })).toBe(false)
    expect(isLearnerVisible({ approved: true, status: 'validated', html: '' })).toBe(false)
  })
})
