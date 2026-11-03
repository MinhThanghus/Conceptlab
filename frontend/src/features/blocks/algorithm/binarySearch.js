/**
 * Binary search, step by step (spec §9.3, §7 Tin học) — pure generator.
 * Frame: { array, line, low, high, mid, found (index | -1 | null), comparisons,
 *          eliminated: number[], msg: { key, vars } } (msg.key under `algorithm.msg.*`).
 */

export const MAX_SEARCH_ITEMS = 16

export const SEARCH_PSEUDOCODE = [
  'low, high = 0, n - 1',
  'while low <= high:',
  '    mid = (low + high) // 2',
  '    if a[mid] == target: return mid',
  '    elif a[mid] < target: low = mid + 1',
  '    else: high = mid - 1',
  'return -1',
]

export const LINEAR_PSEUDOCODE = [
  'for i in range(n):',
  '    if a[i] == target: return i',
  'return -1',
]

const finite = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v))

/**
 * Binary search frames: { array, line, low, high, mid, found, comparisons, eliminated: number[], msg }.
 * `array` must be sorted ascending (normalizeSearch() sorts it).
 */
export function binarySearchTrace(array, target) {
  const a = array.slice()
  const frames = []
  let low = 0
  let high = a.length - 1
  let comparisons = 0
  const snap = (extra) => {
    const eliminated = []
    for (let k = 0; k < a.length; k += 1) if (k < low || k > high) eliminated.push(k)
    return { array: a, line: null, low, high, mid: null, found: null, comparisons, eliminated, ...extra }
  }
  frames.push(snap({ line: 0, msg: { key: 'algorithm.msg.searchStart', vars: { target, low, high } } }))
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    frames.push(snap({ line: 2, mid, msg: { key: 'algorithm.msg.searchMid', vars: { low, high, mid, value: a[mid] } } }))
    comparisons += 1
    if (a[mid] === target) {
      frames.push(snap({ line: 3, mid, found: mid, msg: { key: 'algorithm.msg.searchFound', vars: { target, mid } } }))
      return frames
    }
    if (a[mid] < target) {
      frames.push(snap({ line: 4, mid, msg: { key: 'algorithm.msg.searchRight', vars: { value: a[mid], target, next: mid + 1 } } }))
      low = mid + 1
    } else {
      frames.push(snap({ line: 5, mid, msg: { key: 'algorithm.msg.searchLeft', vars: { value: a[mid], target, next: mid - 1 } } }))
      high = mid - 1
    }
  }
  frames.push(snap({ line: 6, found: -1, msg: { key: 'algorithm.msg.searchNotFound', vars: { target, comparisons } } }))
  return frames
}

/** Search config → { array (sorted, ≤ 16), target }. */
export function normalizeSearch(config = {}) {
  let arr = (Array.isArray(config.array) ? config.array : []).filter(finite).map(Number).slice(0, MAX_SEARCH_ITEMS)
  if (arr.length < 1) arr = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91]
  arr.sort((x, y) => x - y)
  const target = finite(config.target) ? Number(config.target) : arr[Math.floor(arr.length * 0.6)]
  return { array: arr, target }
}

/** Linear search preserves input order and returns the first matching index. */
export function normalizeLinearSearch(config = {}) {
  let array = (Array.isArray(config.array) ? config.array : []).filter(finite).map(Number).slice(0, MAX_SEARCH_ITEMS)
  if (!array.length) array = [7, 2, 9, 3, 5]
  return { array, target: finite(config.target) ? Number(config.target) : array[Math.floor(array.length / 2)] }
}

export function linearSearchTrace(input, target) {
  const array = input.slice(), frames = []
  let comparisons = 0
  const snap = (extra) => ({ array, line: null, low: null, high: null, mid: null, found: null, comparisons, eliminated: [], ...extra })
  frames.push(snap({ line: 0, msg: { key: 'algorithm.msg.linearStart', vars: { target } } }))
  for (let i = 0; i < array.length; i += 1) {
    comparisons += 1
    const match = array[i] === target
    frames.push(snap({ line: 1, mid: i, found: match ? i : null, eliminated: Array.from({ length: i }, (_, j) => j), msg: { key: match ? 'algorithm.msg.linearFound' : 'algorithm.msg.linearCheck', vars: { target, index: i, value: array[i] } } }))
    if (match) return frames
  }
  frames.push(snap({ line: 2, found: -1, eliminated: array.map((_, i) => i), msg: { key: 'algorithm.msg.searchNotFound', vars: { target, comparisons } } }))
  return frames
}
