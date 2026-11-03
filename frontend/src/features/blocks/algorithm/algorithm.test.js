import { describe, expect, it } from 'vitest'
import {
  computeAttention,
  dotTerms,
  entropy,
  EXAMPLE_MATRICES,
  matmul,
  normalizeAttention,
  randomAttention,
  resizeAttention,
  seededRandom,
  softmax,
  transpose,
} from './attention.js'
import { binarySearchTrace, normalizeSearch, SEARCH_PSEUDOCODE } from './binarySearch.js'
import { bubbleSortTrace, insertionSortTrace, isSortedAscending, normalizeSort, PSEUDOCODE, randomArray, selectionSortTrace, shuffled, SORT_TRACES } from './sorting.js'

describe('attention', () => {
  const Q = [
    [1, 0],
    [0, 1],
  ]
  const K = [
    [1, 0],
    [1, 1],
  ]
  const V = [
    [1, 2],
    [3, 4],
  ]

  it('matrix helpers', () => {
    expect(transpose(K)).toEqual([
      [1, 1],
      [0, 1],
    ])
    expect(matmul(Q, transpose(K))).toEqual([
      [1, 1],
      [0, 1],
    ])
  })

  it('computes scores, scaling by 1/√d_k, softmax and output by hand-checked numbers', () => {
    const r = computeAttention({ Q, K, V })
    expect(r.dk).toBe(2)
    expect(r.scores).toEqual([
      [1, 1],
      [0, 1],
    ])
    expect(r.factor).toBeCloseTo(1 / Math.SQRT2, 12)
    expect(r.scaled[1][1]).toBeCloseTo(0.7071067811865475, 12)
    // row 0: equal scores → equal weights
    expect(r.weights[0][0]).toBeCloseTo(0.5, 12)
    expect(r.output[0]).toEqual([2, 3])
    // row 1: softmax([0, 1/√2]) = [1/(1+e^0.7071), …] = [0.330238…, 0.669762…]
    expect(r.weights[1][0]).toBeCloseTo(0.3302384506733431, 12)
    expect(r.weights[1][1]).toBeCloseTo(0.6697615493266569, 12)
    expect(r.output[1][0]).toBeCloseTo(2.339523098653314, 12)
  })

  it('every softmax row sums to 1 (also for large scores)', () => {
    const r = computeAttention(normalizeAttention({ ...EXAMPLE_MATRICES, tokens: ['a', 'b', 'c', 'd'] }))
    for (const row of r.weights) expect(row.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12)
    const big = softmax([1000, 999, -1000])
    expect(big.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12)
    expect(big.every(Number.isFinite)).toBe(true)
  })

  it('without √d_k scaling the softmax is sharper (lower entropy)', () => {
    const cfg = normalizeAttention({ ...EXAMPLE_MATRICES })
    const scaled = computeAttention(cfg, { scale: true })
    const raw = computeAttention(cfg, { scale: false })
    expect(raw.factor).toBe(1)
    raw.weights.forEach((row, i) => {
      expect(entropy(row)).toBeLessThanOrEqual(entropy(scaled.weights[i]) + 1e-12)
      expect(Math.max(...row)).toBeGreaterThanOrEqual(Math.max(...scaled.weights[i]) - 1e-12)
    })
  })

  it('dot terms explain one score', () => {
    expect(dotTerms(Q, K, 1, 1)).toEqual([
      [0, 1],
      [1, 1],
    ])
  })

  it('normalises sizes, numbers and labels', () => {
    const cfg = normalizeAttention({ tokens: ['x', '', 'z', 'w', 'v', 'u'], Q: [[1, 'a'], [2]], K: [], V: [[1, 2, 3]] })
    expect(cfg.tokens).toEqual(['x', 't2', 'z', 'w', 'v'])
    expect(cfg.Q).toHaveLength(5)
    expect(cfg.Q[0]).toEqual([1, 0])
    expect(cfg.V[0]).toEqual([1, 2, 3])
    expect(normalizeAttention({}).tokens).toHaveLength(3)
  })

  it('resizes and randomises within bounds', () => {
    const cfg = resizeAttention(normalizeAttention({ ...EXAMPLE_MATRICES }), { tokens: 2, dim: 2 })
    expect(cfg.Q).toEqual([
      [2, 0],
      [0, 2],
    ])
    expect(resizeAttention(cfg, { tokens: 9 }).tokens).toHaveLength(5)
    const rnd = randomAttention(['a', 'b', 'c'], 3, seededRandom(7))
    expect(rnd.Q.flat().every((v) => Number.isInteger(v) && v >= -2 && v <= 3)).toBe(true)
    expect(randomAttention(['a', 'b'], 2, seededRandom(7))).toEqual(randomAttention(['a', 'b'], 2, seededRandom(7)))
  })
})

