import { describe, expect, it } from 'vitest'
import {
  altText,
  applyRead,
  arrowConditions,
  blankItem,
  boardViews,
  cropStyle,
  defaultView,
  drawChars,
  drawKey,
  highlightUncertain,
  isVisible,
  itemText,
  latexPlain,
  nextItemId,
  normalizeItems,
  photoPatch,
  proofCount,
  proofState,
  sheetParts,
  sheetTex,
  titleLine,
  uncertainCount,
  unsureStillIn,
  visibleLines,
  visualRequest,
} from './boardModel.js'

// The notebook page of the probe (scratchpad board/out/notebook.read.json), as the API returns it.
const EQUATION = '6CO_2 + 6H_2O \\xrightarrow[\\text{diệp lục}]{\\text{ánh sáng}} C_6H_{12}O_6 + 6O_2'
const notebook = {
  id: 'blk1',
  type: 'board',
  title: 'Quang hợp',
  image: { source_id: 'src1', page: null, asset_id: null },
  surface: 'notebook',
  items: [
    { id: 'b1', kind: 'heading', text: 'Quang hợp', bbox: [0.235, 0.198, 0.614, 0.275] },
    { id: 'b2', kind: 'equation', text: '6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂', latex: EQUATION, bbox: [0.187, 0.338, 0.875, 0.38] },
    { id: 'b3', kind: 'text', text: 'diệp lục tố??', struck: true },
    { id: 'b4', kind: 'bullet', text: 'xảy ra ở lục lạp', uncertain: ['lục lạp'] },
    { id: 'b5', kind: 'bullet', text: 'giải phóng khí oxi' },
    { id: 'b6', kind: 'text', text: 'cần CO2 ~??', struck: true },
    { id: 'b7', kind: 'diagram', text: 'Lá cây, mặt trời và đám mây', labels: ['CO₂', 'O₂'], bbox: [0.669, 0.429, 0.92, 0.706] },
  ],
}

describe('visible lines (what the clean sheet shows)', () => {
  it('writes the title once, leaves out crossed-out lines and drawings, adds the arrow words', () => {
    expect(visibleLines(notebook)).toEqual([
      'Quang hợp',
      '6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂',
      'ánh sáng',
      'diệp lục',
      'xảy ra ở lục lạp',
      'giải phóng khí oxi',
    ])
  })

  it('writes the title when no line repeats it (case, spaces and edge punctuation do not count)', () => {
    expect(titleLine('  Con lắc   đơn ', [{ kind: 'heading', text: 'CON LẮC ĐƠN:' }])).toBe('')
    expect(titleLine('Con lắc đơn', [{ kind: 'heading', text: 'Con lắc đơn', struck: true }])).toBe('Con lắc đơn')
    expect(titleLine('Con lắc đơn', [{ kind: 'diagram', text: 'Con lắc đơn' }])).toBe('Con lắc đơn')
    expect(visibleLines({ title: 'Con lắc đơn', items: [{ kind: 'formula', text: 'Chu kì: T = 2π√(l/g)', latex: 'T = 2\\pi\\sqrt{l/g}' }] })).toEqual([
      'Con lắc đơn',
      'Chu kì: T = 2π√(l/g)',
    ])
  })

  it('reads a formula without text from its LaTeX, and counts the characters a redraw writes', () => {
    const formula = { kind: 'formula', text: '', lead: 'Chu kì:', latex: 'T = 2\\pi\\sqrt{\\frac{l}{g}}' }
    expect(itemText(formula)).toBe('Chu kì: T = 2π√(l/g)')
    expect(isVisible(formula)).toBe(true)
    expect(isVisible({ kind: 'text', text: '   ' })).toBe(false)
    expect(isVisible({ kind: 'diagram', text: '', labels: ['m'] })).toBe(true)
    expect(drawChars({ title: 'Ab', items: [{ kind: 'text', text: 'cd' }] })).toBe(5)
  })

  it('builds alt text from the visible lines, then the drawings', () => {
    const alt = altText(notebook)
    expect(alt.startsWith('Quang hợp. 6CO₂')).toBe(true)
    expect(alt).toContain('Lá cây, mặt trời và đám mây (CO₂, O₂).')
    expect(alt).not.toContain('diệp lục tố')
    expect(altText({ title: 'x', items: [{ kind: 'text', text: 'a'.repeat(2000) }] }, 100)).toHaveLength(100)
  })
})

