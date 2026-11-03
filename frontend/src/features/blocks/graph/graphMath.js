/**
 * Pure maths for the graph block (no DOM): sampling with honest gaps at
 * discontinuities, plain-language "key features" (intercept, roots, extrema,
 * quadratic vertex & discriminant) and a small expression → TeX converter.
 */
import { compile, CONSTANTS, tryCompile } from '../../../lib/expr.js'

export const SAMPLE_COUNT = 400

/** f(x) for a compiled expression with the given parameter values. Never throws (NaN instead). */
export function makeFn(compiled, xVar, params = {}) {
  const env = { ...params }
  return (x) => {
    env[xVar] = x
    try {
      const y = compiled.evaluate(env)
      return typeof y === 'number' ? y : NaN
    } catch {
      return NaN
    }
  }
}

function quantile(sorted, q) {
  if (!sorted.length) return NaN
  const pos = (sorted.length - 1) * q
  const i = Math.floor(pos)
  return sorted[i + 1] !== undefined ? sorted[i] + (pos - i) * (sorted[i + 1] - sorted[i]) : sorted[i]
}

function robustSpan(ys) {
  const finite = ys.filter(Number.isFinite).sort((a, b) => a - b)
  if (!finite.length) return 0
  const span = quantile(finite, 0.98) - quantile(finite, 0.02)
  return span > 0 ? span : finite[finite.length - 1] - finite[0]
}

/** True when the function jumps (pole/step) between two neighbouring samples. */
function isBreak(f, x0, y0, x1, y1, span) {
  const jump = Math.abs(y1 - y0)
  const scale = span > 0 ? span : Math.max(Math.abs(y0), Math.abs(y1), 1)
  if (jump <= 0.05 * scale) return false
  if (Math.sign(y0) !== Math.sign(y1) && y0 !== 0 && y1 !== 0 && jump > 2 * scale) return true
  const m = f((x0 + x1) / 2)
  if (!Number.isFinite(m)) return true
  const lo = Math.min(y0, y1)
  const hi = Math.max(y0, y1)
  return m < lo - jump || m > hi + jump
}

/**
 * Sample f on [a, b] (n intervals). Returns [[x, y]…] with a [x, NaN] point inserted
 * wherever the curve is undefined or jumps, so a plot never joins across a pole.
 */
export function sampleFunction(f, a, b, n = SAMPLE_COUNT) {
  const xs = new Array(n + 1)
  const ys = new Array(n + 1)
  for (let i = 0; i <= n; i += 1) {
    xs[i] = a + ((b - a) * i) / n
    ys[i] = f(xs[i])
  }
  const span = robustSpan(ys)
  const points = []
  for (let i = 0; i <= n; i += 1) {
    if (i > 0 && Number.isFinite(ys[i - 1]) && Number.isFinite(ys[i]) && isBreak(f, xs[i - 1], ys[i - 1], xs[i], ys[i], span)) {
      points.push([(xs[i - 1] + xs[i]) / 2, NaN])
    }
    points.push([xs[i], ys[i]])
  }
  return points
}

function bisect(f, lo, hi, flo) {
  let a = lo
  let b = hi
  let fa = flo
  for (let i = 0; i < 60; i += 1) {
    const m = (a + b) / 2
    const fm = f(m)
    if (!Number.isFinite(fm)) return null
    if (fm === 0) return m
    if (Math.sign(fm) === Math.sign(fa)) {
      a = m
      fa = fm
    } else b = m
  }
  return (a + b) / 2
}

function goldenExtremum(f, a, b, kind) {
  const g = (Math.sqrt(5) - 1) / 2
  const sign = kind === 'max' ? -1 : 1
  const h = (x) => sign * f(x)
  let c = b - g * (b - a)
  let d = a + g * (b - a)
  for (let i = 0; i < 60; i += 1) {
    if (h(c) < h(d)) b = d
    else a = c
    c = b - g * (b - a)
    d = a + g * (b - a)
  }
  const x = (a + b) / 2
  return { x, y: f(x) }
}

const near = (a, b, scale) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(scale))

/**
 * Detect y = A·x² + B·x + C (A may be 0) by fitting at −1, 0, 1 and verifying elsewhere.
 * Returns { a, b, c } or null.
 */
