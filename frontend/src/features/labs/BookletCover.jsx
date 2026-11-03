import { useT } from '../../i18n/index.jsx'
import { seeded } from '../../lib/random.js'
import { ALL_SUBJECTS, subjectIcon } from './labOptions.js'

/**
 * The cover of a lab without a picture, set like a booklet in a series: a subject colour field,
 * a seeded geometric pattern and the title set large. A pattern, never a picture of something:
 * every lab of a subject shares the field and the kind of pattern, its share code (or id) seeds
 * the arrangement, so a cover is stable and no two labs look alike. Tokens only: the field and
 * the pattern ink are set per subject in features/public/cover.css.
 *
 * It fills its .lab-cover box and lays itself out from the box's shape (container queries):
 * words left and pattern right in a card, pattern above in a squarish or tall box, the title's
 * first letter on a `compact` thumbnail. Decorative: the parent hides it from assistive technology.
 */

/** The pattern each subject prints. */
export const SUBJECT_PATTERNS = {
  math: 'modular',
  economics: 'modular',
  other: 'modular',
  informatics: 'truchet',
  computer_science: 'truchet',
  physics: 'rings',
  engineering: 'rings',
  chemistry: 'lattice',
  biology: 'cells',
  agriculture: 'contours',
  environment: 'contours',
  geography: 'contours',
  pe: 'lanes',
}

const round = (n) => Math.round(n * 100) / 100

/*
 * Every pattern is drawn in a 100x100 box that its panel fills by slicing (a card's panel shows
 * about x 12 to 88, a tall panel the full height). Shapes stay right of x = INNER and only run
 * off the right, top and bottom, which are the cover's own edges: nothing is cut mid-cover.
 */
const INNER = 20

/** A modular grid of circles, half and quarter discs and squares, like a Bauhaus print (math, economics, other). */
function modular(r) {
  const cols = 3
  const rows = 4
  const cell = 21.5
  const x0 = INNER + 3
  const y0 = 50 - (rows * cell) / 2
  const motifs = ['disc', 'ring', 'half', 'half', 'quarter', 'quarter', 'quarter', 'square']
  let picks = []
  for (let guard = 0; guard < 40; guard += 1) {
    picks = Array.from({ length: cols * rows }, () => (r.next() < 0.36 ? null : r.pick(motifs)))
    const count = picks.filter(Boolean).length
    if (count >= 6 && count <= 10) break
  }
  const filled = picks.map((m, i) => (m ? i : -1)).filter((i) => i >= 0)
  const focus = filled[r.int(0, filled.length - 1)]
  const shapes = []
  picks.forEach((motif, i) => {
    if (!motif) return
    const x = x0 + (i % cols) * cell
    const y = y0 + Math.floor(i / cols) * cell
    const cx = x + cell / 2
    const cy = y + cell / 2
    const opacity = i === focus ? 0.24 : motif === 'ring' ? 0.2 : (i % 2 ? 0.14 : 0.18)
    const turn = r.int(0, 3) * 90
    const s = cell - 1.2 // a hairline of paper between neighbours
    const a = x + 0.6
    const b = y + 0.6
    if (motif === 'disc') shapes.push({ kind: 'dot', cx, cy, r: s / 2, opacity })
    else if (motif === 'ring') shapes.push({ kind: 'circle', cx, cy, r: s / 2 - 1.6, stroke: 3.2, opacity })
    else if (motif === 'square') shapes.push({ kind: 'rect', x: a + 2.5, y: b + 2.5, w: s - 5, h: s - 5, rx: 1.6, opacity })
    else if (motif === 'half') shapes.push({ kind: 'path', d: `M${round(a)} ${round(b + s)}A${round(s / 2)} ${round(s / 2)} 0 0 1 ${round(a + s)} ${round(b + s)}Z`, fill: true, opacity, rotate: [turn, cx, cy] })
    else shapes.push({ kind: 'path', d: `M${round(a)} ${round(b)}L${round(a + s)} ${round(b)}A${round(s)} ${round(s)} 0 0 1 ${round(a)} ${round(b + s)}Z`, fill: true, opacity, rotate: [turn, cx, cy] })
  })
  return shapes
}

