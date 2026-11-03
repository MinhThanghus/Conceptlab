/**
 * Pure helpers shared by the chart components (no DOM, no React):
 * "nice" ticks, linear scales, gap-aware segments and robust automatic domains.
 */

/** A "nice" number close to `range` (1, 2, 5 × 10^k). */
export function niceNum(range, round = true) {
  if (!(range > 0) || !Number.isFinite(range)) return 1
  const exponent = Math.floor(Math.log10(range))
  const fraction = range / 10 ** exponent
  let nice
  if (round) nice = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10
  else nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return nice * 10 ** exponent
}

/** Number of decimals needed to print multiples of `step` exactly (0.25 → 2, 5 → 0). */
export function decimalsFor(step) {
  if (!Number.isFinite(step) || step <= 0) return 0
  for (let d = 0; d < 12; d += 1) {
    const scaled = step * 10 ** d
    if (Math.abs(Math.round(scaled) - scaled) < 1e-6 * Math.max(1, Math.abs(scaled))) return d
  }
  return 12
}

function clean(value, decimals) {
  const v = Number(value.toFixed(Math.min(12, decimals)))
  return Object.is(v, -0) ? 0 : v
}

/**
 * Ticks for [min, max] at "nice" positions. `count` is a target, not a promise.
 * Returns { ticks, step, decimals }.
 */
export function niceTicks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ticks: [], step: 1, decimals: 0 }
  let lo = Math.min(min, max)
  let hi = Math.max(min, max)
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.5
    lo -= pad
    hi += pad
  }
  const step = niceNum((hi - lo) / Math.max(1, count), true)
  const decimals = decimalsFor(step)
  const first = Math.ceil(lo / step - 1e-9)
  const ticks = []
  for (let i = first; i * step <= hi + step * 1e-9 && ticks.length <= 60; i += 1) ticks.push(clean(i * step, decimals))
  return { ticks, step, decimals }
}

/** Expand [min, max] outward to tick boundaries so the frame ends on labelled values. */
export function niceDomain(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1]
  let lo = Math.min(min, max)
  let hi = Math.max(min, max)
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.5
    lo -= pad
    hi += pad
  }
  const step = niceNum((hi - lo) / Math.max(1, count), true)
  const decimals = decimalsFor(step)
  return [clean(Math.floor(lo / step + 1e-9) * step, decimals), clean(Math.ceil(hi / step - 1e-9) * step, decimals)]
}

/** Linear map from a domain to a range, with `.invert`. */
export function linearScale([d0, d1], [r0, r1]) {
  const span = d1 - d0 || 1
  const k = (r1 - r0) / span
  const scale = (v) => r0 + (v - d0) * k
  scale.invert = (r) => d0 + (r - r0) / (k || 1)
  scale.domain = [d0, d1]
  scale.range = [r0, r1]
  return scale
}

/** Accept [[x, y]…], [{x, y}…] or {x: [], y: []} and return [[x, y]…]. */
export function toPoints(data) {
  if (!data) return []
  if (Array.isArray(data)) {
    return data.map((p) => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p?.x), Number(p?.y)]))
  }
  if (Array.isArray(data.x) && Array.isArray(data.y)) {
    const n = Math.min(data.x.length, data.y.length)
    const out = new Array(n)
    for (let i = 0; i < n; i += 1) out[i] = [Number(data.x[i]), Number(data.y[i])]
    return out
  }
  return []
}

/**
 * Split points into drawable runs. A gap starts at every non-finite x or y
 * (NaN from sqrt(-1), ±Infinity from 1/0) so the line is never joined across it.
 */
export function segments(points) {
  const runs = []
  let run = []
  for (const p of points) {
    if (Number.isFinite(p[0]) && Number.isFinite(p[1])) run.push(p)
    else if (run.length) {
      runs.push(run)
      run = []
    }
  }
  if (run.length) runs.push(run)
  return runs
}

/** [min, max] of finite values (or null). */
export function extent(values) {
  let lo = Infinity
  let hi = -Infinity
  for (const v of values) {
    if (!Number.isFinite(v)) continue
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return lo === Infinity ? null : [lo, hi]
}

function quantile(sorted, q) {
  if (!sorted.length) return NaN
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base]
}

/**
 * Robust automatic domain for y values: uses the full extent unless a few extreme
 * values (near an asymptote) would squash the rest of the curve, in which case the
 * 2nd–98th percentile is used. Adds a little padding; never returns an empty span.
 */
export function robustDomain(values, { pad = 0.08, includeZero = false } = {}) {
  const finite = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (!finite.length) return [-1, 1]
  let lo = finite[0]
  let hi = finite[finite.length - 1]
  const p2 = quantile(finite, 0.02)
  const p98 = quantile(finite, 0.98)
  if (p98 > p2 && hi - lo > 6 * (p98 - p2)) {
    lo = p2
    hi = p98
  }
  if (includeZero) {
    lo = Math.min(lo, 0)
    hi = Math.max(hi, 0)
  }
  if (hi - lo < 1e-12) {
    const d = Math.abs(lo) > 1e-12 ? Math.abs(lo) * 0.5 : 1
    return [lo - d, hi + d]
  }
  const d = (hi - lo) * pad
  return [lo - d, hi + d]
}

/** Index of the point whose x is nearest to `x` (points sorted by x ascending). */
export function nearestIndex(points, x) {
  if (!points.length) return -1
  let lo = 0
  let hi = points.length - 1
  if (!(points[hi][0] >= points[lo][0])) {
    // not sorted (e.g. a trajectory going backwards): linear scan
    let best = 0
    let bestD = Infinity
    points.forEach((p, i) => {
      const d = Math.abs(p[0] - x)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    return best
  }
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (points[mid][0] < x) lo = mid
    else hi = mid
  }
  return Math.abs(points[lo][0] - x) <= Math.abs(points[hi][0] - x) ? lo : hi
}

/** Pick about `count` evenly spaced indices of an array of length n (always first and last). */
export function sampleIndices(n, count = 20) {
  if (n <= 0) return []
  if (n <= count) return Array.from({ length: n }, (_, i) => i)
  const out = new Set()
  for (let i = 0; i < count; i += 1) out.add(Math.round((i * (n - 1)) / (count - 1)))
  return [...out]
}

/** Clamp a value into the drawable band around the domain (keeps SVG coordinates sane). */
export function clampTo(v, [lo, hi], factor = 8) {
  const span = hi - lo || 1
  return Math.max(lo - span * factor, Math.min(hi + span * factor, v))
}
