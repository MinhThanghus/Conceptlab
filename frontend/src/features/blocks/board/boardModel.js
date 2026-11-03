/**
 * Pure helpers of the board block: a photo of handwriting, its reviewed transcription and a clean
 * redrawn sheet. No React here, so everything is unit-tested (boardModel.test.js).
 *
 * What a sheet shows mirrors backend/app/services/board.py (item_text, is_visible, title_line,
 * visible_lines, arrow_conditions, latex_plain): the title is written once, crossed-out lines are
 * never shown, drawings are redrawn rather than written, and the words over or under a reaction
 * arrow belong to their equation.
 */
import { cut, LIMITS, normBox } from '../steps/lessonKit.js'

export const BOARD_KINDS = ['heading', 'text', 'bullet', 'formula', 'equation', 'diagram', 'note']
export const BOARD_SURFACES = ['whiteboard', 'blackboard', 'paper', 'notebook', 'screen', 'other']
export const BOARD_VIEWS = ['visual', 'text', 'photo']
/** Mirrors the schema (items ≤ 80, labels/uncertain ≤ 20) and the redraw limit (services/board.py). */
export const BOARD_LIMITS = { items: 80, labels: 20, uncertain: 20, drawChars: 1500 }

export const isMathKind = (kind) => kind === 'formula' || kind === 'equation'

/** One line, single spaces (Python's " ".join(text.split())). */
export function oneLine(text) {
  return String(text ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
}

const EDGES = /^[\s:.;,\-–—]+|[\s:.;,\-–—]+$/g
/** Comparison key: NFC, lower case, single spaces, no surrounding punctuation (board._norm). */
export function normText(text) {
  return oneLine(String(text ?? '').normalize('NFC').toLowerCase()).replace(EDGES, '')
}

// ----------------------------------------------------------------------------- LaTeX to one line
const ARROW = /\\x(?:[lL]eft|[rR]ight|hook|mapsto|long|twohead|tofrom)[A-Za-z]*/g
const WRAPPERS = /\\(?:text|textrm|textit|textbf|mathrm|mathit|mathbf|operatorname|mbox)\s*\{([^{}]*)\}/g
const FRAC = /\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g
const SQRT = /\\sqrt\s*\{([^{}]*)\}/g
const SCRIPT = /([_^])\s*(?:\{([^{}]*)\}|([0-9A-Za-z+-]))/g
const SCRIPT_CHARS = '0123456789+-=()'
const SUB = '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎'
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾'
const SYMBOLS = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
  kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ',
  varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Pi: 'Π',
  Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω', cdot: '·', times: '×', div: '÷', pm: '±', le: '≤', leq: '≤',
  ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', infty: '∞', circ: '°', degree: '°', to: '→',
  rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', leftrightarrow: '↔', rightleftharpoons: '⇌', uparrow: '↑',
  downarrow: '↓', sqrt: '√', sum: 'Σ', int: '∫', partial: '∂', percent: '%',
}
const ALNUM = /^[\p{L}\p{N}]+$/u

/** The balanced `[…]` or `{…}` group starting at text[i] (spaces skipped): [content, next] or [null, i]. */
function group(text, i, opener) {
  let j = i
  while (j < text.length && text[j] === ' ') j += 1
  if (j >= text.length || text[j] !== opener) return [null, i]
  let depth = 0
  for (let k = j + 1; k < text.length; k += 1) {
    const ch = text[k]
    if (ch === '\\') {
      k += 1
      continue
    }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      if (opener === '{' && depth === 0) return [text.slice(j + 1, k), k + 1]
      depth -= 1
    } else if (ch === ']' && opener === '[' && depth === 0) return [text.slice(j + 1, k), k + 1]
  }
  return [null, i]
}

const wrap = (part) => (part.length <= 1 || ALNUM.test(part) ? part : `(${part})`)

function scripts(_match, mark, braced, single) {
  const body = String(braced ?? single ?? '').trim()
  if (mark === '^' && (body === 'o' || body === '°')) return '°'
  if (body && [...body].every((ch) => SCRIPT_CHARS.includes(ch))) {
    const set = mark === '_' ? SUB : SUP
    return [...body].map((ch) => set[SCRIPT_CHARS.indexOf(ch)]).join('')
  }
  return body.length <= 1 || ALNUM.test(body) ? `${mark}${body}` : `${mark}(${body})`
}