describe('LaTeX helpers (mirror backend services/board.py)', () => {
  it('finds the words over and under extensible arrows', () => {
    expect(arrowConditions(EQUATION)).toEqual([['ánh sáng', 'diệp lục']])
    expect(arrowConditions('A \\xrightarrow{t^o} B \\xleftarrow[x]{} C')).toEqual([
      ['t°', ''],
      ['', 'x'],
    ])
    expect(arrowConditions('T = 2\\pi')).toEqual([])
  })

  it('turns KaTeX into one readable line', () => {
    expect(latexPlain(EQUATION)).toBe('6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂')
    expect(latexPlain('v_{max} = \\omega A')).toBe('v_max = ω A')
    expect(latexPlain('\\constructor x')).toBe('constructor x')
  })

  it('sets a sheet formula inline at display size, so it can wrap after an operator', () => {
    expect(sheetTex(EQUATION)).toBe(`\\displaystyle ${EQUATION}`)
    expect(sheetTex('  T = 2\\pi\\sqrt{l/g} ')).toBe('\\displaystyle T = 2\\pi\\sqrt{l/g}')
    expect(sheetTex('')).toBe('')
    expect(sheetTex(null)).toBe('')
  })
})

describe('the Text view parts', () => {
  it('turns the heading that repeats the title into the title, groups bullets, hides struck lines', () => {
    const { title, parts } = sheetParts(notebook)
    expect(title).toBe('')
    expect(parts.map((p) => p.kind)).toEqual(['title', 'equation', 'bullets', 'diagram'])
    expect(parts[2].items.map((i) => i.id)).toEqual(['b4', 'b5'])
    expect(JSON.stringify(parts)).not.toContain('diệp lục tố')
  })

  it('keeps a separate title when no line says it', () => {
    const { title, parts } = sheetParts({ title: 'Bài 3', items: [{ id: 'b1', kind: 'heading', text: 'Ý chính' }] })
    expect(title).toBe('Bài 3')
    expect(parts[0].kind).toBe('heading')
  })
})

describe('unsure words', () => {
  it('marks whole words with their diacritics, in any case, every time they appear', () => {
    const parts = highlightUncertain('Lục lạp chứa diệp lục; lục lạp xanh', ['lục lạp'])
    expect(parts.filter((p) => p.unsure).map((p) => p.text)).toEqual(['Lục lạp', 'lục lạp'])
    expect(parts.map((p) => p.text).join('')).toBe('Lục lạp chứa diệp lục; lục lạp xanh')
  })

  it('does not mark a word inside a longer word, and prefers the longest match', () => {
    const parts = highlightUncertain('khối lượng m, mét', ['m', 'khối lượng m'])
    expect(parts.filter((p) => p.unsure).map((p) => p.text)).toEqual(['khối lượng m'])
    expect(highlightUncertain('lục', ['lụ']).some((p) => p.unsure)).toBe(false)
    expect(highlightUncertain('abc', [])).toEqual([{ text: 'abc', unsure: false }])
    expect(highlightUncertain('', ['a'])).toEqual([])
  })

  it('keeps only the unsure words still written, and counts those of visible lines', () => {
    expect(unsureStillIn('xảy ra ở lục lạp', ['lục lạp', 'lụe'])).toEqual(['lục lạp'])
    expect(uncertainCount(notebook.items)).toBe(1)
    expect(uncertainCount([{ kind: 'text', text: 'a b', uncertain: ['a', 'b'], struck: true }])).toBe(0)
  })
})

describe('the diagram crop (bbox to CSS background)', () => {
  it('scales the photo so the box fills the crop and keeps the box shape', () => {
    const style = cropStyle([0.5, 0.25, 0.75, 0.75], { width: 1000, height: 500 }, { pad: 0 })
    expect(style.backgroundSize).toBe('400% 200%')
    // p = start / (1 - size): 0.5 / 0.75 and 0.25 / 0.5
    expect(style.backgroundPosition).toBe('66.667% 50%')
    expect(style['--bd-crop-ratio']).toBe(1)
    expect(style.aspectRatio).toBe('0.5 / 0.5')
  })

  it('adds a margin inside the photo, assumes 4:3 until the size is known, and refuses bad boxes', () => {
    const style = cropStyle([0, 0, 0.5, 0.5], null)
    expect(style.backgroundPosition).toBe('0% 0%')
    expect(style['--bd-crop-ratio']).toBeCloseTo((0.515 * 4) / 3 / 0.515, 3)
    expect(cropStyle([0, 0, 1, 1], { width: 10, height: 10 }, { pad: 0 }).backgroundPosition).toBe('0% 0%')
    expect(cropStyle(null, null)).toBeNull()
    expect(cropStyle([0.4, 0.4, 0.4, 0.9], null)).toBeNull()
  })
})

