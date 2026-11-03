/** Pure, lossless learner-deck descriptors. The renderer keeps the original block data. */
import { validEdges } from '../blocks/flow/flowLayout.js'
import { canPracticeOrder } from '../blocks/steps/stepsLogic.js'

// One idea a slide: about ten lines of body text on a laptop sheet.
const PAGE_SIZE = 600
// A step's explanation and its question share a slide only while both stay short;
// a figure takes the left of the sheet, so the words get less room.
export const COMBINE_LIMIT = { figure: 380, text: 450 }

/**
 * Splits a list into consecutive, balanced chunks of at most `max` items and, where possible,
 * at most `budget` characters. An item is never split (one longer than the budget gets a chunk
 * of its own) and joining the chunks gives the list back, in order.
 */
export function chunkItems(items, { max = 4, budget = Infinity } = {}) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) return []
  const cap = Math.max(1, Math.floor(max) || 1)
  // 5 items at 4 a slide read better as 3 + 2 than as 4 + 1.
  const even = Math.ceil(list.length / Math.ceil(list.length / cap))
  const chunks = []
  let current = []
  let chars = 0
  for (const item of list) {
    const size = String(item ?? '').length
    if (current.length && (current.length >= even || chars + size > budget)) {
      chunks.push(current)
      current = []
      chars = 0
    }
    current.push(item)
    chars += size
  }
  chunks.push(current)
  return chunks
}

// Boundaries inside code, math and common inline formatting are never page breaks.
// Unclosed code/math is treated as one protected run through the end of the text.
function protectedRanges(text) {
  const ranges = []
  const escaped = (pos) => {
    let n = 0
    for (let i = pos - 1; i >= 0 && text[i] === '\\'; i -= 1) n += 1
    return n % 2 === 1
  }
  for (let i = 0; i < text.length;) {
    let open = '', close = ''
    if (text[i] === '`' && !escaped(i)) {
      let end = i
      while (text[end] === '`') end += 1
      open = text.slice(i, end); close = open
    } else if (text.startsWith('$$', i) && !escaped(i)) { open = '$$'; close = '$$' }
    else if (text[i] === '$' && !escaped(i)) { open = '$'; close = '$' }
    else if (text.startsWith('\\(', i) && !escaped(i)) { open = '\\('; close = '\\)' }
    else if (text.startsWith('\\[', i) && !escaped(i)) { open = '\\['; close = '\\]' }
    else if (text.startsWith('**', i) && !escaped(i)) { open = '**'; close = '**' }
    else if (text[i] === '*' && !escaped(i) && text[i + 1] && !/\s/.test(text[i + 1])) { open = '*'; close = '*' }
    else if (text[i] === '[' && !escaped(i)) {
      const linkEnd = text.indexOf('](', i + 1), closeEnd = linkEnd < 0 ? -1 : text.indexOf(')', linkEnd + 2)
      if (linkEnd >= 0 && closeEnd >= 0 && !text.slice(i, closeEnd).includes('\n')) {
        ranges.push([i, closeEnd + 1]); i = closeEnd + 1; continue
      }
    }
    if (!open) { i += 1; continue }
    let end = i + open.length
    while (end < text.length) {
      if (text.startsWith(close, end) && !escaped(end)) break
      // Inline single-dollar math and inline code cannot cross a line in RichText.
      if ((open === '$' || open === '`') && (text[end] === '\n' || text[end] === '\r')) break
      end += 1
    }
    const matched = end < text.length && text.startsWith(close, end) && !escaped(end)
    if (!matched && (open === '$' || open === '`' || open === '**' || open === '*')) { i += open.length; continue }
    const stop = matched ? end + close.length : text.length
    ranges.push([i, stop]); i = stop
  }
  return ranges
}