function arrowSymbol(name) {
  if (name.includes('harpoons')) return ' ⇌ '
  if (name.toLowerCase().includes('leftright')) return ' ↔ '
  return name.toLowerCase().startsWith('\\xleft') ? ' ← ' : ' → '
}

/** A readable one-line approximation of a KaTeX formula (arrows lose their conditions here). */
export function latexPlain(latex) {
  const source = String(latex ?? '')
  let text = ''
  let i = 0
  for (const match of source.matchAll(ARROW)) {
    if (match.index < i) continue
    text += source.slice(i, match.index)
    let [, j] = group(source, match.index + match[0].length, '[')
    ;[, j] = group(source, j, '{')
    text += arrowSymbol(match[0])
    i = j
  }
  text += source.slice(i)
  for (let n = 0; n < 4; n += 1) {
    text = text
      .replace(WRAPPERS, '$1')
      .replace(FRAC, (_m, a, b) => `${wrap(a.trim())}/${wrap(b.trim())}`)
      .replace(SQRT, (_m, a) => `√${wrap(a.trim())}`)
  }
  text = text
    .replace(/\\(?:left|right|big|Big|bigg|Bigg)\b/g, '')
    .replace(/\\[,;:! ]|\\q?quad\b/g, ' ')
    .replace(/\^\s*\{?\s*\\circ\s*\}?/g, '°')
    .replace(/\\([A-Za-z]+)/g, (_m, name) => (Object.hasOwn(SYMBOLS, name) ? SYMBOLS[name] : name))
    .replace(SCRIPT, scripts)
    .replace(/[{}\\]/g, '')
  return oneLine(text)
}

/** [over, under] words of every extensible arrow (\xrightarrow[under]{over}), as plain text. */
export function arrowConditions(latex) {
  const source = String(latex ?? '')
  const pairs = []
  const re = new RegExp(ARROW.source, 'g')
  let pos = 0
  for (;;) {
    re.lastIndex = pos
    const match = re.exec(source)
    if (!match) break
    const end = match.index + match[0].length
    const [under, afterUnder] = group(source, end, '[')
    const [over, afterOver] = group(source, afterUnder, '{')
    pairs.push([latexPlain(over || ''), latexPlain(under || '')])
    pos = Math.max(afterOver, end)
  }
  return pairs
}

// ----------------------------------------------------------------------------- what the sheet shows
/** The line a learner reads for an item; a formula without `text` falls back to its LaTeX. */
export function itemText(item) {
  let text = oneLine(item?.text)
  if (!text && isMathKind(item?.kind) && String(item?.latex ?? '').trim()) text = oneLine(`${item.lead ?? ''} ${latexPlain(item.latex)}`)
  return text
}

const cleanLabels = (labels) => (Array.isArray(labels) ? labels.map(oneLine).filter(Boolean) : [])

/** Shown to learners and redrawn: not crossed out and with something to show. */
export function isVisible(item) {
  if (!item || item.struck) return false
  if (item.kind === 'diagram') return Boolean(oneLine(item.text) || cleanLabels(item.labels).length)
  return Boolean(itemText(item))
}

const written = (items) => (items || []).filter((item) => item?.kind !== 'diagram' && isVisible(item))

/** The title to write, or '' when a visible line already says the same (it is written once). */
export function titleLine(title, items) {
  const head = oneLine(title)
  const key = normText(head)
  if (!key || written(items).some((item) => normText(itemText(item)) === key)) return ''
  return head
}

function conditions(item) {
  if (!isMathKind(item.kind)) return []
  const line = normText(itemText(item))
  const keep = (word) => (word && !line.includes(normText(word)) ? word : '')
  return arrowConditions(item.latex).map(([over, under]) => [keep(over), keep(under)])
}

/**
 * Exactly the text the clean sheet shows, in order: the title once, every visible line that is not
 * a drawing, and the words written over or under an equation's arrow. Crossed-out lines never.
 */
