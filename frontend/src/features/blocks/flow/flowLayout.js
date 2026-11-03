/**
 * Pure layout for the flow block (flowLayout.test.js). Coordinates are CSS pixels of the
 * measured canvas so text stays readable at every width:
 *   - cycle  → nodes on an ellipse (when it fits), else a vertical column with a loop-back arrow
 *   - linear → one row left → right (when it fits), else a vertical column
 * Node boxes are HTML buttons centred on the computed points; arrows are SVG paths clipped
 * at the measured box borders.
 */

export const PAD = 12
export const NODE_H = 66
export const ROW_GAP_MIN = 64
export const COL_GAP = 64
const MARGIN = 5
// A lesson slide sets node labels at lead size (`large`): wider and taller boxes. It may also hand
// the layout the height it can fill (`room`): the ring takes it, a row sits in its middle and a
// column spreads its gaps over it.
const NODE_H_LARGE = 84
const COL_GAP_MAX = 120

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const nodeHeight = (large) => (large ? NODE_H_LARGE : NODE_H)

/** Edges whose ends exist and are different nodes. */
export function validEdges(nodes, edges) {
  const ids = new Set((nodes || []).map((n) => n.id))
  return (edges || []).filter((e) => e && ids.has(e.source) && ids.has(e.target) && e.source !== e.target)
}

function hasSkips(nodes, edges) {
  const index = new Map(nodes.map((n, i) => [n.id, i]))
  return validEdges(nodes, edges).some((e) => index.get(e.target) !== index.get(e.source) + 1)
}

// `edge`: extra room above and below the ring for the labels of the arrows that bow outwards
function cycleCentres(count, width, height, nodeW, nodeH, edge = 0) {
  const cx = width / 2
  const cy = height / 2
  if (count === 1) return [{ x: cx, y: cy }]
  const rx = width / 2 - nodeW / 2 - PAD
  const ry = height / 2 - nodeH / 2 - PAD - edge
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / count
    return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) }
  })
}

function boxesOverlap(centres, w, h, gap = 10) {
  for (let i = 0; i < centres.length; i += 1) {
    for (let j = i + 1; j < centres.length; j += 1) {
      const dx = Math.abs(centres[i].x - centres[j].x)
      const dy = Math.abs(centres[i].y - centres[j].y)
      if (dx < w + gap && dy < h + gap) return true
    }
  }
  return false
}

function cycleNodeWidth(width, large = false) {
  return large ? clamp(width * 0.21, 150, 250) : clamp(width * 0.2, 112, 168)
}

function cycleHeight(width, count, room = 0) {
  if (room > 0) return Math.max(300, room)
  return clamp(width * 0.62, 300, count > 6 ? 640 : 540)
}

function rowNodeWidth(width, count, large = false) {
  const share = (width - 2 * PAD - (count - 1) * ROW_GAP_MIN) / Math.max(1, count)
  return large ? clamp(share, 150, 280) : clamp(share, 104, 180)
}

/**
 * Which arrangement to use for `layout` with `count` nodes in a canvas `width` px wide.
 * `large` and `room` are the lesson slide's node size and available height (see layoutFlow).
 */
export function chooseMode(layout, count, width, { large = false, room = 0 } = {}) {
  if (!width || count < 1) return 'column'
  if (layout === 'cycle') {
    if (count < 3) return count === 1 ? 'row' : rowFits(count, width, large) ? 'row' : 'column'
    const w = cycleNodeWidth(width, large)
    const h = cycleHeight(width, count, room)
    // a ring needs room for the arrow labels between boxes; phones get a readable column
    if (width < (large ? 600 : 520)) return 'column'
    const centres = cycleCentres(count, width, h, w, nodeHeight(large))
    return boxesOverlap(centres, w, nodeHeight(large)) ? 'column' : 'cycle'
  }
  return rowFits(count, width, large) ? 'row' : 'column'
}

function rowFits(count, width, large = false) {
  const w = rowNodeWidth(width, count, large)
  return count * w + (count - 1) * ROW_GAP_MIN + 2 * PAD <= width
}

/**
 * Node centres and canvas height.
 * sizes: { [nodeId]: { w, h } } measured boxes (heights fall back to NODE_H).
 * large: a lesson slide's bigger boxes (labels at lead size); room: the height (px) the canvas may
 * fill, or 0 to size itself.
 * Returns { mode, nodeWidth, height, centres: { [id]: {x, y} }, side } where `side` is the
 * horizontal room kept for side arcs in column mode.
 */