/** Splits only on safe existing boundaries. Joining the returned pages reproduces text exactly. */
export function splitLessonText(value, maxLength = PAGE_SIZE) {
  const text = String(value ?? '')
  if (!text) return ['']
  const limit = Number.isFinite(maxLength) && maxLength > 0 ? Math.max(1, Math.floor(maxLength)) : PAGE_SIZE
  const ranges = protectedRanges(text)
  const isSafe = (pos) => !ranges.some(([start, end]) => pos > start && pos < end)
  const pages = []
  let start = 0
  while (start < text.length) {
    if (text.length - start <= limit) { pages.push(text.slice(start)); break }
    const target = start + limit
    const floor = start + Math.floor(limit * .35)
    const candidates = { paragraph: [], sentence: [], word: [] }
    for (let pos = start + 1; pos <= Math.min(target, text.length - 1); pos += 1) {
      if (!isSafe(pos)) continue
      const left = text.slice(start, pos), right = text.slice(pos)
      if (/\n\s*\n$/.test(left) || (/\n$/.test(left) && /^#{1,4}\s/.test(right))) candidates.paragraph.push(pos)
      if (/[.!?。！？]["'”’)]*\s$/.test(left)) candidates.sentence.push(pos)
      if (/\s$/.test(left)) candidates.word.push(pos)
    }
    const preferred = (list) => list.filter((pos) => pos >= floor).at(-1)
    let end = preferred(candidates.paragraph) || preferred(candidates.sentence) || candidates.word.at(-1)
    if (!end || end <= start) {
      // Never slice a long formula, code span, or indivisible word. It can scroll on its slide.
      end = target
      while (end < text.length && (!isSafe(end) || !/\s/.test(text[end - 1]))) end += 1
    }
    if (end <= start) end = text.length
    pages.push(text.slice(start, end)); start = end
  }
  return pages
}

// Group short, connected ideas at a readable density, without dropping authored text.
// Edges are assigned once to their source node's group, including unlabeled connectors.
// A group sheet shows every stage open and holds about 110 tiếng at 1366x768: three short stages.
const FLOW_NODE_LIMIT = 3
const FLOW_TEXT_LIMIT = 480

function flowGroups(block) {
  const nodes = Array.isArray(block.nodes) ? block.nodes : []
  const originalEdges = Array.isArray(block.edges) ? block.edges : []
  const edges = validEdges(nodes, originalEdges)
  const entries = nodes.map((node, index) => {
    const assigned = edges.filter((edge) => edge.source === node.id)
    const size = String(node.label || '').length + String(node.description || '').length + assigned.reduce((sum, edge) => sum + String(edge.label || '').length + String(edge.description || '').length, 0)
    return { node, index, edges: assigned, size }
  })
  const groups = []
  for (const entry of entries) {
    let last = groups[groups.length - 1]
    if (!last || last.entries.length >= FLOW_NODE_LIMIT || (last.entries.length && last.size + entry.size > FLOW_TEXT_LIMIT)) {
      last = { entries: [], size: 0 }; groups.push(last)
    }
    last.entries.push(entry); last.size += entry.size
  }
  // Avoid a one-card tail when the preceding group can share a card without exceeding the budget.
  const tail = groups[groups.length - 1], previous = groups[groups.length - 2]
  if (tail?.entries.length === 1 && previous?.entries.length >= 3) {
    const moved = previous.entries[previous.entries.length - 1]
    if (tail.size + moved.size <= FLOW_TEXT_LIMIT) {
      previous.entries.pop(); previous.size -= moved.size
      tail.entries.unshift(moved); tail.size += moved.size
    }
  }
  return groups.map((group, index) => {
    const groupEdges = group.entries.flatMap((entry) => entry.edges).sort((a, b) => originalEdges.indexOf(a) - originalEdges.indexOf(b))
    return { index, nodeIds: group.entries.map((entry) => entry.node.id), nodeIndexes: group.entries.map((entry) => entry.index), edgeIds: groupEdges.map((edge) => edge.id), edgeIndexes: groupEdges.map((edge) => originalEdges.indexOf(edge)) }
  })
}

// A description that opens with what to press speaks of the reading view; anything else is the
// part's own content and may introduce it on a slide.
const UI_VERBS = new Set(['bấm', 'nhấn', 'kéo', 'chọn', 'chạm', 'dùng', 'xem', 'click', 'tap', 'drag', 'select', 'use', 'press', 'choose', 'watch'].map((verb) => verb.normalize('NFC')))

/** True when `text` is lesson content: not empty and its first word is not an interface verb. */
export function isContentText(text) {
  const value = String(text ?? '').normalize('NFC').trim()
  if (!value) return false
  const first = value.match(/[\p{L}\p{M}]+/u)?.[0]
  return !first || !UI_VERBS.has(first.toLowerCase().normalize('NFC'))
}

/** Build a deck while leaving each source block and all of its references unchanged. */
export function createLessonSlides(blocks) {
  const slides = []
  for (const [blockIndex, block] of (Array.isArray(blocks) ? blocks : []).entries()) {
    if (!block || typeof block !== 'object') continue
    const blockId = block.id ?? `block-${blockIndex}`
    const add = (kind, extra = {}) => slides.push({ id: `${blockId}:${kind}:${extra.index ?? extra.page ?? 0}`, blockId, kind, ...extra })
    if (block.type === 'text' && !block.visual3d) {
      const pages = splitLessonText(block.body)
      pages.forEach((body, page) => add('text', { body, page, pageCount: pages.length }))
    } else if (block.type === 'steps') {
      const steps = Array.isArray(block.steps) ? block.steps : []
      if (!steps.length) add('block')
      steps.forEach((step, index) => {
        const hasQuestion = typeof step?.check_question === 'string' && Boolean(step.check_question.trim())
        const length = String(step?.body || '').length + (hasQuestion ? step.check_question.length : 0)
        const combined = hasQuestion && length <= (step?.highlight ? COMBINE_LIMIT.figure : COMBINE_LIMIT.text)
        add('step', { index, itemId: step?.id, phase: combined ? 'combined' : 'explain' })
        if (hasQuestion && !combined) add('step-question', { index, itemId: step.id })
      })
      if (canPracticeOrder(block)) add('step-practice')
    } else if (block.type === 'flow') {
      const groups = flowGroups(block)
      if (groups.length !== 1) add('flow-overview')
      groups.forEach((group) => add('flow-group', group))
    } else add('block')
  }
  return slides
}
