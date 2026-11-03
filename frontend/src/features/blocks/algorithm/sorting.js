/**
 * Step-by-step traces for bubble, selection and insertion sort
 * (spec §9.3, §7 Tin học). Pure generators: each frame is a full snapshot so the UI
 * can jump backwards and forwards freely.
 *
 * Frame: { array, line, compare: [i, j] | null, swap: [i, j] | null, write: i | null,
 *          sorted: number[], pointers: {name: index}, key: number | null,
 *          comparisons, swaps, shifts, msg: { key, vars } }
 * msg.key is an i18n key under `algorithm.msg.*`.
 */

export const MAX_ITEMS = 12

/** Python-style pseudo-code (the Vietnamese 2018 informatics curriculum uses Python). */
export const PSEUDOCODE = {
  bubble_sort: [
    'for i in range(n - 1):',
    '    for j in range(n - 1 - i):',
    '        if a[j] > a[j + 1]:',
    '            a[j], a[j + 1] = a[j + 1], a[j]',
  ],
  selection_sort: [
    'for i in range(n - 1):',
    '    m = i',
    '    for j in range(i + 1, n):',
    '        if a[j] < a[m]:',
    '            m = j',
    '    a[i], a[m] = a[m], a[i]',
  ],
  insertion_sort: [
    'for i in range(1, n):',
    '    key = a[i]',
    '    j = i - 1',
    '    while j >= 0 and a[j] > key:',
    '        a[j + 1] = a[j]',
    '        j = j - 1',
    '    a[j + 1] = key',
  ],
  quick_sort: [
    'quick_sort(a, lo, hi):',
    '    if lo >= hi: return',
    '    pivot = a[hi]; i = lo',
    '    for j in range(lo, hi):',
    '        if a[j] <= pivot: swap(a[i], a[j]); i += 1',
    '    swap(a[i], a[hi])',
    '    quick_sort(a, lo, i - 1); quick_sort(a, i + 1, hi)',
  ],
  merge_sort: [
    'merge_sort(a, lo, hi):',
    '    if hi - lo <= 1: return',
    '    mid = (lo + hi) // 2',
    '    merge_sort(a, lo, mid); merge_sort(a, mid, hi)',
    '    temp = merge(a[lo:mid], a[mid:hi])',
    '    a[lo:hi] = temp',
  ],
  heap_sort: [
    'for i in range(n // 2 - 1, -1, -1):',
    '    sift_down(a, i, n)  # build a max-heap',
    'for end in range(n - 1, 0, -1):',
    '    swap(a[0], a[end])',
    '    sift_down(a, 0, end)',
    '# sift_down compares children and swaps with the largest',
  ],
  counting_sort: [
    'lo, hi = min(a), max(a); counts = [0] * (hi - lo + 1)',
    'for x in a: counts[x - lo] += 1',
    'i = 0',
    'for value in range(lo, hi + 1):',
    '    while counts[value - lo] > 0:',
    '        a[i] = value; i += 1; counts[value - lo] -= 1',
  ],
  radix_sort: [
    'offset = max(0, -min(a))',
    'for place in 1, 10, 100, ...:',
    '    buckets = [[], ..., []]  # 0 through 9',
    '    for x in a: buckets[((x + offset) // place) % 10].append(x)',
    '    a = flatten(buckets)  # preserve order inside each bucket',
  ],
  bucket_sort: [
    'buckets = [[], [], [], [], []]',
    'for x in a: buckets[interval(x, min(a), max(a))].append(x)',
    'for bucket in buckets: insertion_sort(bucket)',
    'a = flatten(buckets)',
  ],
}

function frame(state, extra) {
  return {
    array: state.a.slice(),
    line: null,
    compare: null,
    swap: null,
    write: null,
    sorted: [...state.sorted].sort((x, y) => x - y),
    pointers: {},
    key: null,
    comparisons: state.comparisons,
    swaps: state.swaps,
    shifts: state.shifts,
    writes: state.writes,
    ...extra,
  }
}

