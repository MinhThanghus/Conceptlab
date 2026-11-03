/**
 * Ideal simple pendulum (small-angle model) used by the live demo on the home page.
 *   T = 2π √(L / g)
 * Spec §6.3: with g = 9.81 m/s², L = 1 m → T ≈ 2.01 s and L = 0.25 m → T ≈ 1.00 s.
 * This is a model under stated assumptions (small angle, no air resistance), not a measurement.
 */

export const G_EARTH = 9.81
export const LENGTH_MIN = 0.1
export const LENGTH_MAX = 2.5
export const LENGTH_STEP = 0.05
export const AMPLITUDE_DEG = 12

/** Period in seconds; NaN for non-physical inputs. */
export function pendulumPeriod(length, g = G_EARTH) {
  const L = Number(length)
  const gg = Number(g)
  if (!Number.isFinite(L) || !Number.isFinite(gg) || L <= 0 || gg <= 0) return Number.NaN
  return 2 * Math.PI * Math.sqrt(L / gg)
}

/**
 * Advance the oscillation phase by dt seconds. Integrating the phase (instead of
 * computing it from absolute time) keeps the swing continuous when L changes mid-swing.
 */
export function advancePhase(phase, dtSeconds, period) {
  if (!Number.isFinite(period) || period <= 0) return phase
  const dt = Math.min(Math.max(Number(dtSeconds) || 0, 0), 0.1) // clamp tab-switch jumps
  return (phase + (2 * Math.PI * dt) / period) % (2 * Math.PI)
}

/** Angle in degrees at a phase: θ = θ₀ cos(φ). */
export function angleAt(phase, amplitudeDeg = AMPLITUDE_DEG) {
  return amplitudeDeg * Math.cos(phase)
}

/** Bob position for a pivot at (px, py) and a drawn string of `lengthPx` pixels. */
export function bobPosition(px, py, lengthPx, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: px + lengthPx * Math.sin(rad), y: py + lengthPx * Math.cos(rad) }
}

/** Map a length in metres to a drawn string length in pixels (linear, clamped). */
export function lengthToPixels(length, { minPx = 46, maxPx = 196 } = {}) {
  const L = Math.min(LENGTH_MAX, Math.max(LENGTH_MIN, Number(length) || LENGTH_MIN))
  return minPx + ((L - LENGTH_MIN) / (LENGTH_MAX - LENGTH_MIN)) * (maxPx - minPx)
}

/** Snap a slider value to the step grid (avoids 0.30000000000000004 in the UI). */
export function snapLength(value) {
  const L = Math.min(LENGTH_MAX, Math.max(LENGTH_MIN, Number(value) || LENGTH_MIN))
  return Math.round(L / LENGTH_STEP) * LENGTH_STEP
}
