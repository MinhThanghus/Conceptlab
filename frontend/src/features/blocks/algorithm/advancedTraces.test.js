import { describe, expect, it } from 'vitest'
import { fibonacciTrace, graphTrace, greedyTrace, hashTrace, knapsackTrace, queensTrace } from './advancedTraces.js'

describe('graph traversal', () => {
  it('BFS visits by shortest distance on a cyclic graph, without duplicates', () => {
    const frames = graphTrace('A', 'bfs')
    expect(frames.at(-1).visited).toEqual(['A', 'B', 'C', 'D', 'F', 'E'])
    expect(new Set(frames.at(-1).visited).size).toBe(6)
    expect(frames.at(-1).frontier).toEqual([])
  })
  it('DFS uses a stack and visits every reachable node once', () => {
    const last = graphTrace('A', 'dfs').at(-1)
    expect(last.visited).toEqual(['A', 'B', 'D', 'C', 'F', 'E'])
    expect(new Set(last.visited)).toEqual(new Set(['A', 'B', 'C', 'D', 'E', 'F']))
    expect(last.visited.length).toBe(6)
    expect(last.frontier).toEqual([])
  })
})

describe('backtracking', () => {
  it('finds a valid arrangement and actually backtracks', () => {
    const frames = queensTrace(4), last = frames.at(-1)
    expect(last.event).toBe('solution')
    expect(frames.some((frame) => frame.event === 'backtrack')).toBe(true)
    expect(new Set(last.board).size).toBe(4)
    for (let r = 0; r < 4; r += 1) for (let s = r + 1; s < 4; s += 1) expect(Math.abs(last.board[r] - last.board[s])).not.toBe(s - r)
  })
  it('reports no solution for 3 queens', () => expect(queensTrace(3).at(-1).event).toBe('noSolution'))
})

describe('bottom-up Fibonacci', () => {
  it('starts from the base cases and computes each table value', () => {
    expect(fibonacciTrace(0).at(-1).table).toEqual([0])
    expect(fibonacciTrace(1).at(-1).table).toEqual([0, 1])
    expect(fibonacciTrace(8).at(-1).table).toEqual([0, 1, 1, 2, 3, 5, 8, 13, 21])
  })
})

describe('hash collisions and greedy choices', () => {
  it('resolves collisions, avoids duplicates, and stops when full', () => {
    const frames = hashTrace(5, [1, 6, 11, 16, 21, 26, 6])
    expect(frames.some((frame) => frame.event === 'collision')).toBe(true)
    expect(frames.some((frame) => frame.event === 'full' && frame.key === 26)).toBe(true)
    expect(frames.some((frame) => frame.event === 'duplicate' && frame.key === 6)).toBe(true)
    expect(frames.at(-1).table).toEqual([21, 1, 6, 11, 16])
  })
  it('shows a counterexample to the greedy coin strategy', () => {
    const last = greedyTrace(6, [4, 3, 1]).at(-1)
    expect(last.chosen).toEqual([4, 1, 1])
    expect(last.remaining).toBe(0)
    expect(last.optimal).toBe(2)
  })
})

describe('0/1 knapsack', () => {
  it('uses each item at most once and matches exhaustive enumeration', () => {
    const items = [{ weight: 2, value: 3 }, { weight: 3, value: 4 }, { weight: 4, value: 5 }]
    for (let capacity = 1; capacity <= 8; capacity += 1) {
      const last = knapsackTrace(capacity, items).at(-1)
      let optimum = 0
      for (let mask = 0; mask < 2 ** items.length; mask += 1) {
        const selected = items.filter((_, index) => (mask & (1 << index)) !== 0)
        if (selected.reduce((sum, item) => sum + item.weight, 0) <= capacity) optimum = Math.max(optimum, selected.reduce((sum, item) => sum + item.value, 0))
      }
      expect(last.result).toBe(optimum)
      expect(new Set(last.chosen).size).toBe(last.chosen.length)
      expect(last.chosen.reduce((sum, i) => sum + items[i - 1].weight, 0)).toBeLessThanOrEqual(capacity)
      expect(last.chosen.reduce((sum, i) => sum + items[i - 1].value, 0)).toBe(optimum)
    }
  })
})
