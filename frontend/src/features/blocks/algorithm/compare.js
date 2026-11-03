/**
 * "Compare two small inputs" for the step-by-step algorithms (spec §10.3): the same
 * algorithm runs on input A and input B side by side, driven by one shared step index.
 * Pure helpers: quick presets, lockstep frames, cell states and the final comparison.
 */
import { MAX_ITEMS, shuffled } from './sorting.js'
import { normalizeSearch } from './binarySearch.js'

export const SORT_PRESETS = ['ascending', 'descending', 'mine', 'random']
export const SEARCH_PRESETS = ['middle', 'absent', 'mine']

const asc = (a, b) => a - b

/** A list for a sorting lane built from the learner's list: sorted, reversed, as is or shuffled. */
export function sortPreset(kind, values = [], rng = Math.random) {
  const base = (values || []).filter((v) => Number.isFinite(v)).slice(0, MAX_ITEMS)
  if (kind === 'ascending') return base.slice().sort(asc)
  if (kind === 'descending') return base.slice().sort((a, b) => b - a)
  if (kind === 'random') return shuffled(base, rng)
  return base
}

/** Which preset a lane list matches (to mark the chip as chosen); 'random' is never "matched". */
export function sortPresetOf(values, mine) {
  const key = (list) => (list || []).join(',')
  const v = key(values)
  if (v === key(sortPreset('ascending', mine))) return 'ascending'
  if (v === key(sortPreset('descending', mine))) return 'descending'
  if (v === key(mine)) return 'mine'
  return null
}

/** A value larger than every element: the search keeps going right and ends "not found". */
export function absentTarget(sorted) {
  if (!sorted?.length) return 1
  return Math.floor(sorted[sorted.length - 1]) + 1
}

/**
 * A { array, target } for a binary-search lane: 'middle' = found at the first comparison
 * (best case), 'absent' = a value bigger than all (not found), 'mine' = the learner's input.
 */
export function searchPreset(kind, input = {}) {
  const base = normalizeSearch(input)
  if (kind === 'middle')
    return {
      array: base.array,
      target: base.array[Math.floor((base.array.length - 1) / 2)],
    }
  if (kind === 'absent') return { array: base.array, target: absentTarget(base.array) }
  return base
}

export function searchPresetOf(lane, mine) {
  const same = (x, y) => x && y && x.target === y.target && x.array.join(',') === y.array.join(',')
  for (const kind of SEARCH_PRESETS) if (same(lane, searchPreset(kind, mine))) return kind
  return null
}

/** Frame of a lane at the shared step index: a lane that already finished stays on its last frame. */
export function laneFrame(frames, index) {
  if (!frames?.length) return null
  return frames[Math.max(0, Math.min(frames.length - 1, index))]
}

export function laneDone(frames, index) {
  return !frames?.length || index >= frames.length - 1
}

/** State of bar i in a sorting frame: 'swap' | 'write' | 'compare' | 'sorted' | ''. */
export function sortCellState(frame, i, algorithm) {
  if (!frame) return ''
  if (frame.swap?.includes(i)) return 'swap'
  if (frame.write === i && ['insertion_sort', 'merge_sort', 'counting_sort', 'radix_sort', 'bucket_sort'].includes(algorithm)) return 'write'
  if (frame.compare?.includes(i)) return 'compare'
  if (frame.sorted?.includes(i)) return 'sorted'
  return ''
}

/** Distinguish writes into a merged range from shifts and swaps. */
export function movesKey(algorithm) {
  return ['merge_sort', 'counting_sort', 'radix_sort', 'bucket_sort'].includes(algorithm) ? 'writes' : algorithm === 'insertion_sort' ? 'shifts' : 'swaps'
}

/**
 * Conclusion for one counter once both lanes have finished:
 * { kind: 'same', count } or { kind: 'more', more: 'A'|'B', less, moreCount, lessCount }.
 */
export function counterVerdict(a, b) {
  const x = Number(a) || 0
  const y = Number(b) || 0
  if (x === y) return { kind: 'same', count: x }
  return x > y ? { kind: 'more', more: 'A', less: 'B', moreCount: x, lessCount: y } : { kind: 'more', more: 'B', less: 'A', moreCount: y, lessCount: x }
}

/** Comparisons a left-to-right (linear) search needs for the same target. */
export function linearComparisons(array, found) {
  return found >= 0 ? found + 1 : (array || []).length
}