function init(input) {
  return { a: input.slice(), sorted: new Set(), comparisons: 0, swaps: 0, shifts: 0, writes: 0 }
}

export function bubbleSortTrace(input) {
  const s = init(input)
  const { a } = s
  const n = a.length
  const frames = [frame(s, { msg: { key: 'algorithm.msg.start', vars: { n } } })]
  for (let i = 0; i < n - 1; i += 1) {
    for (let j = 0; j < n - 1 - i; j += 1) {
      s.comparisons += 1
      const bigger = a[j] > a[j + 1]
      frames.push(frame(s, { line: 2, compare: [j, j + 1], pointers: { i, j }, msg: { key: bigger ? 'algorithm.msg.compareSwap' : 'algorithm.msg.compareKeep', vars: { a: a[j], b: a[j + 1] } } }))
      if (bigger) {
        ;[a[j], a[j + 1]] = [a[j + 1], a[j]]
        s.swaps += 1
        frames.push(frame(s, { line: 3, swap: [j, j + 1], pointers: { i, j }, msg: { key: 'algorithm.msg.swapped', vars: { a: a[j + 1], b: a[j] } } }))
      }
    }
    s.sorted.add(n - 1 - i)
    frames.push(frame(s, { line: 0, pointers: { i }, msg: { key: 'algorithm.msg.bubblePassDone', vars: { value: a[n - 1 - i], pass: i + 1 } } }))
  }
  for (let k = 0; k < n; k += 1) s.sorted.add(k)
  frames.push(frame(s, { msg: { key: 'algorithm.msg.sorted', vars: { comparisons: s.comparisons } } }))
  return frames
}

export function selectionSortTrace(input) {
  const s = init(input)
  const { a } = s
  const n = a.length
  const frames = [frame(s, { msg: { key: 'algorithm.msg.start', vars: { n } } })]
  for (let i = 0; i < n - 1; i += 1) {
    let m = i
    frames.push(frame(s, { line: 1, pointers: { i, m }, msg: { key: 'algorithm.msg.selectStart', vars: { i, value: a[i] } } }))
    for (let j = i + 1; j < n; j += 1) {
      s.comparisons += 1
      const smaller = a[j] < a[m]
      frames.push(frame(s, { line: 3, compare: [j, m], pointers: { i, m, j }, msg: { key: smaller ? 'algorithm.msg.selectNewMin' : 'algorithm.msg.selectKeepMin', vars: { a: a[j], b: a[m] } } }))
      if (smaller) {
        m = j
        frames.push(frame(s, { line: 4, pointers: { i, m, j }, msg: { key: 'algorithm.msg.selectMinIs', vars: { value: a[m] } } }))
      }
    }
    if (m !== i) {
      ;[a[i], a[m]] = [a[m], a[i]]
      s.swaps += 1
      s.sorted.add(i)
      frames.push(frame(s, { line: 5, swap: [i, m], pointers: { i, m }, msg: { key: 'algorithm.msg.selectSwap', vars: { value: a[i], i } } }))
    } else {
      s.sorted.add(i)
      frames.push(frame(s, { line: 5, pointers: { i, m }, msg: { key: 'algorithm.msg.selectInPlace', vars: { value: a[i] } } }))
    }
  }
  for (let k = 0; k < n; k += 1) s.sorted.add(k)
  frames.push(frame(s, { msg: { key: 'algorithm.msg.sorted', vars: { comparisons: s.comparisons } } }))
  return frames
}

