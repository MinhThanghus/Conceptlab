import { describe, expect, it } from 'vitest'
import { phaseComparison, questionRate, ratingShares } from './resultsUtils.js'

describe('questionRate', () => {
  it('computes the rate from counts', () => {
    expect(questionRate({ attempts: 4, correct: 3, correct_rate: 75 })).toBe(0.75)
    expect(questionRate({ attempts: 10, correct: 0 })).toBe(0)
  })

  it('falls back to correct_rate as a ratio or a percentage', () => {
    expect(questionRate({ attempts: 0, correct_rate: 0.4 })).toBe(0.4)
    expect(questionRate({ attempts: 0, correct_rate: 40 })).toBe(0.4)
  })

  it('returns null without data', () => {
    expect(questionRate({ attempts: 0, correct: 0, correct_rate: null })).toBeNull()
    expect(questionRate(null)).toBeNull()
  })
})

describe('phaseComparison', () => {
  it('needs both before and after attempts', () => {
    expect(phaseComparison({ pre: { count: 3, avg_pct: 40 }, post: { count: 0, avg_pct: null } })).toBeNull()
    expect(phaseComparison({})).toBeNull()
  })

  it('returns the difference in percentage points', () => {
    expect(phaseComparison({ pre: { count: 5, avg_pct: 42.5 }, post: { count: 4, avg_pct: 70 } })).toEqual({
      pre: 42.5,
      post: 70,
      diff: 27.5,
      preCount: 5,
      postCount: 4,
    })
  })
})

describe('ratingShares', () => {
  it('lists 5 → 1 stars with shares', () => {
    const out = ratingShares({ 1: 1, 3: 1, 5: 2 })
    expect(out.map((r) => r.n)).toEqual([5, 4, 3, 2, 1])
    expect(out[0]).toEqual({ n: 5, count: 2, share: 0.5 })
    expect(out[1].share).toBe(0)
  })

  it('handles an empty distribution', () => {
    expect(ratingShares(null).every((r) => r.count === 0 && r.share === 0)).toBe(true)
  })
})
