import { describe, expect, it } from 'vitest'
import {
  applyProposal,
  canSelfTest,
  hotspotShape,
  isSameLabel,
  labelChoices,
  markerPosition,
  nextPartLabel,
  proposalFromAi,
  relationLines,
  removeHotspot,
  selfTestOrder,
} from './diagramLogic.js'

function seeded(seed = 3) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

const parts = [
  { id: 'h1', label: 'Bóng', bbox: [0.64, 0.72, 0.67, 0.75] },
  { id: 'h2', label: 'Cẳng tay', bbox: [0.59, 0.7, 0.65, 0.76] },
  { id: 'h3', label: 'Chân', bbox: [0.56, 0.75, 0.62, 0.85] },
  { id: 'h4', label: 'cẳng tay ', bbox: [0.3, 0.7, 0.4, 0.76] },
  { id: 'h5', label: '', bbox: [0.1, 0.1, 0.2, 0.2] },
]

describe('shapes', () => {
  it('prefers the SAM mask and falls back to the box', () => {
    expect(hotspotShape({ mask_path: 'M1 1 L2 2 Z', bbox: [0, 0, 1, 1] })).toEqual({ kind: 'path', d: 'M1 1 L2 2 Z' })
    const rect = hotspotShape({ bbox: [0.1, 0.2, 0.3, 0.6] })
    expect(rect.kind).toBe('rect')
    expect(rect.x).toBeCloseTo(100)
    expect(rect.y).toBeCloseTo(200)
    expect(rect.w).toBeCloseTo(200)
    expect(rect.h).toBeCloseTo(400)
    expect(hotspotShape({ bbox: null })).toBeNull()
    expect(markerPosition({ bbox: [0, 0, 0.2, 0.2] })).toEqual({ left: 3, top: 3 })
  })
})

describe('self-test', () => {
  it('needs two distinct names', () => {
    expect(canSelfTest(parts)).toBe(true)
    expect(canSelfTest([parts[1], parts[3]])).toBe(false)
    expect(canSelfTest([parts[0]])).toBe(false)
  })

  it('asks only about named parts', () => {
    const order = selfTestOrder(parts, seeded())
    expect(order).toHaveLength(4)
    expect(order).not.toContain('h5')
  })

  it('offers distinct choices that include the right answer', () => {
    for (let seed = 1; seed < 20; seed += 1) {
      const choices = labelChoices(parts, 'h2', seeded(seed))
      expect(choices.filter((c) => c.correct)).toHaveLength(1)
      expect(choices.find((c) => c.correct).label).toBe('Cẳng tay')
      const labels = choices.map((c) => c.label.toLowerCase().trim())
      expect(new Set(labels).size).toBe(labels.length)
      expect(labels).not.toContain('')
      expect(choices.length).toBeLessThanOrEqual(4)
    }
    expect(labelChoices(parts, 'missing')).toEqual([])
    expect(isSameLabel(' Cẳng tay', 'cẳng tay')).toBe(true)
  })
})