export function insertionSortTrace(input) {
  const s = init(input)
  const { a } = s
  const n = a.length
  const frames = [frame(s, { msg: { key: 'algorithm.msg.start', vars: { n } } })]
  if (n > 0) s.sorted.add(0)
  for (let i = 1; i < n; i += 1) {
    const key = a[i]
    frames.push(frame(s, { line: 1, key, write: i, pointers: { i }, msg: { key: 'algorithm.msg.insertTake', vars: { value: key } } }))
    let j = i - 1
    while (j >= 0) {
      s.comparisons += 1
      const bigger = a[j] > key
      frames.push(frame(s, { line: 3, key, compare: [j, j + 1], pointers: { i, j }, msg: { key: bigger ? 'algorithm.msg.insertShiftNeeded' : 'algorithm.msg.insertStop', vars: { a: a[j], key } } }))
      if (!bigger) break
      a[j + 1] = a[j]
      s.shifts += 1
      frames.push(frame(s, { line: 4, key, write: j + 1, pointers: { i, j }, msg: { key: 'algorithm.msg.insertShift', vars: { value: a[j] } } }))
      j -= 1
    }
    a[j + 1] = key
    for (let k = 0; k <= i; k += 1) s.sorted.add(k)
    frames.push(frame(s, { line: 6, write: j + 1, pointers: { i }, msg: { key: 'algorithm.msg.insertPlace', vars: { value: key, pos: j + 1 } } }))
  }
  for (let k = 0; k < n; k += 1) s.sorted.add(k)
  frames.push(frame(s, { msg: { key: 'algorithm.msg.sorted', vars: { comparisons: s.comparisons } } }))
  return frames
}

/** Lomuto partition: each pivot is in its final position after partitioning. */
export function quickSortTrace(input) {
  const s = init(input), a = s.a, frames = [frame(s, { msg: { key: 'algorithm.msg.start', vars: { n: input.length } } })]
  function visit(lo, hi) {
    if (lo > hi) return
    if (lo === hi) { s.sorted.add(lo); return }
    const pivot = a[hi]
    let i = lo
    frames.push(frame(s, { line: 2, pointers: { lo, hi }, msg: { key: 'algorithm.msg.quickPivot', vars: { pivot, lo, hi } } }))
    for (let j = lo; j < hi; j += 1) {
      s.comparisons += 1
      const take = a[j] <= pivot
      frames.push(frame(s, { line: 4, compare: [j, hi], pointers: { i, j, hi }, msg: { key: take ? 'algorithm.msg.quickTake' : 'algorithm.msg.quickSkip', vars: { value: a[j], pivot } } }))
      if (take) {
        if (i !== j) { [a[i], a[j]] = [a[j], a[i]]; s.swaps += 1; frames.push(frame(s, { line: 4, swap: [i, j], pointers: { i, j, hi }, msg: { key: 'algorithm.msg.quickSwap', vars: { i, j } } })) }
        i += 1
      }
    }
    if (i !== hi) { [a[i], a[hi]] = [a[hi], a[i]]; s.swaps += 1 }
    s.sorted.add(i)
    frames.push(frame(s, { line: 5, swap: i !== hi ? [i, hi] : null, pointers: { i }, msg: { key: 'algorithm.msg.quickPlaced', vars: { pivot, i } } }))
    visit(lo, i - 1); visit(i + 1, hi)
  }
  visit(0, a.length - 1)
  frames.push(frame(s, { msg: { key: 'algorithm.msg.sorted', vars: { comparisons: s.comparisons } } }))
  return frames
}

