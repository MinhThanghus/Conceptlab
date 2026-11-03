/** Pure helpers for the steps block (stepsLogic.test.js). */
import { clamp } from './lessonKit.js'

/** Seconds between auto-advanced steps, within the schema range 2..60. */
export function autoplaySeconds(block) {
  const value = Math.round(Number(block?.autoplay_seconds))
  return Number.isFinite(value) ? clamp(value, 2, 60) : 6
}

/** Next index while auto-playing, or null when the last step has been reached. */
export function autoplayNext(index, total) {
  return index + 1 < total ? index + 1 : null
}

/**
 * Compare a learner's arrangement (indices of the original steps, in the order shown)
 * with the correct order (by default 0..n-1).
 */
export function checkOrder(order, correct) {
  const expected = correct || order.map((_, i) => i)
  const marks = order.map((value, position) => value === expected[position])
  const correctCount = marks.filter(Boolean).length
  return { marks, correctCount, total: order.length, allCorrect: correctCount === order.length && order.length > 0 }
}

/** The ordering activity only makes sense for a confirmed order with at least three steps. */
export function canPracticeOrder(block) {
  return Boolean(block?.sequence_confirmed) && (block?.steps?.length || 0) >= 3
}