export function polynomialFit(f, xMin, xMax) {
  const c = f(0)
  const f1 = f(1)
  const fm1 = f(-1)
  if (![c, f1, fm1].every(Number.isFinite)) return null
  const a = (f1 + fm1) / 2 - c
  const b = (f1 - fm1) / 2
  const probes = [2, -3, 0.5, 4.7, -7.3, xMin, xMax, (xMin + xMax) / 2]
  for (const x of probes) {
    const y = f(x)
    const p = a * x * x + b * x + c
    if (!Number.isFinite(y) || Math.abs(y - p) > 1e-7 * Math.max(1, Math.abs(y), Math.abs(p))) return null
  }
  const clean = (v) => (Math.abs(v) < 1e-12 ? 0 : v)
  return { a: clean(a), b: clean(b), c: clean(c) }
}

/**
 * Key features of y = f(x) on [xMin, xMax] for plain-language explanations.
 * {
 *   kind: 'quadratic'|'linear'|'constant'|'other',
 *   quadratic?: { a, b, c, vertex: {x, y}, discriminant, opens, rootCount },
 *   linear?: { slope, intercept },
 *   yIntercept: { y, inRange } | null,
 *   roots: number[] (in range, ≤ 6), moreRoots: boolean,
 *   extrema: [{ x, y, kind: 'max'|'min' }] (in range, ≤ 4),
 *   yRange: [min, max] | null (finite samples in range)
 * }
 */
export function analyzeFunction(f, xMin, xMax, points = null) {
  const pts = points || sampleFunction(f, xMin, xMax)
  const inRange = (x) => x >= Math.min(xMin, xMax) - 1e-12 && x <= Math.max(xMin, xMax) + 1e-12
  const result = { kind: 'other', yIntercept: null, roots: [], moreRoots: false, extrema: [], yRange: null }

  const y0 = f(0)
  if (Number.isFinite(y0)) result.yIntercept = { y: Math.abs(y0) < 1e-12 ? 0 : y0, inRange: inRange(0) }

  const finiteYs = pts.map((p) => p[1]).filter(Number.isFinite)
  if (finiteYs.length) result.yRange = [Math.min(...finiteYs), Math.max(...finiteYs)]

  const poly = polynomialFit(f, xMin, xMax)
  if (poly) {
    const { a, b, c } = poly
    if (a !== 0) {
      const disc = b * b - 4 * a * c
      const vx = -b / (2 * a)
      const vertex = { x: Math.abs(vx) < 1e-12 ? 0 : vx, y: c - (b * b) / (4 * a) }
      const scale = Math.max(Math.abs(b * b), Math.abs(4 * a * c), 1e-300)
      const discClean = Math.abs(disc) <= 1e-12 * scale ? 0 : disc
      const rootCount = discClean > 0 ? 2 : discClean === 0 ? 1 : 0
      result.kind = 'quadratic'
      result.quadratic = { a, b, c, vertex, discriminant: discClean, opens: a > 0 ? 'up' : 'down', rootCount }
      let roots = []
      if (discClean === 0) roots = [vertex.x]
      else if (discClean > 0) {
        const sq = Math.sqrt(discClean)
        // numerically stable pair
        const q = -0.5 * (b + Math.sign(b || 1) * sq)
        roots = [q / a, c / q].filter(Number.isFinite).sort((p, r) => p - r)
        if (roots.length < 2) roots = [(-b - sq) / (2 * a), (-b + sq) / (2 * a)].sort((p, r) => p - r)
      }
      result.roots = roots.filter(inRange).map((r) => (Math.abs(r) < 1e-12 ? 0 : r))
      if (inRange(vertex.x)) result.extrema = [{ x: vertex.x, y: vertex.y, kind: a > 0 ? 'min' : 'max' }]
      return result
    }
    if (b !== 0) {
      result.kind = 'linear'
      result.linear = { slope: b, intercept: c }
      const root = -c / b
      result.roots = inRange(root) ? [Math.abs(root) < 1e-12 ? 0 : root] : []
      return result
    }
    result.kind = 'constant'
    result.linear = { slope: 0, intercept: c }
    if (c === 0) result.roots = []
    return result
  }

  // general functions: numeric roots by sign change, extrema by slope change
  const span = robustSpan(pts.map((p) => p[1]))
  const roots = []
  const pushRoot = (r) => {
    if (r === null || !inRange(r)) return
    if (roots.some((q) => near(q, r, Math.abs(xMax - xMin) * 1e3))) return
    roots.push(Math.abs(r) < 1e-12 ? 0 : r)
  }
  for (let i = 0; i < pts.length; i += 1) {
    const [x, y] = pts[i]
    if (y === 0) pushRoot(x)
    if (i === 0) continue
    const [xp, yp] = pts[i - 1]
    if (!Number.isFinite(y) || !Number.isFinite(yp) || y === 0 || yp === 0) continue
    if (Math.sign(y) !== Math.sign(yp)) {
      const r = bisect(f, xp, x, yp)
      if (r !== null && Math.abs(f(r)) <= 1e-6 * Math.max(1, span)) pushRoot(r)
    }
  }
  roots.sort((p, q) => p - q)
  result.moreRoots = roots.length > 6
  result.roots = roots.slice(0, 6)

  const extrema = []
  for (let i = 1; i < pts.length - 1; i += 1) {
    const [, ya] = pts[i - 1]
    const [, yb] = pts[i]
    const [, yc] = pts[i + 1]
    if (![ya, yb, yc].every(Number.isFinite)) continue
    let kind = null
    if (yb > ya && yb >= yc) kind = 'max'
    else if (yb < ya && yb <= yc) kind = 'min'
    if (!kind) continue
    const ex = goldenExtremum(f, pts[i - 1][0], pts[i + 1][0], kind)
    if (Number.isFinite(ex.y) && !extrema.some((e) => Math.abs(e.x - ex.x) < Math.abs(xMax - xMin) / 1000)) {
      extrema.push({ x: Math.abs(ex.x) < 1e-12 ? 0 : ex.x, y: ex.y, kind })
    }
  }
  result.extrema = extrema.slice(0, 4)
  // a sampled extremum touching zero is also a (double) root
  for (const e of result.extrema) if (Math.abs(e.y) <= 1e-9 * Math.max(1, span)) pushRoot(e.x)
  result.roots = result.roots.sort((p, q) => p - q).slice(0, 6)
  return result
}

