/** Pure helpers for the interactive diagram block (diagramLogic.test.js). */
import { LIMITS, boxCenter, cut, normBox, safeMaskPath, shuffle } from '../steps/lessonKit.js'

const norm = (s) => String(s || '').trim().toLocaleLowerCase()

/** Shape to draw for a hotspot in 0..1000 units: SAM mask path when present, else the bbox. */
export function hotspotShape(h) {
  if (h?.mask_path) return { kind: 'path', d: h.mask_path }
  const b = normBox(h?.bbox)
  if (!b) return null
  return { kind: 'rect', x: b[0] * 1000, y: b[1] * 1000, w: (b[2] - b[0]) * 1000, h: (b[3] - b[1]) * 1000 }
}

/** Where the number marker of a hotspot sits (CSS %, top-left corner nudged inside the picture). */
export function markerPosition(h) {
  const b = normBox(h?.bbox)
  if (!b) return null
  return { left: Math.min(97, Math.max(3, b[0] * 100)), top: Math.min(97, Math.max(3, b[1] * 100)) }
}

/** Self-test needs at least two parts with different, non-empty names. */
export function canSelfTest(hotspots = []) {
  return new Set(hotspots.map((h) => norm(h.label)).filter(Boolean)).size >= 2
}

/** Hotspots worth asking about (named), in a random order. */
export function selfTestOrder(hotspots = [], rng = Math.random) {
  return shuffle(
    hotspots.filter((h) => norm(h.label)),
    rng,
  ).map((h) => h.id)
}

/** Up to `max` distinct label choices (the right one included), shuffled. */
export function labelChoices(hotspots, targetId, rng = Math.random, max = 4) {
  const target = hotspots.find((h) => h.id === targetId)
  if (!target) return []
  const seen = new Set([norm(target.label)])
  const others = shuffle(
    hotspots.filter((h) => h.id !== targetId),
    rng,
  )
    .filter((h) => {
      const key = norm(h.label)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, max - 1)
  return shuffle([target, ...others], rng).map((h) => ({ id: h.id, label: h.label.trim(), correct: h.id === targetId }))
}

export function isSameLabel(a, b) {
  return norm(a) === norm(b)
}

/**
 * Convert DiagramOut (AI parts + SAM masks) into hotspots ready for the spec.
 * `toMaskPath(obj, width, height)` turns a SAM object into an SVG path in 0..1000 units
 * (normalizedMaskPath from lib/sam.js); `toBox(box, width, height)` normalizes a pixel box.
 */
export function proposalFromAi(result, toMaskPath, toBox) {
  const width = result?.image_width
  const height = result?.image_height
  return (result?.hotspots || [])
    .map((h) => {
      const obj = result.masks?.[h.id]
      let bbox = normBox(h.bbox)
      if (!bbox && obj?.box && width && height && toBox) bbox = normBox(toBox(obj.box, width, height))
      if (!bbox) return null
      let mask = null
      if (obj?.mask && width && height && toMaskPath) {
        try {
          mask = safeMaskPath(toMaskPath(obj, width, height))
        } catch {
          mask = null
        }
      }
      return {
        id: String(h.id || ''),
        label: cut(h.label, LIMITS.short),
        description_simple: cut(h.description_simple, LIMITS.medium),
        description_detailed: cut(h.description_detailed, LIMITS.long),
        bbox,
        mask_path: mask || safeMaskPath(h.mask_path) || null,
        source_refs: (h.source_refs || []).slice(0, LIMITS.stepRefs),
      }
    })
    .filter(Boolean)
}

/**
 * Merge (or replace) AI-proposed parts into the block. Ids that clash are renamed and
 * relations follow; limits from the schema are respected.
 * → { hotspots, relations, added, truncated }
 */
export function applyProposal(block, proposal, { replace = false, include } = {}, makeId) {
  const chosen = (proposal.hotspots || []).filter((h) => !include || include.has(h.id))
  const base = replace ? [] : block.hotspots || []
  const taken = new Set([...base.map((h) => h.id), ...(replace ? [] : (block.relations || []).map((r) => r.id))])
  const idMap = new Map()
  const added = []
  for (const h of chosen) {
    let id = h.id && /^[\w.:-]{1,40}$/.test(h.id) && !taken.has(h.id) ? h.id : null
    while (!id || taken.has(id)) id = makeId('h')
    taken.add(id)
    idMap.set(h.id, id)
    added.push({ ...h, id })
  }
  const all = [...base, ...added]
  const hotspots = all.slice(0, LIMITS.hotspots)
  const kept = new Set(hotspots.map((h) => h.id))
  const baseRelations = replace ? [] : (block.relations || []).filter((r) => kept.has(r.source) && kept.has(r.target))
  const newRelations = []
  for (const r of proposal.relations || []) {
    const source = idMap.get(r.source)
    const target = idMap.get(r.target)
    if (!source || !target || source === target || !kept.has(source) || !kept.has(target)) continue
    let id = r.id && !taken.has(r.id) ? r.id : null
    while (!id || taken.has(id)) id = makeId('r')
    taken.add(id)
    newRelations.push({ id, source, target, label: cut(r.label, LIMITS.short), description: cut(r.description, LIMITS.medium) })
  }
  const relations = [...baseRelations, ...newRelations].slice(0, LIMITS.relations)
  return { hotspots, relations, added: Math.max(0, hotspots.length - base.length), truncated: all.length > LIMITS.hotspots }
}

/** Remove a hotspot and every relation that uses it. */
export function removeHotspot(block, id) {
  return {
    ...block,
    hotspots: (block.hotspots || []).filter((h) => h.id !== id),
    relations: (block.relations || []).filter((r) => r.source !== id && r.target !== id),
  }
}

function exitPoint(cx, cy, hw, hh, dx, dy) {
  if (!dx && !dy) return [cx, cy]
  const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity)
  return [cx + dx * t, cy + dy * t]
}