export function visibleLines(block) {
  const items = block?.items || []
  const lines = []
  const head = titleLine(block?.title, items)
  if (head) lines.push(head)
  for (const item of written(items)) {
    lines.push(itemText(item))
    for (const pair of conditions(item)) for (const word of pair) if (word && !lines.includes(word)) lines.push(word)
  }
  return lines
}

/** Characters the redraw would write (the server refuses more than BOARD_LIMITS.drawChars). */
export function drawChars(block) {
  return Array.from(visibleLines(block).join('\n')).length
}

/** What a picture of the board says, for its alt text: the visible lines, then each drawing. */
export function altLines(block) {
  const lines = visibleLines(block)
  for (const item of (block?.items || []).filter((it) => it?.kind === 'diagram' && isVisible(it))) {
    const labels = cleanLabels(item.labels)
    const line = [oneLine(item.text), labels.length ? `(${labels.join(', ')})` : ''].filter(Boolean).join(' ')
    if (line) lines.push(line)
  }
  return lines
}

/** Alt text built from the visible lines: sentences, capped so a screen reader stays usable. */
export function altText(block, max = 900) {
  const text = altLines(block)
    .map((line) => (/[.!?:;…]$/.test(line) ? line : `${line}.`))
    .join(' ')
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/**
 * The Text view, in order: the title (when no line repeats it), then parts. The first line that
 * repeats the title becomes the title in place (the redraw does the same); consecutive bullets
 * share one list. Crossed-out and empty lines are left out.
 */
export function sheetParts(block) {
  const items = block?.items || []
  const title = titleLine(block?.title, items)
  const key = normText(block?.title)
  let titled = Boolean(title)
  const parts = []
  for (const item of items) {
    if (!isVisible(item)) continue
    if (!titled && key && item.kind !== 'diagram' && normText(itemText(item)) === key) {
      parts.push({ kind: 'title', id: item.id, item })
      titled = true
      continue
    }
    const last = parts[parts.length - 1]
    if (item.kind === 'bullet' && last?.kind === 'bullets') last.items.push(item)
    else if (item.kind === 'bullet') parts.push({ kind: 'bullets', id: item.id, items: [item] })
    else parts.push({ kind: BOARD_KINDS.includes(item.kind) ? item.kind : 'text', id: item.id, item })
  }
  return { title, parts }
}

/**
 * KaTeX source for a formula on the sheet: display-size math set inline, so a long equation wraps
 * after its +, = or arrow on a narrow screen instead of running out of its panel.
 */
export function sheetTex(latex) {
  const tex = String(latex || '').trim()
  return tex ? `\\displaystyle ${tex}` : ''
}

/** A bullet's text without the dash or dot the writer drew (the sheet draws its own). */
export function bulletText(text) {
  return oneLine(text).replace(/^[-–—•·∙◦▪●○*+]\s+/, '')
}

// ----------------------------------------------------------------------------- unsure words
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function unsurePattern(words) {
  const list = [...new Set((words || []).map((w) => oneLine(w).normalize('NFC')).filter(Boolean))].sort((a, b) => b.length - a.length)
  if (!list.length) return null
  // whole words in any script: \b only knows ASCII, so letters and digits are checked with \p{…}
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'giu')
}

/** `text` split into [{ text, unsure }] with every word the model was unsure of marked. */
export function highlightUncertain(text, words) {
  const value = String(text ?? '').normalize('NFC')
  if (!value) return []
  const re = unsurePattern(words)
  if (!re) return [{ text: value, unsure: false }]
  const out = []
  let last = 0
  for (const match of value.matchAll(re)) {
    if (match.index > last) out.push({ text: value.slice(last, match.index), unsure: false })
    out.push({ text: match[0], unsure: true })
    last = match.index + match[0].length
  }
  if (last < value.length) out.push({ text: value.slice(last), unsure: false })
  return out
}