/** Value of an "observe" key for active learning and the A/B difference table. */
export function featureValue(features, key) {
  if (!features) return null
  switch (key) {
    case 'y_intercept':
      return features.yIntercept ? features.yIntercept.y : null
    case 'x_vertex':
      return features.quadratic ? features.quadratic.vertex.x : features.extrema[0]?.x ?? null
    case 'y_vertex':
      return features.quadratic ? features.quadratic.vertex.y : features.extrema[0]?.y ?? null
    case 'discriminant':
      return features.quadratic ? features.quadratic.discriminant : null
    case 'root_count':
      return features.quadratic ? features.quadratic.rootCount : features.roots.length
    case 'slope':
      return features.linear ? features.linear.slope : null
    case 'y_max':
      return features.yRange ? features.yRange[1] : null
    case 'y_min':
      return features.yRange ? features.yRange[0] : null
    default:
      return null
  }
}

export const OBSERVE_KEYS = ['y_vertex', 'x_vertex', 'y_intercept', 'root_count', 'discriminant', 'slope', 'y_max', 'y_min']

/** Compact numeric summary sent to the AI tutor / explain-change endpoint. */
export function featureSummary(features) {
  if (!features) return {}
  const out = { kind: features.kind }
  if (features.yIntercept) out.y_intercept = round(features.yIntercept.y)
  if (features.quadratic) {
    const q = features.quadratic
    out.coefficients = { a: round(q.a), b: round(q.b), c: round(q.c) }
    out.vertex = { x: round(q.vertex.x), y: round(q.vertex.y) }
    out.discriminant = round(q.discriminant)
    out.opens = q.opens
    out.real_roots = q.rootCount
  }
  if (features.linear) out.slope = round(features.linear.slope)
  out.roots_in_view = features.roots.map((r) => round(r))
  if (features.extrema.length) out.extrema = features.extrema.map((e) => ({ kind: e.kind, x: round(e.x), y: round(e.y) }))
  return out
}

function round(v, digits = 6) {
  if (!Number.isFinite(v)) return v
  return Number(v.toPrecision(digits))
}