describe('sorting traces', () => {
  const input = [5, 2, 9, 1, 6, 1]
  for (const [name, trace] of Object.entries(SORT_TRACES)) {
    it(`${name} ends sorted, starts with the input and never loses values`, () => {
      const frames = trace(input)
      expect(frames[0].array).toEqual(input)
      const last = frames[frames.length - 1]
      expect(last.array).toEqual([...input].sort((a, b) => a - b))
      expect(isSortedAscending(last.array)).toBe(true)
      expect(last.sorted).toEqual([0, 1, 2, 3, 4, 5])
      frames.forEach((f) => {
        // Insertion holds a key and merge writes from its explicit temporary buffer;
        // during those writes the visible array alone need not be a permutation yet.
        if (name !== 'insertion_sort' && !(name === 'merge_sort' && f.buffer) && !(['counting_sort', 'radix_sort', 'bucket_sort'].includes(name) && f.write !== null)) expect([...f.array].sort((a, b) => a - b)).toEqual([...input].sort((a, b) => a - b))
        if (f.line !== null) expect(PSEUDOCODE[name][f.line]).toBeTruthy()
        expect(f.msg.key.startsWith('algorithm.msg.')).toBe(true)
      })
    })
  }

  it('bubble sort counts comparisons n(n−1)/2 and swaps = inversions', () => {
    const last = bubbleSortTrace([3, 2, 1]).at(-1)
    expect(last.comparisons).toBe(3)
    expect(last.swaps).toBe(3)
  })

  it('selection sort makes at most n−1 swaps', () => {
    const last = selectionSortTrace([4, 3, 2, 1, 5]).at(-1)
    expect(last.comparisons).toBe(10)
    expect(last.swaps).toBeLessThanOrEqual(4)
  })

  it('insertion sort on sorted input needs n−1 comparisons and no shifts', () => {
    const last = insertionSortTrace([1, 2, 3, 4]).at(-1)
    expect(last.comparisons).toBe(3)
    expect(last.shifts).toBe(0)
  })

  it('normalises arrays and keeps helpers pure', () => {
    expect(normalizeSort({ array: [3, 'x', '', 7, null] }).array).toEqual([3, 7])
    expect(normalizeSort({ array: [1] }).array).toEqual([5, 2, 9, 1, 6])
    expect(normalizeSort({ array: Array.from({ length: 20 }, (_, i) => i) }).array).toHaveLength(12)
    const arr = [1, 2, 3, 4]
    expect(shuffled(arr).sort()).toEqual(arr)
    expect(new Set(randomArray(8)).size).toBe(8)
  })
})

describe('binary search trace', () => {
  const arr = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91]

  it('finds a present value with at most ⌈log2(n+1)⌉ comparisons', () => {
    for (const [i, target] of arr.entries()) {
      const frames = binarySearchTrace(arr, target)
      const last = frames.at(-1)
      expect(last.found).toBe(i)
      expect(last.comparisons).toBeLessThanOrEqual(Math.ceil(Math.log2(arr.length + 1)))
    }
  })

  it('reports a missing value and eliminates everything', () => {
    const frames = binarySearchTrace(arr, 13)
    const last = frames.at(-1)
    expect(last.found).toBe(-1)
    expect(last.line).toBe(6)
    expect(last.eliminated).toHaveLength(arr.length)
    expect(last.msg.key).toBe('algorithm.msg.searchNotFound')
    frames.forEach((f) => f.line !== null && expect(SEARCH_PSEUDOCODE[f.line]).toBeTruthy())
  })

  it('low/mid/high stay consistent', () => {
    for (const f of binarySearchTrace(arr, 72)) {
      if (f.mid !== null && f.found === null) {
        expect(f.mid).toBeGreaterThanOrEqual(f.low)
        expect(f.mid).toBeLessThanOrEqual(f.high)
      }
    }
  })

  it('normalises: sorts the array and picks a default target', () => {
    expect(normalizeSearch({ array: [9, 1, 5], target: 5 })).toEqual({ array: [1, 5, 9], target: 5 })
    expect(normalizeSearch({}).array.length).toBeGreaterThan(1)
    expect(Number.isFinite(normalizeSearch({ array: [3, 1] }).target)).toBe(true)
  })
})
