import { describe, expect, it } from 'vitest'
import { collectIdMap, hiddenContent, pairListIds, publicSpec, remapIds } from './publicSpec.js'

const spec = {
  summary: 'Con lắc',
  glossary: [{ id: 'g1', vi: 'chu kỳ', en: 'period' }],
  blocks: [
    { id: 'b1', type: 'text', body: 'Hi' },
    {
      id: 'q1',
      type: 'quiz',
      questions: [
        { id: 'a', prompt: 'A?', approved: true },
        { id: 'b', prompt: 'B?', approved: false },
      ],
    },
    { id: 'q2', type: 'quiz', questions: [{ id: 'c', prompt: 'C?', approved: false }] },
    { id: 'w1', type: 'widget', approved: true, status: 'validated' },
    { id: 'w2', type: 'widget', approved: true, status: 'draft' },
    { id: 'w3', type: 'widget', approved: false, status: 'validated' },
    {
      id: 'v1',
      type: 'video',
      source_id: 's1',
      markers: [
        { id: 'm1', t: 1, label: 'teacher', ai_suggested: false, confirmed: false },
        { id: 'm2', t: 2, label: 'ai ok', ai_suggested: true, confirmed: true },
        { id: 'm3', t: 3, label: 'ai unconfirmed', ai_suggested: true, confirmed: false },
      ],
    },
  ],
}

describe('publicSpec', () => {
  it('keeps exactly what the server publishes', () => {
    const out = publicSpec(spec)
    expect(out.blocks.map((b) => b.id)).toEqual(['b1', 'q1', 'w1', 'v1'])
    expect(out.blocks[1].questions.map((q) => q.id)).toEqual(['a'])
    expect(out.blocks[3].markers.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(out.summary).toBe('Con lắc')
    expect(out.glossary).toHaveLength(1)
  })

  it('does not mutate the input', () => {
    const copy = JSON.parse(JSON.stringify(spec))
    publicSpec(spec)
    expect(spec).toEqual(copy)
  })

  it('handles empty input', () => {
    expect(publicSpec(null).blocks).toEqual([])
    expect(publicSpec({}).blocks).toEqual([])
  })

  it('counts what is hidden from learners', () => {
    expect(hiddenContent(spec)).toEqual({ questions: 2, quizzes: 1, widgets: 2, markers: 1, total: 6 })
    expect(hiddenContent({ blocks: [] }).total).toBe(0)
  })
})

describe('id remapping for translated copies', () => {
  const original = {
    blocks: [
      { id: 'b1', type: 'diagram', image: { source_id: 'S1', asset_id: 'A1' }, source_refs: [{ source_id: 'S1', page: 2 }] },
      { id: 'b2', type: 'simulation', object_asset_id: 'A2' },
    ],
  }
  const copy = {
    blocks: [
      { id: 'b1', type: 'diagram', image: { source_id: 'T1', asset_id: 'B1' }, source_refs: [{ source_id: 'T1', page: 2 }] },
      { id: 'b2', type: 'simulation', object_asset_id: 'B2' },
    ],
  }

  it('collects pairs from parallel specs', () => {
    expect(collectIdMap(original, copy)).toEqual({ S1: 'T1', A1: 'B1', A2: 'B2' })
  })

  it('pairs list ids by position when kinds match', () => {
    const map = pairListIds([{ id: 'S9', kind: 'pdf' }], [{ id: 'T9', kind: 'pdf' }])
    expect(map).toEqual({ S9: 'T9' })
    expect(pairListIds([{ id: 'S9', kind: 'pdf' }], [{ id: 'T9', kind: 'image' }])).toEqual({})
    expect(pairListIds([{ id: 'S9', kind: 'pdf' }], [])).toEqual({})
  })

  it('remaps a translated spec onto the copy ids', () => {
    const translated = {
      summary: 'Pendulum',
      blocks: [
        { id: 'b1', type: 'diagram', title: 'Parts', image: { source_id: 'S1', asset_id: 'A1' }, source_refs: [{ source_id: 'S1', page: 2 }] },
        { id: 'b2', type: 'simulation', object_asset_id: 'A2', note: 'S1' },
      ],
    }
    const out = remapIds(translated, { S1: 'T1', A1: 'B1', A2: 'B2' })
    expect(out.blocks[0].image).toEqual({ source_id: 'T1', asset_id: 'B1' })
    expect(out.blocks[0].source_refs[0].source_id).toBe('T1')
    expect(out.blocks[1].object_asset_id).toBe('B2')
    expect(out.blocks[1].note).toBe('T1') // any string equal to an id, like the server
    expect(out.blocks[0].title).toBe('Parts')
    expect(translated.blocks[0].image.source_id).toBe('S1') // input untouched
  })
})