// ---------------------------------------------------------------------------- expression → TeX
const GREEK = {
  alpha: '\\alpha', beta: '\\beta', gamma: '\\gamma', delta: '\\delta', epsilon: '\\varepsilon', zeta: '\\zeta',
  eta: '\\eta', theta: '\\theta', kappa: '\\kappa', lambda: '\\lambda', mu: '\\mu', nu: '\\nu', xi: '\\xi',
  rho: '\\rho', sigma: '\\sigma', tau: '\\tau', phi: '\\varphi', chi: '\\chi', psi: '\\psi', omega: '\\omega',
  Delta: '\\Delta', Omega: '\\Omega', Phi: '\\Phi', Sigma: '\\Sigma', Lambda: '\\Lambda', Theta: '\\Theta', Gamma: '\\Gamma',
  'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta', 'ε': '\\varepsilon', 'θ': '\\theta', 'λ': '\\lambda',
  'μ': '\\mu', 'ρ': '\\rho', 'σ': '\\sigma', 'τ': '\\tau', 'φ': '\\varphi', 'ω': '\\omega', 'Δ': '\\Delta', 'Ω': '\\Omega',
}

const FN_TEX = {
  sin: '\\sin', cos: '\\cos', tan: '\\tan', asin: '\\arcsin', acos: '\\arccos', atan: '\\arctan',
  sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh', ln: '\\ln', log10: '\\log_{10}', log2: '\\log_{2}',
  min: '\\min', max: '\\max', sign: '\\operatorname{sign}', round: '\\operatorname{round}',
  hypot: '\\operatorname{hypot}', atan2: '\\operatorname{atan2}',
}

