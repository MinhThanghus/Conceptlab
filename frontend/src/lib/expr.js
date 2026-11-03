/**
 * Safe math expression parser/evaluator — mirror of backend/app/services/expr.py.
 *
 * Grammar: expr := term (('+'|'-') term)* ; term := unary (('*'|'/'|implicit) unary)* ;
 * unary := ('-'|'+') unary | power ; power := primary ('^' unary)? ;
 * primary := NUMBER | IDENT | FUNC '(' args ')' | '(' expr ')'.
 *
 * Implicit multiplication (2x, 2(x+1), 2pi), constants pi/π/e/deg (shadowed by variables),
 * '.' decimal separator, JavaScript IEEE semantics (1/0 = Infinity, sqrt(-1) = NaN).
 * Shared test vectors: shared/expr_cases.json.
 */

export const MAX_LENGTH = 400

export class ExprError extends Error {
  constructor(code, message, position = null) {
    super(message)
    this.name = 'ExprError'
    this.code = code
    this.position = position
  }
}

const log10 = (x) => Math.log(x) / Math.LN10

export const FUNCTIONS = {
  sin: [Math.sin, 1, 1],
  cos: [Math.cos, 1, 1],
  tan: [Math.tan, 1, 1],
  asin: [Math.asin, 1, 1],
  acos: [Math.acos, 1, 1],
  atan: [Math.atan, 1, 1],
  atan2: [Math.atan2, 2, 2],
  sinh: [Math.sinh, 1, 1],
  cosh: [Math.cosh, 1, 1],
  tanh: [Math.tanh, 1, 1],
  sqrt: [Math.sqrt, 1, 1],
  cbrt: [Math.cbrt, 1, 1],
  exp: [Math.exp, 1, 1],
  ln: [Math.log, 1, 1],
  log: [(x, b) => (b === undefined ? log10(x) : Math.log(x) / Math.log(b)), 1, 2],
  log10: [log10, 1, 1],
  log2: [(x) => Math.log(x) / Math.LN2, 1, 1],
  abs: [Math.abs, 1, 1],
  floor: [Math.floor, 1, 1],
  ceil: [Math.ceil, 1, 1],
  round: [Math.round, 1, 1],
  sign: [Math.sign, 1, 1],
  min: [Math.min, 1, 16],
  max: [Math.max, 1, 16],
  pow: [Math.pow, 2, 2],
  hypot: [Math.hypot, 1, 16],
}

export const CONSTANTS = { pi: Math.PI, 'π': Math.PI, e: Math.E, deg: Math.PI / 180 }

const OPS = { '+': '+', '-': '-', '−': '-', '*': '*', '×': '*', '·': '*', '/': '/', '÷': '/', '^': '^' }

const isDigit = (ch) => ch >= '0' && ch <= '9'
const isIdentStart = (ch) => /[\p{L}_]/u.test(ch)
const isIdentChar = (ch) => /[\p{L}\p{N}_]/u.test(ch)

/** Accept common textbook notation: x² → x^2, x³ → x^3, √(…) → sqrt(…). */
export function normalize(src) {
  return src.replaceAll('²', '^2').replaceAll('³', '^3').replaceAll('√', ' sqrt')
}