describe('the view learners see first', () => {
  const drawn = { show: 'visual', visual: { asset_id: 'a1' } }
  it('follows the teacher, and falls back when a view is missing', () => {
    expect(defaultView(drawn, { views: ['visual', 'text', 'photo'] })).toBe('visual')
    expect(defaultView({ ...drawn, show: 'text' }, { views: ['visual', 'text', 'photo'] })).toBe('text')
    expect(defaultView(drawn, { views: ['text', 'photo'] })).toBe('text')
    expect(defaultView(drawn, { views: ['visual', 'photo'] })).toBe('visual')
    expect(defaultView({ show: 'text' }, { views: ['visual', 'photo'] })).toBe('visual')
    expect(defaultView(drawn, { views: ['photo'] })).toBe('photo')
    expect(defaultView(drawn, { views: [] })).toBeNull()
  })

  it('opens the Text view in a translated lesson: the redrawn picture keeps the original language', () => {
    expect(defaultView(drawn, { translated: true, views: ['visual', 'text', 'photo'] })).toBe('text')
  })

  it('lists the views in the header order', () => {
    expect(boardViews({ visual: true, text: true, photo: true })).toEqual(['visual', 'text', 'photo'])
    expect(boardViews({ text: true, photo: true })).toEqual(['text', 'photo'])
  })
})

describe('the drawn version and the proof', () => {
  it('changes the key when the text changes, not when an unsure flag or a box does', () => {
    const key = drawKey(notebook)
    const items = (patch, id = 'b4') => ({ ...notebook, items: notebook.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) })
    expect(drawKey(items({ uncertain: [] }))).toBe(key)
    expect(drawKey(items({ bbox: [0, 0, 1, 1] }))).toBe(key)
    expect(drawKey(items({ text: 'xảy ra ở lục lạp.' }))).not.toBe(key)
    expect(drawKey(items({ struck: false }, 'b3'))).not.toBe(key)
    expect(drawKey({ ...notebook, title: 'Quang hợp 2' })).not.toBe(key)
  })

  it('reads the proof state and counts what differs', () => {
    expect(proofState(null)).toBe('unchecked')
    expect(proofState({ checked: true, ok: true })).toBe('ok')
    const proof = { checked: true, ok: false, differences: [{ expected: 'lục lạp', found: 'lục lap' }], missing: [], extra: ['diệp lục tố??', ' '] }
    expect(proofState(proof)).toBe('issues')
    expect(proofCount(proof)).toBe(2)
  })
})

describe('a reading becomes the block', () => {
  const res = {
    image: { source_id: 'src1', page: null, asset_id: null },
    surface: 'whiteboard',
    title: 'Con lắc đơn',
    items: [
      { id: 'b1', kind: 'heading', text: 'Con lắc đơn', bbox: [0.5, 0.2, 0.1, 0.1] },
      { id: 'b1', kind: 'mystery', text: 'x'.repeat(2500), uncertain: ['', 'x'] },
    ],
    unreadable: '  dao động…  ',
  }

  it('takes the read title over a default one, keeps the teacher’s own, and flags AI work', () => {
    const blank = { id: 'k', type: 'board', title: 'Board notes', image: { source_id: 'src1' }, items: [], visual: { asset_id: 'old' } }
    const next = applyRead(blank, res, { defaultTitles: ['Bảng ghi', 'Board notes'] })
    expect(next.title).toBe('Con lắc đơn')
    expect(next.surface).toBe('whiteboard')
    expect(next.unreadable).toBe('dao động…')
    expect(next.ai_generated).toBe(true)
    expect(next.confirmed).toBe(false)
    expect(next.visual).toEqual({ asset_id: 'old' })
    expect(applyRead({ ...blank, title: 'Tiết 12' }, res, { defaultTitles: ['Board notes'] }).title).toBe('Tiết 12')
  })

  it('normalizes the items: unique ids, known kinds, schema limits, sorted boxes', () => {
    const items = normalizeItems(res.items)
    expect(items.map((i) => i.id)).toEqual(['b1', 'b2'])
    expect(items[1].kind).toBe('text')
    expect(items[1].text).toHaveLength(2000)
    expect(items[1].uncertain).toEqual(['x'])
    expect(items[0].bbox).toEqual([0.1, 0.1, 0.5, 0.2])
  })

  it('starts a new board for a new photo and numbers new lines after the last one', () => {
    expect(photoPatch({ source_id: 's2', page: 3 })).toEqual({ image: { source_id: 's2', page: 3, asset_id: null }, items: [], unreadable: '', visual: null, visual_proof: null })
    expect(nextItemId([{ id: 'b2' }, { id: 'b9' }, { id: 'x' }])).toBe('b10')
    expect(blankItem([{ id: 'b1' }], 'note')).toMatchObject({ id: 'b2', kind: 'note', text: '', struck: false })
  })

  it('sends the confirmed reading to the redraw in the schema’s shape', () => {
    const body = visualRequest(notebook)
    expect(body).toMatchObject({ source_id: 'src1', page: null, title: 'Quang hợp', surface: 'notebook' })
    expect(body.items).toHaveLength(7)
    expect(body.items[2]).toMatchObject({ id: 'b3', struck: true, labels: [], lead: '' })
  })
})