function escText(s) {
  return String(s).replace(/[\\{}$&#^_%~]/g, (ch) => `\\${ch === '\\' ? 'backslash ' : ch}`)
}

/** TeX for an identifier: θ → \theta, x0 → x_{0}, v_max → v_{\text{max}}, rate → \mathrm{rate}. */
export function identifierTex(name) {
  if (GREEK[name]) return { s: GREEK[name], word: false }
  const digits = /^(.+?)(\d+)$/u.exec(name)
  if (digits && !/\d/.test(digits[1])) {
    const base = identifierTex(digits[1])
    return { s: `${base.s}_{${digits[2]}}`, word: base.word }
  }
  const sub = /^([^_]+)_(.+)$/u.exec(name)
  if (sub) {
    const base = identifierTex(sub[1])
    const lower = GREEK[sub[2]] || (/^[A-Za-z0-9]$/.test(sub[2]) ? sub[2] : `\\text{${escText(sub[2])}}`)
    return { s: `${base.s}_{${lower}}`, word: base.word }
  }
  if (/^[A-Za-z]$/.test(name)) return { s: name, word: false }
  if (/^[A-Za-z]+$/.test(name)) return { s: `\\mathrm{${name}}`, word: true }
  return { s: `\\text{${escText(name)}}`, word: true }
}

function numTex(v, lang) {
  if (!Number.isFinite(v)) return '\\infty'
  let s = String(v)
  if (/e/i.test(s)) {
    const [m, e] = v.toExponential().split('e')
    const mant = Number(m) === 1 ? '' : `${lang === 'vi' ? m.replace('.', '{,}') : m} \\cdot `
    return `${mant}10^{${Number(e)}}`
  }
  if (lang === 'vi') s = s.replace('.', '{,}')
  return s
}

const P_ADD = 1
const P_MUL = 2
const P_POW = 3
const P_ATOM = 4

function wrap(node, minPrec) {
  return node.prec < minPrec ? { ...node, s: `\\left(${node.s}\\right)`, prec: P_ATOM, startsNum: false, isNeg: false } : node
}

function toTex(node, ctx) {
  switch (node[0]) {
    case 'num':
      return { s: numTex(node[1], ctx.lang), prec: P_ATOM, startsNum: true, isNum: true }
    case 'var': {
      const name = node[1]
      if (!ctx.params.has(name)) {
        if (name === 'pi' || name === 'π') return { s: '\\pi', prec: P_ATOM }
        if (name === 'e') return { s: 'e', prec: P_ATOM }
        if (name === 'deg') return { s: '^{\\circ}', prec: P_ATOM, degree: true }
      }
      const id = identifierTex(name)
      return { s: id.s, prec: P_ATOM, word: id.word }
    }
    case 'neg': {
      const inner = wrap(toTex(node[1], ctx), P_MUL)
      return { s: `-${inner.s}`, prec: P_MUL, isNeg: true }
    }
    case 'bin': {
      const op = node[1]
      const L = toTex(node[2], ctx)
      const R = toTex(node[3], ctx)
      if (op === '+') {
        const r = R.isNeg ? wrap({ ...R, prec: P_ADD - 1 }, P_ADD) : R
        return { s: `${L.s} + ${r.s}`, prec: P_ADD, startsNum: L.startsNum }
      }
      if (op === '-') {
        const r = R.isNeg || R.prec <= P_ADD ? wrap({ ...R, prec: Math.min(R.prec, P_ADD) }, P_MUL) : R
        return { s: `${L.s} - ${r.s}`, prec: P_ADD, startsNum: L.startsNum }
      }
      if (op === '*') {
        if (R.degree) return { s: `${wrap(L, P_POW).s}^{\\circ}`, prec: P_POW, startsNum: L.startsNum }
        const l = wrap(L, P_MUL)
        const r = R.isNeg ? wrap({ ...R, prec: 0 }, P_MUL) : wrap(R, P_MUL)
        const dot = r.startsNum || l.word || r.word || R.isNeg || (L.isNum && R.isNum)
        return { s: dot ? `${l.s} \\cdot ${r.s}` : `${l.s}${r.s}`, prec: P_MUL, startsNum: l.startsNum }
      }
      if (op === '/') return { s: `\\frac{${L.s}}{${R.s}}`, prec: P_ATOM, isFrac: true }
      if (op === '^') {
        const base = L.prec < P_ATOM || L.isNeg || L.isFrac ? `\\left(${L.s}\\right)` : L.s
        return { s: `${base}^{${R.s}}`, prec: P_POW, startsNum: L.startsNum && L.prec === P_ATOM }
      }
      throw new Error('bad op')
    }
    case 'call': {
      const name = node[1]
      const args = node[2].map((a) => toTex(a, ctx))
      const list = args.map((a) => a.s).join(', ')
      if (name === 'sqrt') return { s: `\\sqrt{${args[0].s}}`, prec: P_ATOM }
      if (name === 'cbrt') return { s: `\\sqrt[3]{${args[0].s}}`, prec: P_ATOM }
      if (name === 'abs') return { s: `\\left|${args[0].s}\\right|`, prec: P_ATOM }
      if (name === 'exp') return { s: `e^{${args[0].s}}`, prec: P_POW }
      if (name === 'floor') return { s: `\\left\\lfloor ${args[0].s} \\right\\rfloor`, prec: P_ATOM }
      if (name === 'ceil') return { s: `\\left\\lceil ${args[0].s} \\right\\rceil`, prec: P_ATOM }
      if (name === 'pow') {
        const base = args[0].prec < P_ATOM || args[0].isNeg || args[0].isFrac ? `\\left(${args[0].s}\\right)` : args[0].s
        return { s: `${base}^{${args[1].s}}`, prec: P_POW }
      }
      if (name === 'log') {
        if (args.length === 2) return { s: `\\log_{${args[1].s}}\\left(${args[0].s}\\right)`, prec: P_ATOM }
        return { s: `\\log\\left(${args[0].s}\\right)`, prec: P_ATOM }
      }
      const fn = FN_TEX[name] || `\\operatorname{${name}}`
      return { s: `${fn}\\left(${list}\\right)`, prec: P_ATOM }
    }
    default:
      throw new Error('bad node')
  }
}

/**
 * TeX for a safe expression, or null when it cannot be parsed. `params` are symbols
 * that shadow constants (a param named "e" is shown as a variable, not Euler's number).
 */
export function exprToTex(source, { lang = 'vi', params = [] } = {}) {
  const parsed = tryCompile(source)
  if (!parsed.ok) return null
  try {
    return toTex(parsed.compiled.ast, { lang, params: new Set(params) }).s
  } catch {
    return null
  }
}

/** TeX for the left-hand side ("y", "T"…) from an axis label when it is a short symbol. */
export function lhsTex(label) {
  const raw = String(label || '').trim()
  if (/^[\p{L}][\p{L}\p{N}_]{0,5}$/u.test(raw) && (raw.length <= 2 || GREEK[raw] || /\d$/.test(raw))) return identifierTex(raw).s
  return 'y'
}

/** Free identifiers of an expression that are neither the x variable, params nor constants. */
export function missingSymbols(source, xVar, params) {
  const parsed = tryCompile(source)
  if (!parsed.ok) return []
  const known = new Set([xVar, ...params])
  return [...parsed.compiled.variables()].filter((v) => !known.has(v) && !Object.hasOwn(CONSTANTS, v))
}

export { compile }
