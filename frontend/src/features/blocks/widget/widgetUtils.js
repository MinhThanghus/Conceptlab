/**
 * Pure helpers for AI-built widgets (spec §9.5, §13 code sandbox). No React, no DOM.
 *
 * Security model (docs/API.md § Widgets): generated HTML is never inserted into the app DOM.
 * It is served by the render routes with a sandbox CSP and loaded in
 * <iframe sandbox="allow-scripts"> (opaque origin: no network, no cookies, no API key).
 * A harness injected by the server posts {type:'cl-widget', status, errors, height?}.
 */

export const MIN_FRAME_HEIGHT = 200
export const MAX_FRAME_HEIGHT = 900
export const DEFAULT_FRAME_HEIGHT = 380
/** The only sandbox token a widget iframe ever gets (never allow-same-origin). */
export const WIDGET_SANDBOX = 'allow-scripts'
export const MAX_PROMPT = 2000

/** FNV-1a 32-bit hash → 8 hex chars. Used as the iframe cache key (?v=). */
export function hashString(text) {
  let hash = 0x811c9dc5
  const s = String(text ?? '')
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function clampHeight(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.round(Math.min(MAX_FRAME_HEIGHT, Math.max(MIN_FRAME_HEIGHT, n)))
}

/** Error list from the harness or the static checks → short strings (≤ 20 × 1000 chars). */
export function normalizeErrors(list, max = 20) {
  const arr = Array.isArray(list) ? list : list ? [list] : []
  return arr
    .map((e) => {
      if (typeof e === 'string') return e
      if (e && typeof e === 'object') {
        const where = [e.line, e.column ?? e.col].filter((n) => Number.isFinite(Number(n))).join(':')
        const text = [e.message || e.msg || e.text, where ? `(${where})` : ''].filter(Boolean).join(' ')
        if (text) return text
        try {
          return JSON.stringify(e)
        } catch {
          return ''
        }
      }
      return e === null || e === undefined ? '' : String(e)
    })
    .map((s) => String(s).trim().slice(0, 1000))
    .filter(Boolean)
    .slice(0, max)
}

/**
 * Validate a postMessage payload from the widget harness.
 * Returns { status: 'ready'|'error'|null, errors: string[], height: number|null } or null.
 */
export function parseWidgetMessage(data) {
  if (!data || typeof data !== 'object' || data.type !== 'cl-widget') return null
  const status = data.status === 'ready' || data.status === 'error' ? data.status : null
  const height = clampHeight(data.height)
  if (!status && height === null) return null
  return { status, errors: normalizeErrors(data.errors), height }
}

/** 'pass' | 'fail' | 'unknown' for the server's static safety checks. */
export function staticState(checks) {
  const list = Array.isArray(checks) ? checks.filter(Boolean) : []
  if (!list.length) return 'unknown'
  return list.some((c) => c.status === 'fail') ? 'fail' : 'pass'
}

/** Status of freshly generated or repaired HTML: never 'validated' before it has run in the sandbox. */
export function initialStatus(out) {
  if (!out?.html) return 'failed'
  if (out.status === 'failed' || staticState(out.checks) === 'fail') return 'failed'
  return 'draft'
}

/** Messages sent to the AI repair endpoint: failing static checks + runtime errors. */
export function repairErrors(block, runtimeErrors = null) {
  const checks = Array.isArray(block?.validation?.checks) ? block.validation.checks : []
  const fromChecks = checks.filter((c) => c && c.status === 'fail').map((c) => [c.code ? `[${c.code}]` : '', c.message || ''].join(' ').trim())
  const runtime = runtimeErrors && runtimeErrors.length ? runtimeErrors : block?.validation?.runtime?.errors
  return normalizeErrors([...fromChecks, ...normalizeErrors(runtime)], 20)
}

/** Render route of a widget: the share route for learners, the owner route in the studio. */
export function widgetSrc({ labId, shareCode, blockId, version }) {
  if (!blockId) return null
  const v = version ? `?v=${encodeURIComponent(version)}` : ''
  if (shareCode) return `/api/share/${encodeURIComponent(shareCode)}/widgets/${encodeURIComponent(blockId)}/render${v}`
  if (labId) return `/api/labs/${encodeURIComponent(labId)}/widgets/${encodeURIComponent(blockId)}/render${v}`
  return null
}

/** Learners only ever see approved + validated widgets (also enforced by the server snapshot). */
export function isLearnerVisible(block) {
  return Boolean(block && block.approved && block.status === 'validated' && block.html)
}

/** Status once the sandbox ran the HTML without errors: only 'validated' when static checks passed too. */
function statusAfterCleanRun(checks) {
  const state = staticState(checks)
  return state === 'pass' ? 'validated' : state === 'fail' ? 'failed' : 'draft'
}

/** Next block after the sandbox reported a result for the HTML currently in the block. */
export function applyRuntimeResult(block, result, now = new Date()) {
  const at = now.toISOString()
  const validation = { ...(block.validation || {}) }
  if (result.ok) {
    const status = statusAfterCleanRun(validation.checks)
    validation.runtime = { ok: true, at }
    return { ...block, validation, status, approved: status === 'validated' ? Boolean(block.approved) : false }
  }
  validation.runtime = { ok: false, errors: normalizeErrors(result.errors), at }
  return { ...block, validation, status: 'failed', approved: false }
}

/** True when applying `result` would change the stored block (prevents onChange loops). */
export function runtimeChanges(block, result) {
  const runtime = block?.validation?.runtime
  if (result.ok) {
    const expected = statusAfterCleanRun(block?.validation?.checks)
    return block.status !== expected || !runtime || runtime.ok !== true || (expected !== 'validated' && Boolean(block.approved))
  }
  const errors = normalizeErrors(result.errors)
  return (
    block.status !== 'failed' ||
    Boolean(block.approved) ||
    !runtime ||
    runtime.ok !== false ||
    JSON.stringify(runtime.errors || []) !== JSON.stringify(errors)
  )
}

/** Size of the HTML for display ("12.3 KB"). */
export function htmlStats(html) {
  const text = String(html || '')
  const bytes = new TextEncoder().encode(text).length
  const lines = text ? text.split('\n').length : 0
  return { bytes, lines }
}
