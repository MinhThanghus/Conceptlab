import { describe, expect, it } from 'vitest'
import { chunkItems, COMBINE_LIMIT, createLessonSlides, isContentText, splitLessonText } from './lessonSlides.js'

describe('learner slide descriptors', () => {
  it('preserves block order, every step, optional questions and meaningful edges', () => {
    const blocks = [
      { id: 'n', type: 'text', body: 'First paragraph.\n\nSecond paragraph.' },
      { id: 's', type: 'steps', steps: [{ id: 'a', body: 'one', check_question: 'Why?' }, { id: 'b', body: 'two', check_question: '  ' }] },
      { id: 'f', type: 'flow', nodes: [{ id: 'n1' }, { id: 'n2' }], edges: [{ id: 'e1', source: 'n1', target: 'n2', label: 'then' }, { id: 'e2', source: 'n2', target: 'n1', description: 'returns' }, { id: 'e3', source: 'n1', target: 'n2', label: '', description: '' }] },
      { id: 'v', type: 'text', body: 'A 3D scene', visual3d: 'circulation' },
      { id: 'q', type: 'quiz', questions: [] }, { id: 'x', type: 'unknown' },
    ]
    const original = structuredClone(blocks), slides = createLessonSlides(blocks)
    expect(slides.map(({ kind }) => kind)).toEqual(['text', 'step', 'step', 'flow-group', 'block', 'block', 'block'])
    expect(slides.map(({ blockId }) => blockId)).toEqual(['n', 's', 's', 'f', 'v', 'q', 'x'])
    expect(slides.filter((s) => s.kind === 'step').map((s) => [s.index, s.itemId])).toEqual([[0, 'a'], [1, 'b']])
    expect(slides.find((s) => s.kind === 'flow-group')).toMatchObject({ nodeIds: ['n1', 'n2'], nodeIndexes: [0, 1], edgeIds: ['e1', 'e2', 'e3'], edgeIndexes: [0, 1, 2] })
    expect(slides.find((s) => s.kind === 'step' && s.index === 0).phase).toBe('combined')
    expect(new Set(slides.map((s) => s.id)).size).toBe(slides.length)
    expect(blocks).toEqual(original)
  })
  it('keeps the ordering exercise when confirmed and excludes invalid graph edges', () => {
    const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const flow = { id: 'f', type: 'flow', nodes: [{ id: 'a' }, { id: 'b' }], edges: [
      { id: 'bad', source: 'a', target: 'missing', label: 'bad' },
      { id: 'loop', source: 'a', target: 'a', label: 'self' },
      { id: 'good', source: 'a', target: 'b', description: 'connects' },
    ] }
    const block = { id: 's', type: 'steps', sequence_confirmed: true, steps }
    const slides = createLessonSlides([block, flow])
    expect(slides.filter((s) => s.blockId === 's').map((s) => s.kind)).toEqual(['step', 'step', 'step', 'step-practice'])
    expect(slides.find((s) => s.kind === 'flow-group')).toMatchObject({ edgeIds: ['good'], edgeIndexes: [2] })
    expect(createLessonSlides([{ ...block, sequence_confirmed: false }]).some((s) => s.kind === 'step-practice')).toBe(false)
    expect(createLessonSlides([{ ...block, steps: steps.slice(0, 2) }]).some((s) => s.kind === 'step-practice')).toBe(false)
  })
  it('puts three short paper nodes on one slide and preserves every connector exactly once', () => {
    const nodes = Array.from({ length: 3 }, (_, i) => ({ id: `n${i}`, label: `Stage ${i}`, description: `Paper description ${i}.` }))
    const edges = nodes.slice(0, 2).map((node, i) => ({ id: `e${i}`, source: node.id, target: nodes[i + 1].id, label: i === 1 ? 'causes' : '', description: i === 0 ? 'Evidence here.' : '', source_refs: [{ source_id: 'paper' }] }))
    const slides = createLessonSlides([{ id: 'paperflow', type: 'flow', nodes, edges }])
    expect(slides).toHaveLength(1)
    expect(slides[0]).toMatchObject({ kind: 'flow-group', nodeIds: ['n0', 'n1', 'n2'], edgeIds: ['e0', 'e1'], edgeIndexes: [0, 1] })
    // a fourth stage brings an overview and two sheets of two, never three and a lone one
    const four = [...nodes, { id: 'n3', label: 'Stage 3', description: 'Paper description 3.' }]
    const more = createLessonSlides([{ id: 'paperflow', type: 'flow', nodes: four, edges: [...edges, { id: 'e2', source: 'n2', target: 'n3' }] }])
    expect(more.map((s) => s.kind)).toEqual(['flow-overview', 'flow-group', 'flow-group'])
    expect(more.slice(1).map((s) => s.nodeIds)).toEqual([['n0', 'n1'], ['n2', 'n3']])
    expect(more.slice(1).flatMap((s) => s.edgeIds)).toEqual(['e0', 'e1', 'e2'])
  })
  it('balances short nodes across stable groups, with every described cross-group edge assigned', () => {
    const nodes = Array.from({ length: 7 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}`, description: 'Explanation.' }))
    const edges = nodes.slice(0, 6).map((node, i) => ({ id: `e${i}`, source: node.id, target: nodes[i + 1].id, label: `edge ${i}`, description: 'meaning' }))
    const block = { id: 'big', type: 'flow', nodes, edges }
    const slides = createLessonSlides([block]), groups = slides.filter((s) => s.kind === 'flow-group')
    expect(slides[0].kind).toBe('flow-overview')
    expect(groups.map((g) => g.nodeIds.length)).toEqual([3, 2, 2])
    expect(groups.flatMap((g) => g.nodeIds)).toEqual(nodes.map((n) => n.id))
    expect(groups.flatMap((g) => g.edgeIds)).toEqual(edges.map((e) => e.id))
    expect(new Set(groups.map((g) => g.id)).size).toBe(groups.length)
    expect(createLessonSlides([block]).map((s) => s.id)).toEqual(slides.map((s) => s.id))
  })
  it('keeps a group sheet near 480 characters, counting each stage with its outgoing links', () => {
    const stage = (id, length) => ({ id, label: `Stage ${id}`, description: 'd'.repeat(length) })
    const groupsOf = (nodes, edges = []) => createLessonSlides([{ id: 'f', type: 'flow', nodes, edges }]).filter((s) => s.kind === 'flow-group').map((s) => s.nodeIds)
    const nodes = [stage('a', 200), stage('b', 200), stage('c', 200)]
    // two stages of about 200 characters share a sheet; a third would pass the budget
    expect(groupsOf(nodes)).toEqual([['a', 'b'], ['c']])
    // a long link counts toward the stage it leaves
    expect(groupsOf(nodes, [{ id: 'ab', source: 'a', target: 'b', label: 'leads to', description: 'x'.repeat(300) }])).toEqual([['a'], ['b', 'c']])
    // stages of about 300 characters, as in the water cycle, each get a sheet
    expect(groupsOf(Array.from({ length: 5 }, (_, i) => stage(`w${i}`, 290)))).toEqual([['w0'], ['w1'], ['w2'], ['w3'], ['w4']])
  })
  it('splits long explanations or questions instead of duplicating a combined question', () => {
    const short = { id: 'short', title: 'Short', body: 'A short explanation.', check_question: 'Why?' }
    const long = { id: 'long', title: 'Long', body: 'x'.repeat(640), check_question: 'What happens next?' }
    const graphic = { id: 'figure', body: 'x'.repeat(547), check_question: 'Why?', highlight: { source_id: 'a' } }
    const slides = createLessonSlides([{ id: 'steps', type: 'steps', steps: [short, long, graphic] }])
    expect(slides.map((s) => [s.kind, s.itemId, s.phase])).toEqual([
      ['step', 'short', 'combined'], ['step', 'long', 'explain'], ['step-question', 'long', undefined], ['step', 'figure', 'explain'], ['step-question', 'figure', undefined],
    ])
  })
  it('splits prose at safe boundaries without changing a character', () => {
    const text = `${'A meaningful sentence. '.repeat(25)}\n\n## New heading\n${'Another sentence. '.repeat(30)}`
    const pages = splitLessonText(text, 300)
    expect(pages.length).toBeGreaterThan(2)
    expect(pages.join('')).toBe(text)
    expect(pages.every((p) => p.length <= 300)).toBe(true)
    expect(pages.some((p) => p.includes('## New heading'))).toBe(true)
    const slides = createLessonSlides([{ id: 'text', type: 'text', body: text.repeat(3) }])
    expect(slides.map((s) => s.body).join('')).toBe(text.repeat(3))
    expect(slides.map((s) => s.page)).toEqual(slides.map((_, i) => i))
    expect(slides.every((s) => s.pageCount === slides.length)).toBe(true)
  })
  it('keeps equations and code intact and lets an unsplittable item overflow', () => {
    const math = `$$${'x + y = z '.repeat(120)}$$`, code = '```python\n' + 'x = y + z\n'.repeat(110) + '```'
    const text = `Introduction. ${math}\n\n${code}\n\n$E=mc^2$ and \`some code\` and **bold text**. Afterward.`
    const pages = splitLessonText(text, 120)
    expect(pages.join('')).toBe(text)
    for (const protectedText of [math, code, '$E=mc^2$', '`some code`', '**bold text**']) expect(pages.filter((p) => p.includes(protectedText))).toHaveLength(1)
    expect(pages.some((p) => p.length > 120)).toBe(true)
    expect(splitLessonText('x'.repeat(1200), 100)).toEqual(['x'.repeat(1200)])
  })
  it('does not break inline formatting or links across pages', () => {
    const link = '[source](https://example.com/a-b-c)', emph = '*a very long italic phrase*'
    const text = `${'Words '.repeat(16)}${link} ${emph} end.`
    const pages = splitLessonText(text, 100)
    expect(pages.join('')).toBe(text)
    expect(pages.filter((p) => p.includes(link))).toHaveLength(1)
    expect(pages.filter((p) => p.includes(emph))).toHaveLength(1)
  })
  it('splits a dense step with a figure sooner than one without', () => {
    const body = 'y'.repeat(COMBINE_LIMIT.figure + 10)
    const withFigure = { id: 'f', body, check_question: 'Why?', highlight: { source_id: 'a' } }
    const textOnly = { id: 't', body, check_question: 'Why?' }
    const slides = createLessonSlides([{ id: 'steps', type: 'steps', steps: [withFigure, textOnly] }])
    expect(slides.map((s) => [s.kind, s.itemId, s.phase])).toEqual([
      ['step', 'f', 'explain'], ['step-question', 'f', undefined], ['step', 't', 'combined'],
    ])
    expect(COMBINE_LIMIT.figure).toBeLessThan(COMBINE_LIMIT.text)
    expect(COMBINE_LIMIT.text).toBeLessThanOrEqual(450)
  })
  it('pages a teacher note at about six hundred characters', () => {
    const text = 'Một câu ngắn trong ghi chú. '.repeat(60)
    const slides = createLessonSlides([{ id: 'note', type: 'text', body: text }])
    expect(slides.length).toBeGreaterThan(2)
    expect(slides.every((s) => s.body.length <= 600)).toBe(true)
    expect(slides.map((s) => s.body).join('')).toBe(text)
  })
  it('keeps empty text and empty steps addressable', () => {
    expect(createLessonSlides(null)).toEqual([])
    expect(createLessonSlides([{ id: 'empty', type: 'text', body: '' }, { id: 'steps', type: 'steps', steps: [] }])).toEqual([
      { id: 'empty:text:0', blockId: 'empty', kind: 'text', body: '', page: 0, pageCount: 1 },
      { id: 'steps:block:0', blockId: 'steps', kind: 'block' },
    ])
  })
})

describe('whole-item chunks for goals and assumptions', () => {
  const goals = (n) => Array.from({ length: n }, (_, i) => `Goal ${i + 1}`)
  it('never splits or drops an item and keeps the order', () => {
    for (let n = 1; n <= 13; n += 1) {
      const chunks = chunkItems(goals(n), { max: 4 })
      expect(chunks.flat()).toEqual(goals(n))
      expect(chunks.every((chunk) => chunk.length >= 1 && chunk.length <= 4)).toBe(true)
    }
  })
  it('balances the chunks instead of leaving a lone item', () => {
    expect(chunkItems(goals(5), { max: 4 }).map((c) => c.length)).toEqual([3, 2])
    expect(chunkItems(goals(6), { max: 4 }).map((c) => c.length)).toEqual([3, 3])
    expect(chunkItems(goals(7), { max: 4 }).map((c) => c.length)).toEqual([4, 3])
    expect(chunkItems(goals(9), { max: 4 }).map((c) => c.length)).toEqual([3, 3, 3])
    expect(chunkItems(goals(4), { max: 4 }).map((c) => c.length)).toEqual([4])
  })
  it('starts a new chunk when the text budget is spent, an over-long item standing alone', () => {
    const items = ['a'.repeat(300), 'b'.repeat(300), 'c'.repeat(900), 'd']
    const chunks = chunkItems(items, { max: 4, budget: 520 })
    expect(chunks).toEqual([[items[0]], [items[1]], [items[2]], [items[3]]])
    expect(chunks.flat()).toEqual(items)
  })
  it('handles empty and missing lists', () => {
    expect(chunkItems([])).toEqual([])
    expect(chunkItems(null)).toEqual([])
    expect(chunkItems(['only'])).toEqual([['only']])
  })
})

describe('a part description as content or as an instruction', () => {
  it('reads a description as content unless its first word is an interface verb', () => {
    for (const text of ['Máu đi hai vòng nối tiếp: vòng nhỏ lên phổi lấy oxy.', 'Pressure rises as the gas warms.', 'Useful when the angle is small.', '3 câu hỏi theo chân một giọt nước.']) expect(isContentText(text)).toBe(true)
    for (const text of ['Bấm vào một ô để xem giải thích.', 'BẤM vào một ô.', '  nhấn Chạy luồng.', 'Kéo thanh trượt.', 'Chọn một bộ phận.', 'Chạm vào hình.', 'Dùng thanh trượt.', 'Xem chậm động tác mẫu.',
      'Click a box.', 'Tap a part.', 'Drag the slider.', 'Select a stage.', 'Use the slider.', 'Press “Run the flow” to watch it move.', 'Choose a part.', 'Watch the video.', '“Bấm” vào một ô.']) {
      expect(isContentText(text)).toBe(false)
    }
    // typed with combining marks (NFD), the verb is still an instruction
    expect(isContentText('Bấm vào hình.'.normalize('NFD'))).toBe(false)
    expect(isContentText('Nhấn giữ'.normalize('NFD').toUpperCase())).toBe(false)
    for (const empty of ['', '   ', null, undefined]) expect(isContentText(empty)).toBe(false)
  })
})