export function layoutFlow({ layout, nodes = [], edges = [], width, sizes = {}, large = false, room = 0 }) {
  const count = nodes.length
  const space = room > 0 ? room : 0
  const mode = chooseMode(layout, count, width, { large, room: space })
  const baseH = nodeHeight(large)
  const heightOf = (id) => sizes[id]?.h || baseH
  const centres = {}
  if (!count || !width) return { mode, nodeWidth: 0, height: 0, centres, side: 0 }

  if (mode === 'cycle') {
    const nodeWidth = cycleNodeWidth(width, large)
    const tallest = Math.max(baseH, ...nodes.map((n) => heightOf(n.id)))
    const height = space ? Math.max(cycleHeight(width, count, space), tallest * 3) : cycleHeight(width, count) + Math.max(0, tallest - NODE_H)
    // a canvas that fills a well clips at its edge: keep the outer arrow labels inside it
    cycleCentres(count, width, height, nodeWidth, tallest, space ? (large ? 28 : 22) : 0).forEach((p, i) => {
      centres[nodes[i].id] = p
    })
    return { mode, nodeWidth, height, centres, side: 0 }
  }

  if (mode === 'row') {
    const nodeWidth = rowNodeWidth(width, count, large)
    const gap = count > 1 ? Math.min(150, (width - 2 * PAD - count * nodeWidth) / (count - 1)) : 0
    const total = count * nodeWidth + (count - 1) * gap
    const start = (width - total) / 2 + nodeWidth / 2
    const tallest = Math.max(baseH, ...nodes.map((n) => heightOf(n.id)))
    const arc = hasSkips(nodes, edges) || layout === 'cycle' ? 78 : 18
    const height = Math.max(tallest + 2 * arc, space)
    nodes.forEach((n, i) => {
      centres[n.id] = { x: start + i * (nodeWidth + gap), y: height / 2 }
    })
    return { mode, nodeWidth, height, centres, side: 0, gap }
  }

  // column
  const side = hasSkips(nodes, edges) || layout === 'cycle' ? 46 : 0
  const nodeWidth = Math.max(120, Math.min(width - 2 * PAD - 2 * side, large ? 460 : 380))
  const stacked = nodes.reduce((sum, n) => sum + heightOf(n.id), 0)
  const gapY = space && count > 1 ? clamp((space - 2 * PAD - stacked) / (count - 1), COL_GAP, COL_GAP_MAX) : COL_GAP
  let y = PAD
  nodes.forEach((n) => {
    const h = heightOf(n.id)
    centres[n.id] = { x: width / 2, y: y + h / 2 }
    y += h + gapY
  })
  return { mode, nodeWidth, height: y - gapY + PAD, centres, side }
}

/** Where a ray from the centre of a w×h box towards (dx, dy) leaves the box (plus a small margin). */
export function rayExit(cx, cy, w, h, dx, dy) {
  const hw = w / 2 + MARGIN
  const hh = h / 2 + MARGIN
  if (!dx && !dy) return [cx, cy]
  const tx = dx ? hw / Math.abs(dx) : Infinity
  const ty = dy ? hh / Math.abs(dy) : Infinity
  const t = Math.min(tx, ty)
  return [cx + dx * t, cy + dy * t]
}

const fmt = (v) => Math.round(v * 10) / 10

/**
 * SVG path + label anchor for every drawable edge.
 * Returns [{ id, edge, d, labelX, labelY, compact, angle }] — `compact` asks for an icon-sized label
 * because there is no room for text (side arcs in column mode); `angle` (degrees, clockwise from
 * pointing right) is the arrow's direction at the label, so an icon label can point the same way.
 */