/** The unsure words still written in `text` (a word the teacher retyped is no longer unsure). */
export function unsureStillIn(text, words) {
  const value = String(text ?? '').normalize('NFC')
  return (words || []).filter((word) => {
    const re = unsurePattern([word])
    return Boolean(re && re.test(value))
  })
}

/** Unsure words of the lines learners will see (the same count as the publish check). */
export function uncertainCount(items) {
  return (items || []).filter(isVisible).reduce((sum, item) => sum + (item.uncertain || []).filter((w) => oneLine(w)).length, 0)
}

// ----------------------------------------------------------------------------- the diagram crop
/** The bbox with a little margin (boxes from the model are approximate), inside the photo. */
export function cropBox(bbox, pad = 0.015) {
  const box = normBox(bbox)
  if (!box || box[2] - box[0] <= 0 || box[3] - box[1] <= 0) return null
  return normBox([box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad])
}

const round = (value, digits = 3) => {
  const f = 10 ** digits
  return Math.round(value * f) / f
}

/**
 * CSS that shows the `bbox` region of a photo as a background, edge to edge: the box takes the
 * region's shape (aspect-ratio and --bd-crop-ratio), the photo is scaled so the region fills it.
 * `natural` is the photo's pixel size (a 4:3 photo is assumed until it is known).
 */
export function cropStyle(bbox, natural, { pad = 0.015 } = {}) {
  const box = cropBox(bbox, pad)
  if (!box) return null
  const w = box[2] - box[0]
  const h = box[3] - box[1]
  const ratio = natural?.width > 0 && natural?.height > 0 ? natural.width / natural.height : 4 / 3
  // background-position p% puts the photo's p% point on the box's p% point: p = start / (1 - size)
  const pos = (start, size) => (size >= 1 ? 0 : (start / (1 - size)) * 100)
  return {
    aspectRatio: `${round(w * ratio, 4)} / ${round(h, 4)}`,
    '--bd-crop-ratio': round((w * ratio) / h, 4),
    backgroundSize: `${round(100 / w)}% ${round(100 / h)}%`,
    backgroundPosition: `${round(pos(box[0], w))}% ${round(pos(box[1], h))}%`,
  }
}

// ----------------------------------------------------------------------------- learner views
/** Views a learner can switch between, in the header's order. */
export function boardViews({ visual = false, text = false, photo = false } = {}) {
  const has = { visual, text, photo }
  return BOARD_VIEWS.filter((view) => has[view])
}

/**
 * The view a learner sees first: the teacher's choice (`show`), except in a translated lesson,
 * where the redrawn picture still carries the original language and the Text view is translated.
 */
export function defaultView(block, { translated = false, views = BOARD_VIEWS } = {}) {
  const first = translated || block?.show === 'text' ? 'text' : 'visual'
  return [first, 'text', 'visual', 'photo'].find((view) => views.includes(view)) || null
}

// ----------------------------------------------------------------------------- proofreading
export function proofIssues(proof) {
  return {
    differences: (proof?.differences || []).filter((d) => d && (oneLine(d.expected) || oneLine(d.found))),
    missing: (proof?.missing || []).map(oneLine).filter(Boolean),
    extra: (proof?.extra || []).map(oneLine).filter(Boolean),
  }
}

export function proofCount(proof) {
  const issues = proofIssues(proof)
  return issues.differences.length + issues.missing.length + issues.extra.length
}

/** 'ok' (checked, nothing differs), 'issues' (checked, something differs) or 'unchecked'. */
export function proofState(proof) {
  if (!proof?.checked) return 'unchecked'
  return proof.ok ? 'ok' : 'issues'
}

