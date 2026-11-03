import { describe, expect, it } from 'vitest'
import { compile } from '../../../lib/expr.js'
import { analyzeFunction, exprToTex, featureSummary, featureValue, identifierTex, lhsTex, makeFn, missingSymbols, polynomialFit, sampleFunction } from './graphMath.js'

const fnOf = (src, params = {}, xVar = 'x') => makeFn(compile(src), xVar, params)

describe('sampleFunction', () => {
  it('samples n+1 points across the range', () => {
    const pts = sampleFunction(fnOf('x^2'), -2, 2, 4)
    expect(pts).toEqual([
      [-2, 4],
      [-1, 1],
      [0, 0],
      [1, 1],
      [2, 4],
    ])
  })
  it('keeps NaN where the function is undefined (sqrt of negatives)', () => {
    const pts = sampleFunction(fnOf('sqrt(x)'), -1, 1, 4)
    expect(Number.isNaN(pts[0][1])).toBe(true)
    expect(pts[4][1]).toBe(1)
  })
  it('inserts a gap at a pole instead of joining the branches (tan, 1/x)', () => {
    for (const src of ['tan(x)', '1/(x - 0.013)']) {
      const pts = sampleFunction(fnOf(src), -3, 3, 400)
      const gaps = pts.filter((p) => Number.isNaN(p[1]))
      expect(gaps.length, src).toBeGreaterThanOrEqual(1)
    }
  })
  it('does not break steep but continuous curves', () => {
    for (const src of ['1000*x', 'tanh(50*x)', 'x^3']) {
      const pts = sampleFunction(fnOf(src), -10, 10, 400)
      expect(pts.filter((p) => Number.isNaN(p[1])).length, src).toBe(0)
    }
  })
})

describe('analyzeFunction', () => {
  it('quadratic y = x² − 3x + 2: vertex, discriminant, two roots, intercept', () => {
    const f = fnOf('a*x^2 + b*x + c', { a: 1, b: -3, c: 2 })
    const r = analyzeFunction(f, -10, 10)
    expect(r.kind).toBe('quadratic')
    expect(r.quadratic.vertex.x).toBeCloseTo(1.5, 12)
    expect(r.quadratic.vertex.y).toBeCloseTo(-0.25, 12)
    expect(r.quadratic.discriminant).toBeCloseTo(1, 12)
    expect(r.quadratic.rootCount).toBe(2)
    expect(r.quadratic.opens).toBe('up')
    expect(r.roots.map((x) => Number(x.toFixed(9)))).toEqual([1, 2])
    expect(r.yIntercept).toEqual({ y: 2, inRange: true })
    expect(r.extrema).toEqual([{ x: 1.5, y: -0.25, kind: 'min' }])
  })
  it('vertex form a(x − h)² + k is recognised as a quadratic', () => {
    const r = analyzeFunction(fnOf('a*(x-h)^2 + k', { a: -2, h: 1, k: 8 }), -10, 10)
    expect(r.kind).toBe('quadratic')
    expect(r.quadratic.opens).toBe('down')
    expect(r.quadratic.vertex.x).toBeCloseTo(1, 12)
    expect(r.quadratic.vertex.y).toBeCloseTo(8, 12)
    expect(r.quadratic.a).toBeCloseTo(-2, 12)
    expect(r.roots[0]).toBeCloseTo(-1, 9)
    expect(r.roots[1]).toBeCloseTo(3, 9)
  })
  it('double root and no real roots', () => {
    expect(analyzeFunction(fnOf('x^2 - 4x + 4'), -10, 10).quadratic).toMatchObject({ discriminant: 0, rootCount: 1 })
    expect(analyzeFunction(fnOf('x^2 - 4x + 4'), -10, 10).roots).toEqual([2])
    const none = analyzeFunction(fnOf('x^2 + 1'), -10, 10)
    expect(none.quadratic.rootCount).toBe(0)
    expect(none.roots).toEqual([])
  })
  it('roots outside the visible range are not listed', () => {
    expect(analyzeFunction(fnOf('x^2 - 400'), -10, 10).roots).toEqual([])
  })
  it('linear and constant functions', () => {
    const lin = analyzeFunction(fnOf('2x + 3'), -10, 10)
    expect(lin.kind).toBe('linear')
    expect(lin.linear).toEqual({ slope: 2, intercept: 3 })
    expect(lin.roots[0]).toBeCloseTo(-1.5, 12)
    expect(analyzeFunction(fnOf('5'), -10, 10).kind).toBe('constant')
  })
  it('general functions: sine roots and extrema in range', () => {
    const r = analyzeFunction(fnOf('sin(x)'), -1, 7)
    expect(r.kind).toBe('other')
    expect(r.roots.map((x) => Number(x.toFixed(6)))).toEqual([0, 3.141593, 6.283185])
    const max = r.extrema.find((e) => e.kind === 'max')
    const min = r.extrema.find((e) => e.kind === 'min')
    expect(max.x).toBeCloseTo(Math.PI / 2, 5)
    expect(min.x).toBeCloseTo((3 * Math.PI) / 2, 5)
  })
  it('a pole is not reported as a root', () => {
    const r = analyzeFunction(fnOf('1/x'), -5, 5)
    expect(r.roots).toEqual([])
    expect(r.yIntercept).toBeNull()
  })
  it('feature values and summary', () => {
    const r = analyzeFunction(fnOf('x^2 - 3x + 2'), -10, 10)
    expect(featureValue(r, 'y_vertex')).toBeCloseTo(-0.25, 12)
    expect(featureValue(r, 'x_vertex')).toBeCloseTo(1.5, 12)
    expect(featureValue(r, 'root_count')).toBe(2)
    expect(featureValue(r, 'y_intercept')).toBe(2)
    expect(featureValue(r, 'nope')).toBeNull()
    expect(featureSummary(r)).toMatchObject({ kind: 'quadratic', vertex: { x: 1.5, y: -0.25 }, real_roots: 2 })
  })
  it('polynomialFit rejects non-polynomials', () => {
    expect(polynomialFit(fnOf('x^3'), -10, 10)).toBeNull()
    expect(polynomialFit(fnOf('exp(x)'), -10, 10)).toBeNull()
  })
})