/** Truchet tiles: quarter arcs that join from cell to cell into one winding path (informatics, computer science). */
function truchet(r) {
  const cols = 4
  const rows = 5
  const cell = 16
  const x0 = INNER + 6
  const y0 = 50 - (rows * cell) / 2
  const R = cell / 2
  const arcs = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = x0 + col * cell
      const y = y0 + row * cell
      if (r.next() < 0.5) {
        arcs.push(`M${x + R} ${y}A${R} ${R} 0 0 1 ${x} ${y + R}`, `M${x + cell - R} ${y + cell}A${R} ${R} 0 0 1 ${x + cell} ${y + cell - R}`)
      } else {
        arcs.push(`M${x + cell} ${y + R}A${R} ${R} 0 0 1 ${x + cell - R} ${y}`, `M${x} ${y + cell - R}A${R} ${R} 0 0 1 ${x + R} ${y + cell}`)
      }
    }
  }
  const accents = new Set()
  while (accents.size < 3) accents.add(r.int(0, arcs.length - 1))
  // butt caps: arcs meet edge to edge, so the darker accents never stack over their neighbours
  return [
    { kind: 'path', d: arcs.filter((_, i) => !accents.has(i)).join(''), stroke: 3.2, cap: 'butt', opacity: 0.18 },
    { kind: 'path', d: [...accents].map((i) => arcs[i]).join(''), stroke: 3.2, cap: 'butt', opacity: 0.24 },
  ]
}

/** Concentric rings around a centre beyond the cover's right edge, with a few bodies on them (physics, engineering). */
function rings(r) {
  const [cx, cy] = r.pick([[104, 104], [104, -4], [112, 50]])
  const n = r.int(4, 5)
  const first = r.range(17, 23)
  const step = (cx - INNER - 2 - first) / (n - 1)
  const shapes = []
  for (let k = 0; k < n; k += 1) {
    shapes.push({ kind: 'circle', cx, cy, r: first + k * step, stroke: k % 2 ? 1.8 : 4, opacity: k % 2 ? 0.16 : 0.2 })
  }
  const bodies = r.int(2, 3)
  const towards = Math.atan2(50 - cy, 50 - cx)
  for (let b = 0; b < bodies; b += 1) {
    const ring = first + r.int(1, n - 1) * step
    const angle = towards + r.range(-0.5, 0.5)
    shapes.push({ kind: 'dot', cx: cx + Math.cos(angle) * ring, cy: cy + Math.sin(angle) * ring, r: b === 0 ? 5 : r.range(2.4, 3.4), opacity: b === 0 ? 0.24 : 0.2 })
  }
  return shapes
}

/** Atoms on a hexagonal lattice, in three sizes, grown as one cluster with its bonds (chemistry). */
function lattice(r) {
  const s = 19
  const pos = (i, j) => [INNER + 6 + i * s + (j % 2) * (s / 2), 12 + j * s * 0.866]
  const key = (i, j) => `${i}:${j}`
  const neighbours = (i, j) => {
    const shift = j % 2 ? 0 : -1
    return [[i - 1, j], [i + 1, j], [i + shift, j - 1], [i + shift + 1, j - 1], [i + shift, j + 1], [i + shift + 1, j + 1]]
      .filter(([a, b]) => a >= 0 && a <= 3 && b >= 0 && b <= 5)
  }
  const sizes = [3.4, 5.2, 7.2]
  const target = r.int(9, 12)
  const atoms = [{ at: [r.int(1, 2), r.int(2, 3)], r: sizes[2] }]
  const taken = new Set([key(...atoms[0].at)])
  const bonds = []
  for (let guard = 0; atoms.length < target && guard < 400; guard += 1) {
    const from = atoms[Math.floor(r.next() * atoms.length)]
    const free = neighbours(...from.at).filter(([a, b]) => !taken.has(key(a, b)))
    if (!free.length) continue
    const to = { at: free[Math.floor(r.next() * free.length)], r: sizes[Math.floor(r.next() * 3)] }
    taken.add(key(...to.at))
    atoms.push(to)
    bonds.push([from, to])
  }
  // a bond runs between the atoms' edges, never through their translucent discs
  const bond = (from, to) => {
    const [x1, y1] = pos(...from.at)
    const [x2, y2] = pos(...to.at)
    const length = Math.hypot(x2 - x1, y2 - y1)
    const ux = (x2 - x1) / length
    const uy = (y2 - y1) / length
    const a = from.r + 1.4
    const b = to.r + 1.4
    return { kind: 'line', x1: x1 + ux * a, y1: y1 + uy * a, x2: x2 - ux * b, y2: y2 - uy * b, width: 1.8, opacity: 0.18 }
  }
  return [
    ...bonds.map(([from, to]) => bond(from, to)),
    ...atoms.map((atom, n) => {
      const [cx, cy] = pos(...atom.at)
      return { kind: 'dot', cx, cy, r: atom.r, opacity: n === 0 ? 0.24 : 0.18 }
    }),
  ]
}

