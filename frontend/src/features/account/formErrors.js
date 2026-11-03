/**
 * Helpers shared by the sign-in, sign-up and account forms.
 */

const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,24}$/

export const PASSWORD_MIN = 8

export function isEmail(value) {
  return EMAIL_RE.test(String(value || '').trim())
}

/**
 * Map an ApiError to per-field messages. `messages` is { field: text | (rawMessage) => text }.
 * Fields the form does not know about are ignored (the form shows a general alert instead).
 */
export function fieldErrorsFromApi(error, messages) {
  const out = {}
  if (!error || !error.fields || typeof error.fields !== 'object') return out
  Object.entries(error.fields).forEach(([field, raw]) => {
    const key = field.split('.')[0]
    const message = messages[key]
    if (message === undefined) return
    out[key] = typeof message === 'function' ? message(String(raw)) : message
  })
  return out
}

/**
 * Only allow same-site relative redirects after sign-in ("/app/labs/1"), never
 * "//evil.com", "https://…" or a loop back to the auth pages.
 */
export function safeNext(next, fallback = '/app') {
  if (typeof next !== 'string') return fallback
  const value = next.trim()
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  if (/^\/(login|register)(?:[/?#]|$)/.test(value)) return fallback
  return value
}

/**
 * Whole minutes to wait after a `rate_limited` error (from `extra.retry_after` seconds),
 * at least 1 — sign-in locks last up to 15 minutes, so "wait a moment" is not enough.
 */
export function retryMinutes(error) {
  const seconds = Number(error?.extra?.retry_after)
  if (!Number.isFinite(seconds) || seconds <= 0) return 1
  return Math.max(1, Math.ceil(seconds / 60))
}

/** Rough password strength for the hint (0 weak … 3 strong). Never blocks a valid password. */
export function passwordStrength(password) {
  const value = String(password || '')
  if (value.length < PASSWORD_MIN) return 0
  let score = 1
  if (value.length >= 12) score += 1
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length
  if (kinds >= 3 || (value.length >= 16 && kinds >= 2)) score += 1
  return Math.min(score, 3)
}
