/** Pure helpers for the admin console (no React), covered by adminUtils.test.js. */

/**
 * AI feature ids written to the AI call log by backend services (CallContext.feature),
 * in dictionary-key form ("video-markers" → "video_markers"). Labels: admin.features.<key>.
 */
export const KNOWN_FEATURES = [
  'analyze',
  'paper_structure',
  'explore_equation',
  'generate',
  'lesson_meta',
  'quiz',
  'video_markers',
  'diagram',
  'diagram_sam',
  'segment',
  'segment_frame',
  'sam_phrase',
  'sam_phrase_visual',
  'track',
  'widget',
  'widget_repair',
  'translate',
  'cover',
  'field_scenario',
  'explain_change',
  'prediction_feedback',
  'transcribe',
  'chat',
  'board_read',
  'board_visual',
  'board_proof',
]

/** Block types a "generate:<kind>" id can carry; labels come from blocks.types.<kind>. */
export const BLOCK_TYPES = ['steps', 'flow', 'diagram', 'graph', 'simulation', 'algorithm', 'video', 'field', 'quiz', 'widget', 'text', 'board']

/**
 * Split a logged feature id into its dictionary key and optional block type.
 *   "generate:graph"       → { key: 'generate', kind: 'graph' }
 *   "generate:lesson_meta" → { key: 'lesson_meta', kind: null }
 *   "video-markers"        → { key: 'video_markers', kind: null }
 * Unknown ids return null so the caller can show the raw id instead of a wrong label.
 */
export function parseFeature(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return null
  const [base, sub = ''] = text.split(':')
  let key = base.replace(/-/g, '_')
  let kind = BLOCK_TYPES.includes(sub) ? sub : null
  if (key === 'generate' && sub === 'lesson_meta') {
    key = 'lesson_meta'
    kind = null
  }
  return KNOWN_FEATURES.includes(key) ? { key, kind } : null
}

/**
 * Average preparation time in a readable unit: under 90 minutes in minutes, under two days
 * in hours, otherwise in days. Returns null when the value is unknown.
 */
export function prepTimeParts(minutes) {
  if (minutes === null || minutes === undefined || minutes === '' || !Number.isFinite(Number(minutes))) return null
  const value = Math.max(0, Number(minutes))
  if (value < 90) return { unit: 'minutes', value, digits: 0 }
  if (value < 60 * 48) return { unit: 'hours', value: value / 60, digits: 1 }
  return { unit: 'days', value: value / 1440, digits: 1 }
}

/** Latency: one second or more in seconds (one decimal), otherwise whole milliseconds. */
export function latencyParts(ms) {
  if (ms === null || ms === undefined || ms === '' || !Number.isFinite(Number(ms))) return null
  const value = Math.max(0, Number(ms))
  return value >= 1000 ? { unit: 's', value: value / 1000, digits: 1 } : { unit: 'ms', value, digits: 0 }
}

const NAIVE_ISO = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/

/**
 * API timestamps read from the database can arrive without an offset ("2026-10-27T23:43:10")
 * although they are UTC; browsers would read them as local time (7 hours off in Vietnam).
 * Mark such values as UTC; values that already carry "Z" or an offset are returned unchanged.
 */
export function asUtc(value) {
  if (typeof value !== 'string') return value
  const text = value.trim()
  return NAIVE_ISO.test(text) ? `${text.replace(' ', 'T')}Z` : value
}