describe('exprToTex', () => {
  it('renders textbook formulas', () => {
    expect(exprToTex('a*x^2 + b*x + c')).toBe('ax^{2} + bx + c')
    expect(exprToTex('2*pi*sqrt(L/g)')).toBe('2\\pi\\sqrt{\\frac{L}{g}}')
    expect(exprToTex('2π√(L/g)')).toBe('2\\pi\\sqrt{\\frac{L}{g}}')
    expect(exprToTex('P*(1+r/n)^(n*t)')).toBe('P\\left(1 + \\frac{r}{n}\\right)^{nt}')
    expect(exprToTex('x - (y + 1)')).toBe('x - \\left(y + 1\\right)')
    expect(exprToTex('-x^2')).toBe('-x^{2}')
    expect(exprToTex('(-x)^2')).toBe('\\left(-x\\right)^{2}')
    expect(exprToTex('x*2')).toBe('x \\cdot 2')
    expect(exprToTex('(a/b)^2')).toBe('\\left(\\frac{a}{b}\\right)^{2}')
    expect(exprToTex('sin(theta0)*v0')).toBe('\\sin\\left(\\theta_{0}\\right)v_{0}')
    expect(exprToTex('abs(x) + exp(-x)')).toBe('\\left|x\\right| + e^{-x}')
    expect(exprToTex('30deg')).toBe('30^{\\circ}')
  })
  it('uses a decimal comma in Vietnamese', () => {
    expect(exprToTex('0.5*x', { lang: 'vi' })).toBe('0{,}5x')
    expect(exprToTex('0.5*x', { lang: 'en' })).toBe('0.5x')
  })
  it('multi-letter names are upright and separated by a dot', () => {
    expect(exprToTex('rate*t')).toBe('\\mathrm{rate} \\cdot t')
    expect(identifierTex('v_max').s).toBe('v_{\\text{max}}')
  })
  it('returns null for invalid expressions', () => {
    expect(exprToTex('2*(x')).toBeNull()
    expect(exprToTex('')).toBeNull()
  })
  it('params shadow constants', () => {
    expect(exprToTex('e*x', { params: ['e'] })).toBe('ex')
    expect(exprToTex('2*e')).toBe('2e')
  })
  it('lhs from short labels only', () => {
    expect(lhsTex('T')).toBe('T')
    expect(lhsTex('y')).toBe('y')
    expect(lhsTex('Quãng đường (m)')).toBe('y')
    expect(lhsTex('θ')).toBe('\\theta')
  })
})

describe('missingSymbols', () => {
  it('lists unknown identifiers so the editor can offer to add them', () => {
    expect(missingSymbols('a*x^2 + k*x + pi', 'x', ['a'])).toEqual(['k'])
    expect(missingSymbols('2*(x', 'x', [])).toEqual([])
  })
})
