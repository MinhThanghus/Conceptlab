import { describe, expect, it } from 'vitest'
import { bucketSortTrace, countingSortTrace, heapSortTrace, mergeSortTrace, quickSortTrace, radixSortTrace, sortInputIssue } from './sorting.js'
import { linearSearchTrace, normalizeLinearSearch } from './binarySearch.js'

describe('additional sorting traces', () => {
  for (const trace of [quickSortTrace, mergeSortTrace, heapSortTrace, countingSortTrace, radixSortTrace, bucketSortTrace]) {
    it(`${trace.name} sorts duplicates, negative values and ordered inputs without mutating the input`, () => {
      for (const input of [[], [5], [3, -1, 3, 0, -1], [1, 2, 3], [3, 2, 1], [2, 2, 2]]) {
        const before = input.slice()
        const frames = trace(input)
        expect(input).toEqual(before)
        expect(frames.at(-1).array).toEqual(before.slice().sort((a, b) => a - b))
        expect(frames.at(-1).sorted).toEqual(input.map((_, i) => i))
      }
    })
  }
  it('shows the temporary merge buffer during writes', () => {
    const writes = mergeSortTrace([4, 1, 3, 2]).filter((frame) => frame.write !== null)
    expect(writes.length).toBeGreaterThan(0)
    expect(writes.every((frame) => Array.isArray(frame.buffer) && frame.buffer.length > 0)).toBe(true)
    expect(writes.at(-1).writes).toBe(writes.length)
  })
  it('rejects fractional and oversized input instead of silently rounding', () => {
    expect(sortInputIssue('radix_sort', [1.2, 3]).code).toBe('integerOnly')
    expect(sortInputIssue('counting_sort', [0, 100]).code).toBe('rangeTooWide')
    expect(sortInputIssue('radix_sort', [-1000001, 1]).code).toBe('integerMagnitude')
    expect(radixSortTrace([1.2, 3]).at(-1).array).toEqual([1.2, 3])
  })
  it('sorts signed integer keys with radix while showing shifted buckets', () => {
    const frames = radixSortTrace([-10, -1, 0, 9, -10])
    expect(frames.at(-1).array).toEqual([-10, -10, -1, 0, 9])
    expect(frames.some((frame) => frame.buckets && frame.offset === 10)).toBe(true)
  })
  it('sorts negative decimals and duplicates in buckets without silently rounding', () => {
    const input = [0.25, -3.5, 2, -3.5, 0.1]
    const frames = bucketSortTrace(input)
    expect(frames.at(-1).array).toEqual([-3.5, -3.5, 0.1, 0.25, 2])
    expect(frames.some((frame) => frame.buckets && frame.bucketRange[0] === -3.5)).toBe(true)
    expect(sortInputIssue('bucket_sort', [1.2, -3.5])).toBeNull()
    expect(sortInputIssue('bucket_sort', [1_000_001, 1]).code).toBe('numberMagnitude')
  })
})

describe('linear search', () => {
  it('keeps the original unsorted order and returns the first match', () => {
    const input = normalizeLinearSearch({ array: [7, 2, 7, -1], target: 7 })
    expect(input.array).toEqual([7, 2, 7, -1])
    const last = linearSearchTrace(input.array, input.target).at(-1)
    expect(last.found).toBe(0)
    expect(last.comparisons).toBe(1)
  })
  it('checks every item when the target is absent', () => {
    const last = linearSearchTrace([3, 1, 3], 2).at(-1)
    expect(last.found).toBe(-1)
    expect(last.comparisons).toBe(3)
    expect(last.eliminated).toEqual([0, 1, 2])
  })
})
