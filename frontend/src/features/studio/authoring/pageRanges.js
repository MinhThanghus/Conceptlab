/**
 * Page range text used when choosing PDF pages for AI analysis.
 *   parsePageRanges('1-3, 5', 12) → { pages: [1, 2, 3, 5], error: null }
 *   formatPageRanges([1, 2, 3, 5]) → '1-3, 5'
 * Pages are 1-based. Accepts commas, semicolons or spaces between parts and -, – or — in ranges.
 */

const RANGE_DASH = /\s*[-–—]\s*/g

/**
 * @returns {{ pages: number[], error: null | { code: 'invalid' | 'outOfRange' | 'tooMany', token?: string, page?: number, max?: number } }}
 */
export function parsePageRanges(text, max = Infinity, { limit = 2000 } = {}) {
  const src = String(text ?? '').replace(RANGE_DASH, '-').trim()
  if (!src) return { pages: [], error: null }
  const out = new Set()
  for (const token of src.split(/[,;\s]+/).filter(Boolean)) {
    const single = /^(\d{1,6})$/.exec(token)
    const range = /^(\d{1,6})-(\d{1,6})$/.exec(token)
    if (!single && !range) return { pages: [], error: { code: 'invalid', token } }
    let from = Number(single ? single[1] : range[1])
    let to = Number(single ? single[1] : range[2])
    if (from > to) [from, to] = [to, from]
    if (from < 1) return { pages: [], error: { code: 'outOfRange', page: from, max } }
    if (to > max) return { pages: [], error: { code: 'outOfRange', page: to, max } }
    if (to - from + 1 > limit) return { pages: [], error: { code: 'tooMany', max: limit } }
    for (let p = from; p <= to; p += 1) out.add(p)
    if (out.size > limit) return { pages: [], error: { code: 'tooMany', max: limit } }
  }
  return { pages: [...out].sort((a, b) => a - b), error: null }
}

/** Compact, editable text for a set of pages: [1,2,3,5,7,8] → '1-3, 5, 7-8'. */
export function formatPageRanges(pages) {
  const sorted = [...new Set((pages || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b)
  const parts = []
  let start = null
  let prev = null
  for (const n of sorted) {
    if (start === null) {
      start = n
      prev = n
    } else if (n === prev + 1) {
      prev = n
    } else {
      parts.push(start === prev ? `${start}` : `${start}-${prev}`)
      start = n
      prev = n
    }
  }
  if (start !== null) parts.push(start === prev ? `${start}` : `${start}-${prev}`)
  return parts.join(', ')
}

/** Pages 1..n */
export function allPages(n) {
  return Array.from({ length: Math.max(0, Number(n) || 0) }, (_, i) => i + 1)
}

/**
 * Default selection for a PDF: short documents → every page; long ones → the first `firstN`
 * pages, so the teacher narrows the selection to the lesson instead of sending a whole book.
 */
export function defaultPages(pageCount, { allUpTo = 20, firstN = 10 } = {}) {
  const n = Number(pageCount) || 0
  if (n <= 0) return []
  return n <= allUpTo ? allPages(n) : allPages(Math.min(firstN, n))
}

export function togglePage(pages, page) {
  const set = new Set(pages || [])
  if (set.has(page)) set.delete(page)
  else set.add(page)
  return [...set].sort((a, b) => a - b)
}