export function tokenize(src) {
  if (src.length > MAX_LENGTH) throw new ExprError('too_long', 'Expression is too long')
  const tokens = []
  const chars = Array.from(normalize(src))
  let i = 0
  const n = chars.length
  while (i < n) {
    const ch = chars[i]
    if (/\s/.test(ch)) {
      i += 1
      continue
    }
    if (isDigit(ch) || (ch === '.' && i + 1 < n && isDigit(chars[i + 1]))) {
      const start = i
      while (i < n && (isDigit(chars[i]) || chars[i] === '.')) i += 1
      if (
        i < n &&
        (chars[i] === 'e' || chars[i] === 'E') &&
        i + 1 < n &&
        (isDigit(chars[i + 1]) || ((chars[i + 1] === '+' || chars[i + 1] === '-') && i + 2 < n && isDigit(chars[i + 2])))
      ) {
        i += 2
        while (i < n && isDigit(chars[i])) i += 1
      }
      const text = chars.slice(start, i).join('')
      if ((text.match(/\./g) || []).length > 1) throw new ExprError('bad_number', `Invalid number '${text}'`, start)
      tokens.push({ kind: 'num', value: text, pos: start })
      continue
    }
    if (ch === 'π') {
      // always a standalone constant: 2πr = 2*π*r
      tokens.push({ kind: 'id', value: 'π', pos: i })
      i += 1
      continue
    }
    if (isIdentStart(ch)) {
      const start = i
      while (i < n && isIdentChar(chars[i]) && chars[i] !== 'π') i += 1
      tokens.push({ kind: 'id', value: chars.slice(start, i).join(''), pos: start })
      continue
    }
    if (OPS[ch]) tokens.push({ kind: 'op', value: OPS[ch], pos: i })
    else if (ch === '(') tokens.push({ kind: 'lp', value: ch, pos: i })
    else if (ch === ')') tokens.push({ kind: 'rp', value: ch, pos: i })
    else if (ch === ',') tokens.push({ kind: 'comma', value: ch, pos: i })
    else throw new ExprError('unexpected_char', `Unexpected character '${ch}'`, i)
    i += 1
  }
  tokens.push({ kind: 'end', value: '', pos: n })
  return tokens
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens
    this.i = 0
  }
  peek() {
    return this.tokens[this.i]
  }
  take() {
    return this.tokens[this.i++]
  }
  expect(kind) {
    const tok = this.take()
    if (tok.kind !== kind) throw new ExprError('unexpected_token', `Expected ${kind} at position ${tok.pos}`, tok.pos)
    return tok
  }
  parse() {
    if (this.peek().kind === 'end') throw new ExprError('empty', 'Expression is empty', 0)
    const node = this.expr()
    const tok = this.peek()
    if (tok.kind !== 'end') throw new ExprError('unexpected_token', `Unexpected '${tok.value}' at position ${tok.pos}`, tok.pos)
    return node
  }
  expr() {
    let node = this.term()
    while (this.peek().kind === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.take().value
      node = ['bin', op, node, this.term()]
    }
    return node
  }
  term() {
    let node = this.unary()
    for (;;) {
      const tok = this.peek()
      if (tok.kind === 'op' && (tok.value === '*' || tok.value === '/')) {
        this.take()
        node = ['bin', tok.value, node, this.unary()]
      } else if (tok.kind === 'num' || tok.kind === 'id' || tok.kind === 'lp') {
        node = ['bin', '*', node, this.power()]
      } else {
        return node
      }
    }
  }
  unary() {
    const tok = this.peek()
    if (tok.kind === 'op' && (tok.value === '+' || tok.value === '-')) {
      this.take()
      const operand = this.unary()
      return tok.value === '-' ? ['neg', operand] : operand
    }
    return this.power()
  }
  power() {
    const base = this.primary()
    if (this.peek().kind === 'op' && this.peek().value === '^') {
      this.take()
      return ['bin', '^', base, this.unary()]
    }
    return base
  }
  primary() {
    const tok = this.take()
    if (tok.kind === 'num') {
      const v = Number(tok.value)
      if (Number.isNaN(v)) throw new ExprError('bad_number', `Invalid number '${tok.value}'`, tok.pos)
      return ['num', v]
    }
    if (tok.kind === 'id') {
      const name = tok.value.toLowerCase()
      if (this.peek().kind === 'lp' && Object.hasOwn(FUNCTIONS, name)) {
        this.take()
        const args = []
        if (this.peek().kind !== 'rp') {
          args.push(this.expr())
          while (this.peek().kind === 'comma') {
            this.take()
            args.push(this.expr())
          }
        }
        this.expect('rp')
        const [, lo, hi] = FUNCTIONS[name]
        if (args.length < lo || args.length > hi) throw new ExprError('bad_arity', `Wrong number of arguments for ${name}`, tok.pos)
        return ['call', name, args]
      }
      return ['var', tok.value]
    }
    if (tok.kind === 'lp') {
      const node = this.expr()
      this.expect('rp')
      return node
    }
    throw new ExprError('unexpected_token', `Unexpected '${tok.value || 'end'}' at position ${tok.pos}`, tok.pos)
  }
}

function evalNode(node, env) {
  switch (node[0]) {
    case 'num':
      return node[1]
    case 'var': {
      const name = node[1]
      if (env && Object.hasOwn(env, name)) return Number(env[name])
      if (Object.hasOwn(CONSTANTS, name)) return CONSTANTS[name]
      throw new ExprError('unknown_variable', `Unknown variable '${name}'`)
    }
    case 'neg':
      return -evalNode(node[1], env)
    case 'bin': {
      const a = evalNode(node[2], env)
      const b = evalNode(node[3], env)
      switch (node[1]) {
        case '+':
          return a + b
        case '-':
          return a - b
        case '*':
          return a * b
        case '/':
          return a / b
        case '^':
          return Math.pow(a, b)
        default:
          throw new ExprError('bad_node', 'Invalid expression')
      }
    }
    case 'call': {
      const [fn] = FUNCTIONS[node[1]]
      return fn(...node[2].map((arg) => evalNode(arg, env)))
    }
    default:
      throw new ExprError('bad_node', 'Invalid expression')
  }
}

function collectVars(node, out) {
  if (node[0] === 'var') out.add(node[1])
  else if (node[0] === 'neg') collectVars(node[1], out)
  else if (node[0] === 'bin') {
    collectVars(node[2], out)
    collectVars(node[3], out)
  } else if (node[0] === 'call') node[2].forEach((arg) => collectVars(arg, out))
  return out
}

/** Compile once, evaluate many times: compile('a*x^2').evaluate({ a: 1, x: 2 }). */
export function compile(source) {
  const ast = new Parser(tokenize(String(source ?? ''))).parse()
  return {
    source,
    ast,
    evaluate: (vars = {}) => evalNode(ast, vars),
    variables: () => collectVars(ast, new Set()),
  }
}

export function evaluate(source, vars = {}) {
  return compile(source).evaluate(vars)
}

/** Returns { ok: true, compiled } or { ok: false, error: ExprError }. Never throws. */
export function tryCompile(source) {
  try {
    return { ok: true, compiled: compile(source) }
  } catch (error) {
    return { ok: false, error }
  }
}

/** Free identifiers that are neither known variables nor constants. */
export function unknownVariables(source, known) {
  const knownSet = new Set(known)
  return [...compile(source).variables()].filter((v) => !knownSet.has(v) && !Object.hasOwn(CONSTANTS, v))
}