/** Merge sort copies into an explicit temporary buffer before writing back. */
export function mergeSortTrace(input) {
  const s = init(input), a = s.a, frames = [frame(s, { msg: { key: 'algorithm.msg.start', vars: { n: input.length } } })]
  function visit(lo, hi) {
    if (hi - lo <= 1) return
    const mid = Math.floor((lo + hi) / 2)
    frames.push(frame(s, { line: 2, pointers: { lo, mid }, msg: { key: 'algorithm.msg.mergeSplit', vars: { lo, mid, hi: hi - 1 } } }))
    visit(lo, mid); visit(mid, hi)
    const left = a.slice(lo, mid), right = a.slice(mid, hi), buffer = []
    let i = 0, j = 0
    while (i < left.length && j < right.length) {
      s.comparisons += 1
      const takeLeft = left[i] <= right[j]
      frames.push(frame(s, { line: 4, compare: [lo + i, mid + j], buffer: buffer.slice(), msg: { key: 'algorithm.msg.mergeCompare', vars: { a: left[i], b: right[j] } } }))
      buffer.push(takeLeft ? left[i++] : right[j++])
    }
    while (i < left.length) buffer.push(left[i++])
    while (j < right.length) buffer.push(right[j++])
    frames.push(frame(s, { line: 4, buffer: buffer.slice(), msg: { key: 'algorithm.msg.mergeReady', vars: { lo, hi: hi - 1 } } }))
    for (let k = 0; k < buffer.length; k += 1) {
      a[lo + k] = buffer[k]; s.writes += 1
      frames.push(frame(s, { line: 5, write: lo + k, buffer: buffer.slice(), msg: { key: 'algorithm.msg.mergeWrite', vars: { value: buffer[k], index: lo + k } } }))
    }
  }
  visit(0, a.length)
  for (let i = 0; i < a.length; i += 1) s.sorted.add(i)
  frames.push(frame(s, { msg: { key: 'algorithm.msg.sorted', vars: { comparisons: s.comparisons } } }))
  return frames
}

/** In-place max-heap sort. Each extracted maximum is fixed at the end. */
export function heapSortTrace(input) {
  const s = init(input), a = s.a, frames = [frame(s, { msg: { key: 'algorithm.msg.start', vars: { n: input.length } } })]
  function sift(root, end, line) {
    for (;;) {
      let largest = root
      for (const child of [2 * root + 1, 2 * root + 2]) {
        if (child >= end) continue
        s.comparisons += 1
        frames.push(frame(s, { line, compare: [largest, child], pointers: { root, child }, msg: { key: 'algorithm.msg.heapCompare', vars: { a: a[largest], b: a[child] } } }))
        if (a[child] > a[largest]) largest = child
      }
      if (largest === root) return
      const left = a[root], right = a[largest]
      ;[a[root], a[largest]] = [a[largest], a[root]]
      s.swaps += 1
      frames.push(frame(s, { line, swap: [root, largest], pointers: { root, child: largest }, msg: { key: 'algorithm.msg.heapSwap', vars: { a: left, b: right } } }))
      root = largest
    }
  }
  for (let i = Math.floor(a.length / 2) - 1; i >= 0; i -= 1) sift(i, a.length, 1)
  if (a.length > 1) frames.push(frame(s, { line: 2, msg: { key: 'algorithm.msg.heapBuilt', vars: { value: a[0] } } }))
  for (let end = a.length - 1; end > 0; end -= 1) {
    const value = a[0]
    ;[a[0], a[end]] = [a[end], a[0]]
    s.swaps += 1; s.sorted.add(end)
    frames.push(frame(s, { line: 3, swap: [0, end], pointers: { end }, msg: { key: 'algorithm.msg.heapExtract', vars: { value, end } } }))
    sift(0, end, 4)
  }
  if (a.length) s.sorted.add(0)
  frames.push(frame(s, { msg: { key: 'algorithm.msg.sorted', vars: { comparisons: s.comparisons } } }))
  return frames
}

/** Constraints keep bucket storage bounded and avoid silently changing input numbers. */
export function sortInputIssue(algorithm, values) {
  if (!['counting_sort', 'radix_sort', 'bucket_sort'].includes(algorithm)) return null
  if (algorithm !== 'bucket_sort' && !values.every(Number.isSafeInteger)) return { code: 'integerOnly', vars: {} }
  if (values.some((n) => !Number.isFinite(n) || Math.abs(n) > 1000000)) return { code: algorithm === 'bucket_sort' ? 'numberMagnitude' : 'integerMagnitude', vars: { max: 1000000 } }
  if (algorithm === 'counting_sort' && values.length && Math.max(...values) - Math.min(...values) + 1 > 100) return { code: 'rangeTooWide', vars: { max: 100 } }
  return null
}

