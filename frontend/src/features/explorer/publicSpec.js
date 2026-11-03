/**
 * Client mirror of the server's `public_spec()` (backend/app/services/labs.py): what learners
 * actually receive when a lab is published.
 *   - quiz: only approved questions; a quiz with none left is removed
 *   - widget: only when approved AND validated
 *   - video: AI-suggested markers only when confirmed (teacher-added markers always stay)
 * Used by the studio preview so "Xem như học sinh" shows exactly the published content.
 */

export function publicSpec(spec) {
  const source = spec || {}
  const blocks = []
  for (const original of source.blocks || []) {
    if (!original || typeof original !== 'object') continue
    const block = { ...original }
    if (block.type === 'quiz') {
      block.questions = (block.questions || []).filter((q) => q && q.approved)
      if (!block.questions.length) continue
    } else if (block.type === 'widget') {
      if (!(block.approved && block.status === 'validated')) continue
    } else if (block.type === 'video') {
      block.markers = (block.markers || []).filter((m) => m && (m.confirmed || !m.ai_suggested))
    }
    blocks.push(block)
  }
  return { ...source, blocks }
}

/** What the published version hides, so the teacher understands the preview. */
export function hiddenContent(spec) {
  const out = { questions: 0, quizzes: 0, widgets: 0, markers: 0 }
  for (const block of spec?.blocks || []) {
    if (!block) continue
    if (block.type === 'quiz') {
      const questions = block.questions || []
      const hidden = questions.filter((q) => !q?.approved).length
      out.questions += hidden
      if (hidden === questions.length) out.quizzes += 1
    } else if (block.type === 'widget') {
      if (!(block.approved && block.status === 'validated')) out.widgets += 1
    } else if (block.type === 'video') {
      out.markers += (block.markers || []).filter((m) => m && m.ai_suggested && !m.confirmed).length
    }
  }
  out.total = out.questions + out.widgets + out.markers + out.quizzes
  return out
}

const ID_KEYS = new Set(['source_id', 'asset_id', 'object_asset_id'])

/**
 * Pairs the ids of an original spec with those of its server-made copy (same structure,
 * remapped `source_id` / `asset_id` / `object_asset_id`). Used when a translated spec of the
 * original is applied to a duplicated lab so its citations point at the copy's sources.
 */
export function collectIdMap(original, copy, map = {}) {
  if (Array.isArray(original) && Array.isArray(copy)) {
    original.forEach((item, i) => collectIdMap(item, copy[i], map))
  } else if (original && copy && typeof original === 'object' && typeof copy === 'object') {
    for (const [key, value] of Object.entries(original)) {
      if (ID_KEYS.has(key) && typeof value === 'string' && typeof copy[key] === 'string') {
        if (value !== copy[key]) map[value] = copy[key]
      } else {
        collectIdMap(value, copy[key], map)
      }
    }
  }
  return map
}

/** Ids paired by position for sources/assets lists of the same length and kinds. */
export function pairListIds(originalItems = [], copyItems = [], map = {}) {
  if (originalItems.length !== copyItems.length) return map
  originalItems.forEach((item, i) => {
    const other = copyItems[i]
    if (item?.id && other?.id && item.kind === other.kind && item.id !== other.id && !(item.id in map)) map[item.id] = other.id
  })
  return map
}

/** Replace ids (keys above, or any string equal to a known id) — mirrors the server's _remap_ids. */
export function remapIds(node, map) {
  if (Array.isArray(node)) return node.map((item) => remapIds(item, map))
  if (node && typeof node === 'object') {
    const out = {}
    for (const [key, value] of Object.entries(node)) {
      out[key] = ID_KEYS.has(key) && typeof value === 'string' ? (map[value] ?? value) : remapIds(value, map)
    }
    return out
  }
  if (typeof node === 'string' && Object.prototype.hasOwnProperty.call(map, node)) return map[node]
  return node
}
