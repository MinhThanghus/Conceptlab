import { describe, expect, it } from 'vitest'
import { autoplayNext, autoplaySeconds, canPracticeOrder, checkOrder } from './stepsLogic.js'

describe('steps logic', () => {
  it('keeps autoplay within the schema range', () => {
    expect(autoplaySeconds({ autoplay_seconds: 6 })).toBe(6)
    expect(autoplaySeconds({ autoplay_seconds: 1 })).toBe(2)
    expect(autoplaySeconds({ autoplay_seconds: 600 })).toBe(60)
    expect(autoplaySeconds({ autoplay_seconds: 'x' })).toBe(6)
    expect(autoplaySeconds({})).toBe(6)
  })

  it('stops auto-playing at the last step', () => {
    expect(autoplayNext(0, 4)).toBe(1)
    expect(autoplayNext(2, 4)).toBe(3)
    expect(autoplayNext(3, 4)).toBeNull()
    expect(autoplayNext(0, 0)).toBeNull()
  })

  it('marks which steps are in the right place', () => {
    expect(checkOrder([0, 1, 2, 3])).toEqual({ marks: [true, true, true, true], correctCount: 4, total: 4, allCorrect: true })
    const result = checkOrder([1, 0, 2, 3])
    expect(result.marks).toEqual([false, false, true, true])
    expect(result.correctCount).toBe(2)
    expect(result.allCorrect).toBe(false)
    expect(checkOrder([2, 0, 1], [2, 0, 1]).allCorrect).toBe(true)
    expect(checkOrder([]).allCorrect).toBe(false)
  })

  it('only offers the ordering activity for a confirmed sequence of 3+ steps', () => {
    const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(canPracticeOrder({ sequence_confirmed: true, steps })).toBe(true)
    expect(canPracticeOrder({ sequence_confirmed: false, steps })).toBe(false)
    expect(canPracticeOrder({ sequence_confirmed: true, steps: steps.slice(0, 2) })).toBe(false)
  })
})
