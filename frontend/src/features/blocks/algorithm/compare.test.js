import { describe, expect, it } from 'vitest'
import { absentTarget, counterVerdict, laneDone, laneFrame, linearComparisons, movesKey, searchPreset, searchPresetOf, sortCellState, sortPreset, sortPresetOf } from './compare.js'
import { bubbleSortTrace, insertionSortTrace } from './sorting.js'
import { binarySearchTrace } from './binarySearch.js'

describe('sort presets', () => {
  const mine = [7, 3, 9, 1, 5, 2]
  it('builds sorted, reversed and unchanged lists from the learner list', () => {
    expect(sortPreset('ascending', mine)).toEqual([1, 2, 3, 5, 7, 9])
    expect(sortPreset('descending', mine)).toEqual([9, 7, 5, 3, 2, 1])
    expect(sortPreset('mine', mine)).toEqual(mine)
    expect(mine).toEqual([7, 3, 9, 1, 5, 2]) // never mutated
  })
  it('shuffles with the given random source and keeps the same values', () => {
    const out = sortPreset('random', mine, () => 0)
    expect(out.slice().sort((a, b) => a - b)).toEqual([1, 2, 3, 5, 7, 9])
  })
  it('recognises which preset a lane holds', () => {
    expect(sortPresetOf([1, 2, 3, 5, 7, 9], mine)).toBe('ascending')
    expect(sortPresetOf([9, 7, 5, 3, 2, 1], mine)).toBe('descending')
    expect(sortPresetOf(mine, mine)).toBe('mine')
    expect(sortPresetOf([4, 4], mine)).toBe(null)
  })
  it('a sorted input needs no swaps, a reversed one swaps every pair (bubble sort)', () => {
    const a = bubbleSortTrace(sortPreset('ascending', mine)).at(-1)
    const b = bubbleSortTrace(sortPreset('descending', mine)).at(-1)
    expect(a.comparisons).toBe(15)
    expect(b.comparisons).toBe(15)
    expect(a.swaps).toBe(0)
    expect(b.swaps).toBe(15)
  })
  it('insertion sort compares far less on a sorted input', () => {
    const a = insertionSortTrace(sortPreset('ascending', mine)).at(-1)
    const b = insertionSortTrace(sortPreset('descending', mine)).at(-1)
    expect(a.comparisons).toBe(5)
    expect(b.comparisons).toBe(15)
    expect(b.shifts).toBe(15)
  })
})

describe('search presets', () => {
  const mine = { array: [91, 2, 5, 8, 12, 16, 23, 38, 56, 72], target: 23 }
  it('middle value is found at the first comparison', () => {
    const lane = searchPreset('middle', mine)
    expect(lane.array).toEqual([2, 5, 8, 12, 16, 23, 38, 56, 72, 91])
    const last = binarySearchTrace(lane.array, lane.target).at(-1)
    expect(last.comparisons).toBe(1)
    expect(last.found).toBe(4)
  })
  it('absent value is bigger than every element and is not found', () => {
    const lane = searchPreset('absent', mine)
    expect(lane.target).toBe(92)
    expect(binarySearchTrace(lane.array, lane.target).at(-1).found).toBe(-1)
    expect(absentTarget([1.5, 2.5])).toBe(3)
    expect(absentTarget([])).toBe(1)
  })
  it('mine keeps the learner input (sorted) and is recognised', () => {
    const lane = searchPreset('mine', mine)
    expect(lane.target).toBe(23)
    expect(searchPresetOf(lane, mine)).toBe('mine')
    expect(searchPresetOf(searchPreset('absent', mine), mine)).toBe('absent')
    expect(searchPresetOf({ array: [1, 2], target: 2 }, mine)).toBe(null)
  })
  it('counts the comparisons of a linear search', () => {
    expect(linearComparisons([2, 5, 8], 1)).toBe(2)
    expect(linearComparisons([2, 5, 8], -1)).toBe(3)
  })
})

describe('lockstep lanes', () => {
  const short = [{ n: 0 }, { n: 1 }]
  it('a finished lane stays on its last frame', () => {
    expect(laneFrame(short, 0)).toEqual({ n: 0 })
    expect(laneFrame(short, 5)).toEqual({ n: 1 })
    expect(laneFrame(short, -2)).toEqual({ n: 0 })
    expect(laneFrame([], 1)).toBe(null)
    expect(laneDone(short, 0)).toBe(false)
    expect(laneDone(short, 1)).toBe(true)
    expect(laneDone(short, 9)).toBe(true)
  })
})

describe('cell state and verdicts', () => {
  it('marks swap before compare before sorted', () => {
    const frame = { swap: [0, 1], compare: [1, 2], sorted: [2, 3], write: 3 }
    expect(sortCellState(frame, 0, 'bubble_sort')).toBe('swap')
    expect(sortCellState(frame, 2, 'bubble_sort')).toBe('compare')
    expect(sortCellState(frame, 3, 'bubble_sort')).toBe('sorted')
    expect(sortCellState(frame, 3, 'insertion_sort')).toBe('write')
    expect(sortCellState(frame, 5, 'bubble_sort')).toBe('')
    expect(sortCellState(null, 0, 'bubble_sort')).toBe('')
  })
  it('names the moves counter', () => {
    expect(movesKey('insertion_sort')).toBe('shifts')
    expect(movesKey('bubble_sort')).toBe('swaps')
  })
  it('says which input needs more', () => {
    expect(counterVerdict(15, 15)).toEqual({ kind: 'same', count: 15 })
    expect(counterVerdict(5, 15)).toEqual({
      kind: 'more',
      more: 'B',
      less: 'A',
      moreCount: 15,
      lessCount: 5,
    })
    expect(counterVerdict(4, 1)).toEqual({
      kind: 'more',
      more: 'A',
      less: 'B',
      moreCount: 4,
      lessCount: 1,
    })
  })
})