/**
 * Arrows between hotspot centres in a uniform space 1000 × (1000 / ratio), clipped near the
 * part borders so they do not hide the parts. → [{ id, relation, x1, y1, x2, y2, mx, my }]
 * where mx, my are fractions (0..1) for positioning the HTML label.
 */
export function relationLines(relations = [], hotspots = [], ratio = 1) {
  const H = 1000 / (ratio || 1)
  const byId = new Map(hotspots.map((h) => [h.id, h]))
  const out = []
  for (const r of relations) {
    const a = byId.get(r.source)
    const b = byId.get(r.target)
    const ab = normBox(a?.bbox)
    const bb = normBox(b?.bbox)
    if (!ab || !bb || a === b) continue
    const [acx, acy] = boxCenter(ab)
    const [bcx, bcy] = boxCenter(bb)
    const A = [acx * 1000, acy * H]
    const B = [bcx * 1000, bcy * H]
    const dx = B[0] - A[0]
    const dy = B[1] - A[1]
    let [x1, y1] = exitPoint(A[0], A[1], ((ab[2] - ab[0]) * 1000) / 2, ((ab[3] - ab[1]) * H) / 2, dx, dy)
    let [x2, y2] = exitPoint(B[0], B[1], ((bb[2] - bb[0]) * 1000) / 2, ((bb[3] - bb[1]) * H) / 2, -dx, -dy)
    // overlapping parts: fall back to centre-to-centre so the arrow keeps its direction
    if ((x2 - x1) * dx + (y2 - y1) * dy <= 0) {
      ;[x1, y1] = A
      ;[x2, y2] = B
    }
    out.push({ id: r.id, relation: r, x1, y1, x2, y2, mx: (x1 + x2) / 2 / 1000, my: (y1 + y2) / 2 / H })
  }
  return out
}

/** Next default name: "Bộ phận 3" style, using the translated prefix. */
export function nextPartLabel(hotspots = [], prefix = 'Part') {
  let n = hotspots.length + 1
  const names = new Set(hotspots.map((h) => norm(h.label)))
  while (names.has(norm(`${prefix} ${n}`))) n += 1
  return `${prefix} ${n}`
}