export function edgePaths({ mode, nodes, edges, centres, sizes = {}, nodeWidth, width, height }) {
  const index = new Map(nodes.map((n, i) => [n.id, i]))
  const list = validEdges(nodes, edges)
  const pairs = new Set(list.map((e) => `${e.source}>${e.target}`))
  const box = (id) => ({ w: sizes[id]?.w || nodeWidth, h: sizes[id]?.h || NODE_H })
  const out = []
  for (const edge of list) {
    const s = centres[edge.source]
    const t = centres[edge.target]
    if (!s || !t) continue
    const sb = box(edge.source)
    const tb = box(edge.target)
    const si = index.get(edge.source)
    const ti = index.get(edge.target)
    const twin = pairs.has(`${edge.target}>${edge.source}`)
    const mx = (s.x + t.x) / 2
    const my = (s.y + t.y) / 2

    if (mode === 'column' && ti !== si + 1) {
      // side arc: backward arrows (loop-back) on the right, forward skips on the left
      const dir = ti < si ? 1 : -1
      const off = clamp(22 + 8 * Math.abs(ti - si), 26, 40)
      const x0 = s.x + dir * (sb.w / 2 + 2)
      const x1 = t.x + dir * (tb.w / 2 + MARGIN)
      const c = (dir > 0 ? Math.max(x0, x1) : Math.min(x0, x1)) + dir * off
      const d = `M${fmt(x0)} ${fmt(s.y)} C${fmt(c)} ${fmt(s.y)} ${fmt(c)} ${fmt(t.y)} ${fmt(x1)} ${fmt(t.y)}`
      // halfway along a side arc the arrow runs straight up or down
      out.push({ id: edge.id, edge, d, labelX: fmt(0.125 * (x0 + x1) + 0.75 * c), labelY: fmt((s.y + t.y) / 2), compact: true, angle: t.y < s.y ? -90 : 90 })
      continue
    }

    let qx = mx
    let qy = my
    if (mode === 'cycle') {
      const cx = width / 2
      const cy = height / 2
      let vx = mx - cx
      let vy = my - cy
      let len = Math.hypot(vx, vy)
      if (len < 1) {
        vx = -(t.y - s.y)
        vy = t.x - s.x
        len = Math.hypot(vx, vy) || 1
      }
      const chord = Math.hypot(t.x - s.x, t.y - s.y)
      const neighbours = Math.abs(ti - si) === 1 || Math.abs(ti - si) === nodes.length - 1
      let bulge = neighbours ? 0.22 * chord : 0.08 * chord
      if (twin && si > ti) bulge = -Math.abs(bulge) - 0.12 * chord
      if (!neighbours && !twin) bulge = -bulge
      qx = mx + (vx / len) * bulge
      qy = my + (vy / len) * bulge
    } else if (mode === 'row' && ti !== si + 1) {
      // forward skips arc above the row, backward arrows below it
      const lift = clamp(38 + 16 * Math.abs(ti - si), 40, 120)
      qy = my + (ti > si ? -lift : lift)
    }
    const [x0, y0] = rayExit(s.x, s.y, sb.w, sb.h, qx - s.x, qy - s.y)
    const [x2, y2] = rayExit(t.x, t.y, tb.w, tb.h, qx - t.x, qy - t.y)
    const straight = qx === mx && qy === my
    const d = straight ? `M${fmt(x0)} ${fmt(y0)} L${fmt(x2)} ${fmt(y2)}` : `M${fmt(x0)} ${fmt(y0)} Q${fmt(qx)} ${fmt(qy)} ${fmt(x2)} ${fmt(y2)}`
    const lx = straight ? (x0 + x2) / 2 : 0.25 * x0 + 0.5 * qx + 0.25 * x2
    const ly = straight ? (y0 + y2) / 2 : 0.25 * y0 + 0.5 * qy + 0.25 * y2
    // a line and a quadratic curve both run parallel to their chord at the label (degrees, y down)
    const angle = Math.round((Math.atan2(y2 - y0, x2 - x0) * 180) / Math.PI)
    out.push({ id: edge.id, edge, d, labelX: fmt(lx), labelY: fmt(ly), compact: false, angle })
  }
  return out
}

/**
 * Order in which "Run the flow" highlights things: start at a node without incoming arrows
 * (or the first node), follow arrows, then visit what is left; a closing arrow back to the
 * start (cycles) comes last. → [{ type: 'node'|'edge', id }]
 */
export function runSequence(nodes = [], edges = []) {
  if (!nodes.length) return []
  const list = validEdges(nodes, edges)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const seenNodes = new Set()
  const seenEdges = new Set()
  const seq = []
  const start = nodes.find((n) => !list.some((e) => e.target === n.id)) || nodes[0]
  let last = null

  const walk = (node) => {
    let current = node
    while (current && !seenNodes.has(current.id)) {
      seq.push({ type: 'node', id: current.id })
      seenNodes.add(current.id)
      last = current
      const next = list.find((e) => e.source === current.id && !seenEdges.has(e.id) && !seenNodes.has(e.target))
      if (!next) break
      seq.push({ type: 'edge', id: next.id })
      seenEdges.add(next.id)
      current = byId.get(next.target)
    }
  }

  walk(start)
  while (seenNodes.size < nodes.length) {
    const node = nodes.find((n) => !seenNodes.has(n.id))
    const into = list.find((e) => e.target === node.id && seenNodes.has(e.source) && !seenEdges.has(e.id))
    if (into) {
      seq.push({ type: 'edge', id: into.id })
      seenEdges.add(into.id)
    }
    walk(node)
  }
  const closing = last && list.find((e) => e.source === last.id && e.target === start.id && !seenEdges.has(e.id))
  if (closing) seq.push({ type: 'edge', id: closing.id })
  return seq
}

/** Connect consecutive nodes (and close the loop for cycles) where no arrow exists yet. */
export function sequentialEdges(nodes = [], edges = [], layout = 'linear', makeId) {
  const have = new Set(validEdges(nodes, edges).map((e) => `${e.source}>${e.target}`))
  const added = []
  const pairs = nodes.slice(1).map((n, i) => [nodes[i].id, n.id])
  if (layout === 'cycle' && nodes.length > 2) pairs.push([nodes[nodes.length - 1].id, nodes[0].id])
  for (const [source, target] of pairs) {
    if (have.has(`${source}>${target}`)) continue
    added.push({ id: makeId(), source, target, label: '', description: '', source_refs: [] })
    have.add(`${source}>${target}`)
  }
  return added
}