function invalidSortFrames(input, issue) {
  const s = init(input)
  return [frame(s, { msg: { key: `algorithm.list.${issue.code}`, vars: issue.vars } })]
}

/** Counting sort handles negative integers by indexing from the minimum. */
export function countingSortTrace(input) {
  const issue = sortInputIssue('counting_sort', input)
  if (issue) return invalidSortFrames(input, issue)
  const s = init(input), a = s.a, frames = [frame(s, { msg: { key: 'algorithm.msg.start', vars: { n: a.length } } })]
  if (!a.length) { frames.push(frame(s, { msg: { key: 'algorithm.msg.sorted', vars: { comparisons: 0 } } })); return frames }
  const min = Math.min(...a), max = Math.max(...a), counts = Array(max - min + 1).fill(0)
  const present = () => counts.map((count, i) => ({ value: i + min, count })).filter((bin) => bin.count)
  for (let i = 0; i < a.length; i += 1) {
    counts[a[i] - min] += 1
    frames.push(frame(s, { line: 1, pointers: { i }, counts: present(), msg: { key: 'algorithm.msg.countRead', vars: { value: a[i] } } }))
  }
  let index = 0
  for (let value = min; value <= max; value += 1) while (counts[value - min] > 0) {
    a[index] = value; counts[value - min] -= 1; s.writes += 1
    frames.push(frame(s, { line: 5, write: index, counts: present(), msg: { key: 'algorithm.msg.countWrite', vars: { value, index } } }))
    index += 1
  }
  for (let i = 0; i < a.length; i += 1) s.sorted.add(i)
  frames.push(frame(s, { msg: { key: 'algorithm.msg.sorted', vars: { comparisons: 0 } } }))
  return frames
}

/** Stable LSD radix sort of signed integers, offset into nonnegative keys. */
export function radixSortTrace(input) {
  const issue = sortInputIssue('radix_sort', input)
  if (issue) return invalidSortFrames(input, issue)
  const s = init(input), a = s.a, frames = [frame(s, { msg: { key: 'algorithm.msg.start', vars: { n: a.length } } })]
  if (!a.length) { frames.push(frame(s, { msg: { key: 'algorithm.msg.sorted', vars: { comparisons: 0 } } })); return frames }
  const offset = Math.max(0, -Math.min(...a)), maxKey = Math.max(...a) + offset
  for (let place = 1; place <= maxKey || place === 1; place *= 10) {
    const buckets = Array.from({ length: 10 }, () => [])
    const copyBuckets = () => buckets.map((bucket) => bucket.slice())
    for (let i = 0; i < a.length; i += 1) {
      const digit = Math.floor((a[i] + offset) / place) % 10
      buckets[digit].push(a[i])
      frames.push(frame(s, { line: 3, pointers: { i }, buckets: copyBuckets(), offset, place, msg: { key: 'algorithm.msg.radixDistribute', vars: { value: a[i], digit, place } } }))
    }
    const order = buckets.flat()
    for (let i = 0; i < order.length; i += 1) {
      a[i] = order[i]; s.writes += 1
      frames.push(frame(s, { line: 4, write: i, buckets: copyBuckets(), offset, place, msg: { key: 'algorithm.msg.radixWrite', vars: { value: order[i], index: i } } }))
    }
  }
  for (let i = 0; i < a.length; i += 1) s.sorted.add(i)
  frames.push(frame(s, { msg: { key: 'algorithm.msg.sorted', vars: { comparisons: 0 } } }))
  return frames
}

