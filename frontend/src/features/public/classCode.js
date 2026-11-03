/**
 * Class codes (share codes) — the 6-character codes teachers write on the board.
 *
 * Mirrors backend/app/services/labs.py: SHARE_ALPHABET has no O/0, I/1 or L so a code
 * copied from a projector cannot be misread. Codes are generated with 6 characters;
 * the server accepts 4–8, so we do too (but always explain codes as 6 characters).
 */

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6
export const CODE_MIN = 4
export const CODE_MAX = 8
/** Characters that look alike and are therefore never used in codes. */
export const AMBIGUOUS = ['O', '0', 'I', '1', 'L']

/**
 * Pull a code out of whatever the learner typed or pasted: "k7m 2qx", "K7M-2QX",
 * or a full link such as "https://site/s/K7M2QX" or ".../join/k7m2qx".
 */
export function extractCode(raw) {
  const text = String(raw ?? '').trim()
  const link = text.match(/\/(?:s|join)\/([A-Za-z0-9 -]{3,16})\/?(?:[?#].*)?$/)
  const candidate = link ? link[1] : text
  return candidate.toUpperCase().replace(/[\s\-_.·]/g, '')
}

/** Normalised code limited to CODE_MAX characters (used as the controlled input value). */
export function normalizeCode(raw) {
  return extractCode(raw).slice(0, CODE_MAX)
}

/**
 * Check a normalised code. Returns { ok, reason, chars } where reason is one of
 * 'empty' | 'ambiguous' | 'invalid' | 'short' and chars lists the offending characters.
 */
export function checkCode(code) {
  const value = String(code ?? '')
  if (!value) return { ok: false, reason: 'empty', chars: [] }
  const bad = [...new Set([...value].filter((ch) => !CODE_ALPHABET.includes(ch)))]
  const ambiguous = bad.filter((ch) => AMBIGUOUS.includes(ch))
  if (ambiguous.length) return { ok: false, reason: 'ambiguous', chars: ambiguous }
  if (bad.length) return { ok: false, reason: 'invalid', chars: bad }
  if (value.length < CODE_MIN) return { ok: false, reason: 'short', chars: [] }
  return { ok: true, reason: null, chars: [] }
}

/** Path of the learner view for a code. */
export function sharePath(code) {
  return `/s/${encodeURIComponent(String(code || '').toUpperCase())}`
}