/** A closed smooth curve through points (Catmull-Rom as cubic Béziers). */
function closedPath(points) {
  const n = points.length
  const p = (k) => points[(k + n) % n]
  let d = `M${round(p(0)[0])} ${round(p(0)[1])}`
  for (let k = 0; k < n; k += 1) {
    const [x0, y0] = p(k - 1)
    const [x1, y1] = p(k)
    const [x2, y2] = p(k + 1)
    const [x3, y3] = p(k + 2)
    d += `C${round(x1 + (x2 - x0) / 6)} ${round(y1 + (y2 - y0) / 6)} ${round(x2 - (x3 - x1) / 6)} ${round(y2 - (y3 - y1) / 6)} ${round(x2)} ${round(y2)}`
  }
  return `${d}Z`
}

/**
 * Contour lines of a hill near the cover's right edge: the summit filled, the slope steeper on one
 * side (the levels drift), the outer lines rougher than the inner ones (geography, environment,
 * agriculture).
 */
function contours(r) {
  const cx = r.range(74, 84)
  const cy = r.range(40, 60)
  const n = r.int(5, 6)
  const drift = r.range(0, Math.PI * 2)
  const lean = r.range(0.9, 1.6)
  const waves = [
    { k: 2, a: r.range(0.06, 0.11), p: r.range(0, Math.PI * 2) },
    { k: 3, a: r.range(0.04, 0.08), p: r.range(0, Math.PI * 2) },
    { k: 5, a: r.range(0.02, 0.035), p: r.range(0, Math.PI * 2) },
  ]
  const outer = (cx - INNER - (n - 1) * lean) / 1.32
  const step = (outer - 6) / (n - 1)
  const shapes = []
  for (let level = 0; level < n; level += 1) {
    const radius = 6 + level * step
    const rough = 0.45 + level / n
    const ox = cx + Math.cos(drift) * lean * level
    const oy = cy + Math.sin(drift) * lean * level
    const points = Array.from({ length: 18 }, (_, q) => {
      const t = (q / 18) * Math.PI * 2
      const wobble = 1 + rough * waves.reduce((sum, w) => sum + w.a * Math.sin(w.k * t + w.p + level * 0.45), 0)
      return [ox + Math.cos(t) * radius * wobble * 1.1, oy + Math.sin(t) * radius * wobble * 0.95]
    })
    shapes.push(level === 0
      ? { kind: 'path', d: closedPath(points), fill: true, opacity: 0.22 }
      : { kind: 'path', d: closedPath(points), stroke: level === n - 1 ? 2.6 : 1.6, opacity: level % 2 ? 0.16 : 0.2 })
  }
  return shapes
}

/** Packed round cells, some with a nucleus (biology). */
function cells(r) {
  const target = r.int(9, 14)
  const placed = []
  for (let guard = 0; placed.length < target && guard < 800; guard += 1) {
    const radius = r.range(6.5, 14)
    const cx = r.range(INNER + radius, 106)
    const cy = r.range(-4, 104)
    if (placed.every((c) => Math.hypot(c.cx - cx, c.cy - cy) > c.r + radius + 2.6)) placed.push({ cx, cy, r: radius })
  }
  const shapes = []
  placed.forEach((c, n) => {
    shapes.push(n % 3 === 0
      ? { kind: 'dot', cx: c.cx, cy: c.cy, r: c.r, opacity: 0.14 }
      : { kind: 'circle', cx: c.cx, cy: c.cy, r: c.r - 0.8, stroke: 1.6, opacity: 0.2 })
    if (n % 2 === 0) shapes.push({ kind: 'dot', cx: c.cx + c.r * 0.22, cy: c.cy - c.r * 0.18, r: Math.max(1.6, c.r * 0.22), opacity: 0.24 })
  })
  return shapes
}

/** Five lanes from a start line, rising off the cover like a running track, and one ball (physical education). */
function lanes(r) {
  const angle = (r.range(-36, -26) * Math.PI) / 180
  const spacing = 16
  const start = INNER + 8
  const first = r.range(42, 50)
  const length = (124 - start) / Math.cos(angle)
  const shapes = []
  for (let k = 0; k < 5; k += 1) {
    const y = first + k * spacing
    shapes.push({ kind: 'line', x1: start, y1: y, x2: start + Math.cos(angle) * length, y2: y + Math.sin(angle) * length, width: 8.5, opacity: k % 2 ? 0.14 : 0.19 })
  }
  const along = r.range(24, 44)
  const y = first + r.int(0, 3) * spacing + spacing / 2
  shapes.push({ kind: 'dot', cx: start + Math.cos(angle) * along, cy: y + Math.sin(angle) * along, r: 4.2, opacity: 0.24 })
  return shapes
}