// ----------------------------------------------------------------------------- the drawn version
/** FNV-1a: a short stable key for a string. */
export function hashText(text) {
  let h = 0x811c9dc5
  const value = String(text ?? '')
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/**
 * Key of what a redraw depends on: the photo, the title and every visible line as written.
 * Clearing an unsure flag or moving a box does not change it; editing a word, the order, a
 * formula, a label or crossing a line out does.
 */
export function drawKey(block) {
  const items = (block?.items || [])
    .filter(isVisible)
    .map((item) => [item.kind, oneLine(item.text), oneLine(item.lead), oneLine(item.latex), cleanLabels(item.labels)])
  return hashText(JSON.stringify([oneLine(block?.title), block?.image?.source_id || null, block?.image?.page ?? null, items]))
}

// ----------------------------------------------------------------------------- items
/** "b<n>" after the highest one in use. */
export function nextItemId(items) {
  const taken = new Set((items || []).map((item) => item?.id))
  let n = 1
  for (const item of items || []) {
    const match = /^b(\d+)$/.exec(String(item?.id || ''))
    if (match) n = Math.max(n, Number(match[1]) + 1)
  }
  while (taken.has(`b${n}`)) n += 1
  return `b${n}`
}

export function blankItem(items, kind = 'text') {
  return { id: nextItemId(items), kind, text: '', lead: '', latex: '', labels: [], bbox: null, uncertain: [], struck: false }
}

/** A BoardItem the server accepts: known kind, schema limits, a valid or no box. */
export function normalizeItem(raw, fallbackId = 'b1') {
  const list = (value, max) => (Array.isArray(value) ? value : []).map((v) => cut(oneLine(v), LIMITS.short)).filter(Boolean).slice(0, max)
  return {
    id: cut(oneLine(raw?.id) || fallbackId, LIMITS.short),
    kind: BOARD_KINDS.includes(raw?.kind) ? raw.kind : 'text',
    text: cut(String(raw?.text ?? ''), LIMITS.medium),
    lead: cut(String(raw?.lead ?? ''), LIMITS.short),
    latex: cut(String(raw?.latex ?? ''), LIMITS.medium),
    labels: list(raw?.labels, BOARD_LIMITS.labels),
    bbox: normBox(raw?.bbox),
    uncertain: list(raw?.uncertain, BOARD_LIMITS.uncertain),
    struck: Boolean(raw?.struck),
  }
}

/** Items with unique ids (the server numbers them b1, b2, …; a repeated id gets a fresh one). */
export function normalizeItems(rawItems) {
  const out = []
  for (const [i, raw] of (Array.isArray(rawItems) ? rawItems : []).slice(0, BOARD_LIMITS.items).entries()) {
    const item = normalizeItem(raw, `b${i + 1}`)
    if (out.some((x) => x.id === item.id)) item.id = nextItemId(out)
    out.push(item)
  }
  return out
}

export function samePhoto(a, b) {
  return (a?.source_id || null) === (b?.source_id || null) && (a?.page ?? null) === (b?.page ?? null)
}

/** A new photo starts a new board: the old reading and the old clean copy belong to the old photo. */
export function photoPatch(image) {
  return {
    image: { source_id: image?.source_id || null, page: image?.page ?? null, asset_id: null },
    items: [],
    unreadable: '',
    visual: null,
    visual_proof: null,
  }
}

/**
 * The block after a reading (POST …/ai/board-read). The block's title becomes the read title
 * unless the teacher already gave it one of their own (anything but a default in `defaultTitles`).
 */
export function applyRead(block, res, { defaultTitles = [] } = {}) {
  const current = oneLine(block?.title)
  const generic = !current || defaultTitles.some((title) => normText(title) === normText(current))
  const readTitle = cut(oneLine(res?.title), LIMITS.short)
  const image = res?.image?.source_id ? { source_id: res.image.source_id, page: res.image.page ?? null, asset_id: null } : block?.image
  return {
    ...block,
    image,
    surface: BOARD_SURFACES.includes(res?.surface) ? res.surface : block?.surface || 'other',
    items: normalizeItems(res?.items),
    unreadable: cut(String(res?.unreadable ?? '').trim(), LIMITS.medium),
    title: generic && readTitle ? readTitle : block?.title || '',
    ai_generated: true,
    confirmed: false,
  }
}

/** The request body of POST …/ai/board-visual for a block. */
export function visualRequest(block) {
  return {
    source_id: block?.image?.source_id || null,
    page: block?.image?.page ?? null,
    title: cut(oneLine(block?.title), LIMITS.short),
    surface: BOARD_SURFACES.includes(block?.surface) ? block.surface : 'other',
    items: normalizeItems(block?.items),
  }
}