describe('AI proposals', () => {
  const result = {
    image_width: 1100,
    image_height: 1500,
    hotspots: [
      { id: 'h1', label: 'Bóng', description_simple: 'Quả bóng', bbox: [0.64, 0.72, 0.67, 0.75] },
      { id: 'h2', label: 'Tay', description_simple: '', bbox: null },
      { id: 'h3', label: 'Đầu', bbox: [0.57, 0.66, 0.61, 0.7] },
    ],
    relations: [
      { id: 'r1', source: 'h1', target: 'h3', label: 'chạm' },
      { id: 'r2', source: 'h1', target: 'gone', label: 'x' },
    ],
    masks: {
      h1: { id: 'o1', box: [704, 1080, 736, 1112], mask: { encoding: 'lossless', payload: 'x', width: 33, height: 33 } },
      h2: { id: 'o2', box: [600, 1050, 700, 1140], mask: null },
    },
  }
  const toPath = () => 'M704.4 1080.6 L736.2 1112.9 Z'
  const toBox = (box, w, h) => [box[0] / w, box[1] / h, (box[2] + 1) / w, (box[3] + 1) / h]

  it('turns masks into compact paths and recovers boxes from SAM', () => {
    const proposal = proposalFromAi(result, toPath, toBox)
    expect(proposal.map((h) => h.id)).toEqual(['h1', 'h2', 'h3'])
    expect(proposal[0].mask_path).toBe('M704 1081 L736 1113 Z')
    expect(proposal[1].bbox[0]).toBeCloseTo(600 / 1100, 3)
    expect(proposal[1].mask_path).toBeNull()
    expect(proposal[2].mask_path).toBeNull()
  })

  it('survives a mask decoder failure', () => {
    const proposal = proposalFromAi(result, () => {
      throw new Error('bad mask')
    })
    expect(proposal[0].mask_path).toBeNull()
    expect(proposal).toHaveLength(2)
  })

  it('merges with renamed ids and keeps relations consistent', () => {
    let n = 0
    const makeId = (p) => `${p}_new${(n += 1)}`
    const proposal = { hotspots: proposalFromAi(result, toPath, toBox), relations: result.relations }
    const block = { hotspots: [{ id: 'h1', label: 'Cũ', bbox: [0, 0, 0.1, 0.1] }], relations: [{ id: 'r1', source: 'h1', target: 'h1' }] }
    const merged = applyProposal(block, proposal, { include: new Set(['h1', 'h3']) }, makeId)
    expect(merged.hotspots).toHaveLength(3)
    expect(merged.hotspots[0].label).toBe('Cũ')
    const newBall = merged.hotspots[1]
    expect(newBall.id).not.toBe('h1')
    const rel = merged.relations.find((r) => r.label === 'chạm')
    expect(rel.source).toBe(newBall.id)
    expect(rel.target).toBe('h3')
    expect(rel.id).not.toBe('r1')
    expect(merged.added).toBe(2)

    const replaced = applyProposal(block, proposal, { replace: true }, makeId)
    expect(replaced.hotspots.map((h) => h.id)).toEqual(['h1', 'h2', 'h3'])
    expect(replaced.relations).toHaveLength(1)
    expect(replaced.relations[0].id).toBe('r1')
  })

  it('respects the hotspot limit', () => {
    const many = { hotspots: Array.from({ length: 45 }, (_, i) => ({ id: `p${i}`, label: `P${i}`, bbox: [0, 0, 0.1, 0.1] })), relations: [] }
    const merged = applyProposal({ hotspots: [], relations: [] }, many, {}, (p) => `${p}x`)
    expect(merged.hotspots).toHaveLength(40)
    expect(merged.truncated).toBe(true)
  })
})

describe('relations', () => {
  it('draws arrows between part borders in uniform space', () => {
    const hotspots = [
      { id: 'a', bbox: [0.1, 0.1, 0.2, 0.2] },
      { id: 'b', bbox: [0.6, 0.1, 0.8, 0.2] },
    ]
    const [line] = relationLines([{ id: 'r', source: 'a', target: 'b' }], hotspots, 2)
    expect(line.x1).toBeCloseTo(200)
    expect(line.x2).toBeCloseTo(600)
    expect(line.y1).toBeCloseTo(75)
    expect(line.mx).toBeCloseTo(0.4)
    expect(line.my).toBeCloseTo(0.15)
    expect(relationLines([{ id: 'r', source: 'a', target: 'zz' }], hotspots, 1)).toEqual([])
  })

  it('keeps direction for overlapping parts', () => {
    const hotspots = [
      { id: 'a', bbox: [0.1, 0.1, 0.5, 0.5] },
      { id: 'b', bbox: [0.2, 0.2, 0.6, 0.6] },
    ]
    const [line] = relationLines([{ id: 'r', source: 'a', target: 'b' }], hotspots, 1)
    expect(line.x2).toBeGreaterThan(line.x1)
  })

  it('removes relations with their part', () => {
    const block = { hotspots: [{ id: 'a' }, { id: 'b' }], relations: [{ id: 'r', source: 'a', target: 'b' }] }
    expect(removeHotspot(block, 'a')).toEqual({ hotspots: [{ id: 'b' }], relations: [] })
  })

  it('names new parts without clashes', () => {
    expect(nextPartLabel([{ label: 'Bộ phận 2' }], 'Bộ phận')).toBe('Bộ phận 3')
    expect(nextPartLabel([{ label: 'x' }, { label: 'Part 3' }], 'Part')).toBe('Part 4')
  })
})
