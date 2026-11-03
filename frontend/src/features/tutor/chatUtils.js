/**
 * Pure helpers for the AI tutor (contract: docs/API.md §Chat, ChatIn / ChatContext).
 * ChatContext forbids unknown keys, so only the documented fields are ever sent.
 */
import { altLines } from '../blocks/board/boardModel.js'

export const MESSAGE_MAX = 2000
const LIMITS = { block_id: 40, item_id: 200, selection: 2000 }

/** Chat endpoint for a studio preview (owner) or a shared lab (learners). */
export function chatPath({ labId, shareCode }) {
  if (labId) return `/api/labs/${labId}/chat`
  if (shareCode) return `/api/share/${shareCode}/chat`
  return null
}

/** Share code of a learner's chat endpoint (null for a studio preview). */
export function shareCodeFromChatPath(endpoint) {
  const match = /^\/api\/share\/([^/]+)\/chat$/.exec(String(endpoint || ''))
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

function trimText(value, max) {
  if (value === null || value === undefined) return undefined
  const text = String(value).trim()
  if (!text) return undefined
  return text.length > max ? text.slice(0, max) : text
}

/**
 * Bounded copy of an interactive state so a tutor request stays small on slow networks:
 * depth ≤ 4, arrays ≤ 24 items, strings ≤ 300 chars, ≤ 40 keys per object, finite numbers only.
 */
export function compactState(value, depth = 0) {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : null
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.length > 300 ? `${value.slice(0, 300)}…` : value
  if (depth >= 4) return null
  if (Array.isArray(value)) return value.slice(0, 24).map((item) => compactState(item, depth + 1))
  if (typeof value === 'object') {
    const out = {}
    for (const [key, item] of Object.entries(value).slice(0, 40)) {
      if (typeof item === 'function') continue
      const next = compactState(item, depth + 1)
      if (next !== null && next !== undefined) out[key] = next
    }
    return out
  }
  return null
}

function cleanSourceRef(ref) {
  if (!ref || typeof ref !== 'object' || !ref.source_id) return undefined
  const out = { source_id: String(ref.source_id) }
  if (Number.isInteger(ref.page) && ref.page >= 1) out.page = ref.page
  if (Array.isArray(ref.bbox) && ref.bbox.length === 4 && ref.bbox.every(Number.isFinite)) out.bbox = ref.bbox
  if (Number.isFinite(ref.time) && ref.time >= 0) out.time = ref.time
  if (ref.quote) out.quote = String(ref.quote).slice(0, 600)
  if (['exact', 'approximate', 'none'].includes(ref.located)) out.located = ref.located
  return out
}

/**
 * Build the `context` of a ChatIn body from the active context chip and the live states
 * reported by blocks. Returns undefined when there is nothing to send.
 */
export function buildChatContext(context, reportedStates = {}) {
  if (!context) return undefined
  const out = {}
  const blockId = trimText(context.block_id, LIMITS.block_id)
  if (blockId) out.block_id = blockId
  const itemId = trimText(context.item_id, LIMITS.item_id)
  if (itemId) out.item_id = itemId
  const selection = trimText(context.selection, LIMITS.selection)
  if (selection) out.selection = selection
  const rawState = context.state ?? (blockId ? reportedStates[blockId] : undefined)
  if (rawState !== undefined && rawState !== null) {
    const state = compactState(typeof rawState === 'object' && !Array.isArray(rawState) ? rawState : { value: rawState })
    if (state && Object.keys(state).length) out.state = state
  }
  const ref = cleanSourceRef(context.source_ref)
  if (ref) out.source_ref = ref
  return Object.keys(out).length ? out : undefined
}

/**
 * Live state a board block reports to the tutor (env.reportState): the view the learner is on and
 * what the sheet says (the visible lines, then each drawing; crossed-out writing never), bounded
 * like any reported state.
 */
export function boardTutorState(block, view) {
  const lines = altLines(block)
  const state = { type: 'board', lines: lines.slice(0, 24) }
  if (view) state.view = view
  if (lines.length > 24) state.more_lines = lines.length - 24
  return state
}

/** Plain text of an answer for the screen-reader announcement (markdown marks removed). */
export function plainText(text, max = 280) {
  const plain = String(text || '')
    .replace(/\$\$?([^$]+)\$\$?/g, '$1')
    .replace(/[*_`#>]+/g, '')
    .replace(/\[(\d{1,2})\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > max ? `${plain.slice(0, max).trimEnd()}…` : plain
}

/** Stable key of a context chip (to remember which one the learner dismissed). */
export function contextKey(context) {
  if (!context) return ''
  return [context.nonce || '', context.block_id || '', context.item_id || '', context.selection || ''].join('|')
}

/*
 * Suggested questions (spec §10.1 examples) that fit what the learner is looking at:
 * a question about "the graph" under a video, or about "the paper" in a school lab,
 * reads as broken. Keys live under `tutor.suggestions.*`.
 */
const SUGGESTIONS_BY_TYPE = {
  simulation: ['variable', 'graph', 'assumption'],
  graph: ['variable', 'graph', 'source'],
  widget: ['variable', 'graph', 'source'],
  steps: ['book', 'why'],
  video: ['observe', 'source'],
  field: ['field', 'observe'],
  diagram: ['part', 'source'],
  flow: ['process', 'source'],
  algorithm: ['algoStep', 'variable'],
  quiz: ['quiz', 'source'],
  text: ['term', 'source'],
}
export const DEFAULT_SUGGESTIONS = ['variable', 'graph', 'book', 'figure']

/** Up to three suggestion keys for the current part type and lab space ('school2lab' | 'paper2explorer'). */
export function suggestionKeys({ blockType, space } = {}) {
  const paper = space === 'paper2explorer'
  let keys = SUGGESTIONS_BY_TYPE[blockType]
  if (!keys) return paper ? ['figure', 'term', 'paperPart'] : ['variable', 'bookPart', 'why']
  // "the book" in a school lab, "the paper" (and its figures) in Paper2Explorer
  keys = keys.map((key) => (key === 'source' ? (paper ? 'paperPart' : 'bookPart') : key === 'book' && paper ? 'paperPart' : key))
  if (paper && (blockType === 'text' || blockType === 'flow' || blockType === 'diagram')) keys = [...keys, 'figure']
  return [...new Set(keys)].slice(0, 3)
}