const PATTERNS = { modular, truchet, rings, lattice, contours, cells, lanes }

/** The shapes of a lab's pattern in a 100x100 box, the same for the same subject and seed. */
export function bookletPattern(subject, seed) {
  const kind = SUBJECT_PATTERNS[subject] || SUBJECT_PATTERNS.other
  return { kind, shapes: PATTERNS[kind](seeded(`${kind}:${seed}`)) }
}

function Shape({ shape }) {
  const o = shape.opacity
  switch (shape.kind) {
    case 'rect':
      return <rect x={round(shape.x)} y={round(shape.y)} width={round(shape.w)} height={round(shape.h)} rx={shape.rx} fill="currentColor" fillOpacity={o} />
    case 'frame':
      return <rect x={round(shape.x)} y={round(shape.y)} width={round(shape.w)} height={round(shape.h)} rx={shape.rx} fill="none" stroke="currentColor" strokeOpacity={o} strokeWidth={shape.stroke} />
    case 'dot':
      return <circle cx={round(shape.cx)} cy={round(shape.cy)} r={round(shape.r)} fill="currentColor" fillOpacity={o} />
    case 'circle':
      return <circle cx={round(shape.cx)} cy={round(shape.cy)} r={round(shape.r)} fill="none" stroke="currentColor" strokeOpacity={o} strokeWidth={shape.stroke} />
    case 'line':
      return <line x1={round(shape.x1)} y1={round(shape.y1)} x2={round(shape.x2)} y2={round(shape.y2)} stroke="currentColor" strokeOpacity={o} strokeWidth={shape.width} strokeLinecap="round" />
    default: {
      const transform = shape.rotate ? `rotate(${shape.rotate.map(round).join(' ')})` : undefined
      return shape.fill
        ? <path d={shape.d} transform={transform} fill="currentColor" fillOpacity={o} />
        : <path d={shape.d} transform={transform} fill="none" stroke="currentColor" strokeOpacity={o} strokeWidth={shape.stroke} strokeLinecap={shape.cap || 'round'} strokeLinejoin="round" />
    }
  }
}

/** The title's first letter or digit, for a thumbnail. */
export function coverLetter(title, lang) {
  const text = String(title || '').normalize('NFC').trim()
  const first = Array.from(text).find((ch) => /[\p{L}\p{N}]/u.test(ch)) || ''
  return first.toLocaleUpperCase(lang === 'en' ? 'en' : 'vi')
}

/**
 * The title's size factor from its length: the block a title needs grows with its length times
 * the square of its size, so a factor of sqrt(18 / length) keeps every title about the same area
 * (1 up to 18 characters, never below 0.42 for long research titles).
 */
export function titleScale(title) {
  const n = Array.from(String(title || '').trim()).length
  return Math.round(Math.min(1, Math.max(0.42, Math.sqrt(18 / Math.max(n, 1)))) * 100) / 100
}

export default function BookletCover({ lab, compact = false }) {
  const { t } = useT()
  const subject = ALL_SUBJECTS.includes(lab?.subject) ? lab.subject : 'other'
  const seed = lab?.share_code || lab?.id || lab?.title || subject
  const { kind, shapes } = bookletPattern(subject, seed)
  const title = String(lab?.title || '').trim()
  const lang = lab?.language === 'vi' || lab?.language === 'en' ? lab.language : undefined
  const Icon = subjectIcon(subject)
  const grade = lab?.grade ? t(`common.grades.${lab.grade}`) : ''
  return (
    <div
      className={['cv-booklet', compact && 'is-compact'].filter(Boolean).join(' ')}
      data-subject={subject}
      data-pattern={kind}
      style={{ '--cv-scale': titleScale(title) }}
    >
      <div className="cv-booklet-art">
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" focusable="false" aria-hidden="true">
          {shapes.map((shape, index) => <Shape key={index} shape={shape} />)}
        </svg>
      </div>
      {compact ? (
        <span className="cv-booklet-letter" lang={lang}>{coverLetter(title, lang)}</span>
      ) : (
        <div className="cv-booklet-words">
          <p className="cv-booklet-series">
            <Icon size={16} aria-hidden="true" />
            <span className="cv-booklet-subject">{t(`common.subjects.${subject}`)}</span>
            {grade ? <span className="cv-booklet-grade">{grade}</span> : null}
          </p>
          <p className="cv-booklet-title" lang={lang}>{title}</p>
        </div>
      )}
    </div>
  )
}
