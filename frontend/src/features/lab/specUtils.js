/**
 * Helpers for the Lab spec (contract: backend/app/schemas/spec.py, docs/LAB_SPEC.md).
 */

export const BLOCK_TYPES = ['steps', 'flow', 'diagram', 'graph', 'simulation', 'algorithm', 'video', 'field', 'quiz', 'widget', 'text', 'board']
/** Made by the teacher from their own material (a board from a photo): the AI never proposes or generates them. */
export const TEACHER_ONLY_BLOCK_TYPES = ['board']
export const AI_BLOCK_TYPES = BLOCK_TYPES.filter((type) => !TEACHER_ONLY_BLOCK_TYPES.includes(type))
export const PROVENANCES = ['document', 'user', 'assumption', 'unknown']
export const SIM_MODELS = ['pendulum', 'projectile', 'compound_interest', 'spring_mass']
export const ALGORITHMS = ['attention', 'bubble_sort', 'selection_sort', 'insertion_sort', 'quick_sort', 'merge_sort', 'heap_sort', 'counting_sort', 'radix_sort', 'bucket_sort', 'binary_search', 'linear_search']
export const SPORTS = ['football', 'futsal', 'volleyball', 'basketball', 'badminton']

export function newId(prefix = 'id') {
  const rand = Math.random().toString(36).slice(2, 8)
  const time = Date.now().toString(36).slice(-4)
  return `${prefix}_${time}${rand}`
}

/** A minimal valid block of each type (used by "Add block"). Feature editors fill the rest. */
export function blankBlock(type, t = (k) => k) {
  const base = { id: newId('b'), type, title: t(`blocks.types.${type}`), description: '', source_refs: [], confirmed: false, ai_generated: false }
  switch (type) {
    case 'steps':
      return { ...base, steps: [{ id: newId('s'), title: '1', body: '', source_refs: [] }], sequence_confirmed: false, autoplay_seconds: 6 }
    case 'flow':
      return { ...base, layout: 'linear', nodes: [], edges: [] }
    case 'diagram':
      return { ...base, image: { source_id: null, page: null, asset_id: null }, hotspots: [], relations: [] }
    case 'graph':
      return {
        ...base,
        expression: 'a*x^2 + b*x + c',
        x_var: 'x',
        x_min: -10,
        x_max: 10,
        y_min: null,
        y_max: null,
        x_label: 'x',
        y_label: 'y',
        params: [
          { symbol: 'a', name: 'a', unit: '', value: 1, min: -5, max: 5, step: 0.1, role: 'input', provenance: 'user', confirmed: true },
          { symbol: 'b', name: 'b', unit: '', value: 0, min: -10, max: 10, step: 0.1, role: 'input', provenance: 'user', confirmed: true },
          { symbol: 'c', name: 'c', unit: '', value: 0, min: -10, max: 10, step: 0.1, role: 'input', provenance: 'user', confirmed: true },
        ],
        explanation: '',
        active: null,
      }
    case 'simulation':
      return {
        ...base,
        model: 'pendulum',
        params: [
          { symbol: 'L', name: 'L', unit: 'm', value: 1, min: 0.1, max: 3, step: 0.01, role: 'input', provenance: 'user', confirmed: true },
          { symbol: 'g', name: 'g', unit: 'm/s²', value: 9.81, min: 1, max: 25, step: 0.01, role: 'constant', provenance: 'assumption', confirmed: true },
          { symbol: 'theta0', name: 'θ₀', unit: '°', value: 10, min: 1, max: 80, step: 1, role: 'input', provenance: 'user', confirmed: true },
        ],
        object_asset_id: null,
        reference_cases: [{ inputs: { L: 1, g: 9.81 }, output: 'period', expected: 2.006, tolerance: 0.01 }],
        active: null,
        notes: '',
      }
    case 'algorithm':
      return { ...base, algorithm: 'bubble_sort', config: { array: [5, 2, 9, 1, 6] }, explanation: '' }
    case 'video':
      return { ...base, source_id: null, markers: [], compare: null, tracks: [], limits_note: '' }
    case 'field':
      return { ...base, sport: 'football', prompt: '', frames: [{ id: newId('f'), note: '', players: [], ball: { x: 0.5, y: 0.5 }, arrows: [] }], solution_frames: [] }
    case 'quiz':
      return { ...base, questions: [] }
    case 'widget':
      return { ...base, prompt: '', html: '', status: 'draft', validation: {}, approved: false }
    case 'board':
      // the title is what the clean sheet will carry: "Board notes" until the photo is read
      return {
        ...base,
        title: t('board.blankTitle'),
        image: { source_id: null, page: null, asset_id: null },
        surface: 'other',
        items: [],
        unreadable: '',
        visual: null,
        visual_proof: null,
        show: 'visual',
      }
    case 'text':
    default:
      return { ...base, type: 'text', body: '' }
  }
}

export function paramValues(params = []) {
  return Object.fromEntries(params.filter((p) => p && p.symbol).map((p) => [p.symbol, Number(p.value ?? p.min ?? 0)]))
}

export function findBlock(spec, blockId) {
  return (spec?.blocks || []).find((b) => b.id === blockId) || null
}

/** Human label for a SourceRef, e.g. "Trang 3 · ảnh_con_lắc.jpg". */
export function refLabel(ref, sources = [], t = (k) => k) {
  if (!ref) return ''
  const src = sources.find((s) => s.id === ref.source_id)
  const parts = []
  if (src) parts.push(src.title)
  if (ref.page) parts.push(`${t('sources.page')} ${ref.page}`)
  if (ref.time !== null && ref.time !== undefined) {
    const s = Math.round(ref.time)
    parts.push(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
  }
  return parts.join(' · ')
}