/** Bucket sort with five even ranges; each bucket uses stable insertion sort. */
export function bucketSortTrace(input) {
  const issue = sortInputIssue('bucket_sort', input)
  if (issue) return invalidSortFrames(input, issue)
  const s = init(input), a = s.a, frames = [frame(s, { msg: { key: 'algorithm.msg.start', vars: { n: a.length } } })]
  if (!a.length) { frames.push(frame(s, { msg: { key: 'algorithm.msg.sorted', vars: { comparisons: 0 } } })); return frames }
  const min = Math.min(...a), max = Math.max(...a), buckets = Array.from({ length: 5 }, () => [])
  const copyBuckets = () => buckets.map((bucket) => bucket.slice())
  for (let i = 0; i < a.length; i += 1) {
    const bucket = max === min ? 0 : Math.min(4, Math.floor(((a[i] - min) / (max - min)) * 5))
    buckets[bucket].push(a[i])
    frames.push(frame(s, { line: 1, pointers: { i }, buckets: copyBuckets(), bucketRange: [min, max], msg: { key: 'algorithm.msg.bucketDistribute', vars: { value: a[i], bucket } } }))
  }
  for (let b = 0; b < buckets.length; b += 1) {
    const bucket = buckets[b]
    for (let i = 1; i < bucket.length; i += 1) {
      const key = bucket[i]
      let j = i - 1
      while (j >= 0) {
        s.comparisons += 1
        frames.push(frame(s, { line: 2, buckets: copyBuckets(), bucketRange: [min, max], bucketKey: key, msg: { key: 'algorithm.msg.bucketCompare', vars: { a: bucket[j], key, bucket: b } } }))
        if (bucket[j] <= key) break
        bucket[j + 1] = bucket[j]; j -= 1
        frames.push(frame(s, { line: 2, buckets: copyBuckets(), bucketRange: [min, max], bucketKey: key, msg: { key: 'algorithm.msg.bucketShift', vars: { bucket: b } } }))
      }
      bucket[j + 1] = key
      frames.push(frame(s, { line: 2, buckets: copyBuckets(), bucketRange: [min, max], msg: { key: 'algorithm.msg.bucketPlace', vars: { value: key, bucket: b } } }))
    }
  }
  const order = buckets.flat()
  for (let i = 0; i < order.length; i += 1) {
    a[i] = order[i]; s.writes += 1
    frames.push(frame(s, { line: 3, write: i, buckets: copyBuckets(), bucketRange: [min, max], msg: { key: 'algorithm.msg.bucketWrite', vars: { value: order[i], index: i } } }))
  }
  for (let i = 0; i < a.length; i += 1) s.sorted.add(i)
  frames.push(frame(s, { msg: { key: 'algorithm.msg.sorted', vars: { comparisons: s.comparisons } } }))
  return frames
}

export const SORT_TRACES = {
  bubble_sort: bubbleSortTrace,
  selection_sort: selectionSortTrace,
  insertion_sort: insertionSortTrace,
  quick_sort: quickSortTrace,
  merge_sort: mergeSortTrace,
  heap_sort: heapSortTrace,
  counting_sort: countingSortTrace,
  radix_sort: radixSortTrace,
  bucket_sort: bucketSortTrace,
}

const finite = (v) => Number.isFinite(Number(v)) && v !== '' && v !== null

/** Sorting config → { array } with 2..12 finite numbers (default example when empty). */
export function normalizeSort(config = {}, fallback = [5, 2, 9, 1, 6]) {
  const arr = (Array.isArray(config.array) ? config.array : []).filter(finite).map(Number).slice(0, MAX_ITEMS)
  return { array: arr.length >= 2 ? arr : fallback.slice() }
}

export function isSortedAscending(arr) {
  for (let i = 1; i < arr.length; i += 1) if (arr[i - 1] > arr[i]) return false
  return true
}

/** Fisher–Yates shuffle (returns a new array). */
export function shuffled(arr, rng = Math.random) {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Random small integers 1..99 (distinct when possible) for a quick new example. */
export function randomArray(n, rng = Math.random) {
  const out = new Set()
  while (out.size < n) out.add(1 + Math.floor(rng() * 99))
  return [...out]
}
