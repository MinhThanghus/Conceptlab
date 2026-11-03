import { describe, expect, it } from 'vitest'
import {
  conciseBlockTitle,
  attentionExampleBlock,
  candidateTarget,
  defaultPageText,
  findItem,
  firstRef,
  formatElapsed,
  formatPageRanges,
  hasPaperContent,
  isAttentionRelated,
  itemPage,
  modelLabel,
  parseNumberInput,
  parsePageRanges,
  prepareBlockForLab,
  samePageItems,
  sanitizeEquation,
  selectionText,
  splitVariables,
  tocRanges,
} from './paperUtils.js'

const paper = {
  title: 'Attention Is All You Need (excerpt)',
  sections: [{ id: 's1', title: '3.2 Attention', page_start: 1, page_end: 2 }],
  equations: [
    {
      id: 'eq1',
      label: '(1)',
      latex: '\\mathrm{Attention}(Q,K,V)=\\mathrm{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V',
      variables: [
        { symbol: 'd_k', meaning: 'key dimension', unit: '', known_value: 64, provenance: 'document' },
        { symbol: 'Q', meaning: 'queries', unit: '', known_value: null, provenance: 'document' },
      ],
      source_refs: [{ source_id: 'src1', page: 1, bbox: [0.1, 0.4, 0.9, 0.45], located: 'exact' }],
    },
    { id: 'eq2', label: '(2)', latex: '\\mathrm{MultiHead}(Q,K,V)', source_refs: [{ source_id: 'src1', page: 2, located: 'approximate' }] },
  ],
  figures: [{ id: 'fig2', label: 'Figure 2', caption: 'Scaled Dot-Product Attention', source_refs: [{ source_id: 'src1', page: 2, located: 'none' }] }],
  tables: [{ id: 't1', label: 'Table 1', caption: 'Complexity', columns: ['Layer', 'Complexity'], rows: [['Self-Attention', 'O(n^2 d)']], source_refs: [] }],
  methods: [],
  candidates: [
    { id: 'c1', kind: 'equation', ref_id: 'eq1', title: 'Scaled dot-product attention', suggestion: 'algorithm' },
    { id: 'c2', kind: 'algorithm', ref_id: 'fig2', title: 'Multi-head', suggestion: 'flow' },
    { id: 'c3', kind: 'figure', ref_id: 'missing', title: 'Ghost', suggestion: 'none' },
  ],
}

describe('page selection', () => {
  it('defaults to the first 15 pages, or all pages of a short paper', () => {
    expect(defaultPageText(40)).toBe('1-15')
    expect(defaultPageText(3)).toBe('1-3')
    expect(defaultPageText(1)).toBe('1')
    expect(defaultPageText(undefined)).toBe('1-15')
  })

  it('parses ranges, single pages, en dashes and spaces', () => {
    expect(parsePageRanges('1-3, 5', 10)).toEqual({ pages: [1, 2, 3, 5], error: null })
    expect(parsePageRanges('2 – 4;7 8', 10).pages).toEqual([2, 3, 4, 7, 8])
    expect(parsePageRanges('5-3', 10).pages).toEqual([3, 4, 5])
    expect(parsePageRanges('3, 3, 1-2', 10).pages).toEqual([1, 2, 3])
  })

  it('reports empty, syntax, range and too-many errors', () => {
    expect(parsePageRanges('  ', 10).error).toEqual({ code: 'empty' })
    expect(parsePageRanges('1-3, abc', 10).error).toEqual({ code: 'syntax', token: 'abc' })
    expect(parsePageRanges('0-2', 10).error).toMatchObject({ code: 'range', page: 0 })
    expect(parsePageRanges('8-12', 10).error).toMatchObject({ code: 'range', page: 12, count: 10 })
    expect(parsePageRanges('1-40', 100, 30).error).toEqual({ code: 'tooMany', count: 40, max: 30 })
  })

  it('formats pages back into compact ranges', () => {
    expect(formatPageRanges([1, 2, 3, 5, 7, 8])).toBe('1-3, 5, 7-8')
    expect(formatPageRanges([4], { dash: '–' })).toBe('4')
    expect(formatPageRanges([3, 1, 2], { dash: '–' })).toBe('1–3')
    expect(formatPageRanges([])).toBe('')
  })

  it('derives top-level outline ranges from the PDF table of contents', () => {
    const toc = [
      { level: 1, title: 'Introduction', page: 1 },
      { level: 2, title: 'Background', page: 2 },
      { level: 1, title: 'Model', page: 3 },
      { level: 1, title: 'Results', page: 3 },
      { level: 1, title: 'Conclusion', page: 9 },
    ]
    expect(tocRanges(toc, 10)).toEqual([
      { title: 'Introduction', from: 1, to: 2 },
      { title: 'Model', from: 3, to: 3 },
      { title: 'Results', from: 3, to: 8 },
      { title: 'Conclusion', from: 9, to: 10 },
    ])
    expect(tocRanges([], 5)).toEqual([])
    expect(tocRanges(null, 5)).toEqual([])
  })
})

describe('paper structure helpers', () => {
  it('finds items, refs and pages', () => {
    expect(hasPaperContent(paper)).toBe(true)
    expect(hasPaperContent({ title: 'x' })).toBe(false)
    expect(findItem(paper, 'equations', 'eq2').label).toBe('(2)')
    expect(findItem(paper, 'equations', 'nope')).toBeNull()
    expect(firstRef(paper.equations[0]).page).toBe(1)
    expect(firstRef({ source_refs: [] })).toBeNull()
    expect(itemPage('sections', paper.sections[0])).toBe(1)
    expect(itemPage('figures', paper.figures[0])).toBe(2)
    expect(itemPage('tables', paper.tables[0])).toBeNull()
  })

  it('resolves candidates to the item they point at', () => {
    expect(candidateTarget(paper, paper.candidates[0])).toEqual({ kind: 'equations', item: paper.equations[0] })
    expect(candidateTarget(paper, paper.candidates[1])).toEqual({ kind: 'figures', item: paper.figures[0] })
    expect(candidateTarget(paper, paper.candidates[2])).toBeNull()
  })

  it('lists other items on the same page only', () => {
    const onPage2 = samePageItems(paper, 'src1', 2, { kind: 'equations', id: 'eq2' })
    expect(onPage2.map((x) => x.item.id)).toEqual(['fig2'])
    expect(samePageItems(paper, 'src1', null)).toEqual([])
  })

  it('detects attention-related items', () => {
    expect(isAttentionRelated(paper.equations[0])).toBe(true)
    expect(isAttentionRelated({ title: 'Bubble sort' })).toBe(false)
    expect(isAttentionRelated(null, { algorithm: 'attention' })).toBe(true)
  })

  it('builds the selection text sent to the tutor', () => {
    expect(selectionText('figures', paper.figures[0])).toBe('Figure 2: Scaled Dot-Product Attention')
    expect(selectionText('equations', paper.equations[1])).toBe('(2) \\mathrm{MultiHead}(Q,K,V)')
    expect(selectionText('tables', paper.tables[0])).toBe('Table 1: Complexity: Layer | Complexity')
  })

  it('splits known and missing variable values', () => {
    const { known, unknown } = splitVariables(paper.equations[0])
    expect(known.map((v) => v.symbol)).toEqual(['d_k'])
    expect(unknown.map((v) => v.symbol)).toEqual(['Q'])
  })
})

describe('blocks for the Lab', () => {
  it('makes a small attention example with Q, K, V of matching shapes', () => {
    const block = attentionExampleBlock({ title: 'Attention', language: 'en', refs: [paper.equations[0].source_refs[0], null] })
    expect(block.type).toBe('algorithm')
    expect(block.algorithm).toBe('attention')
    expect(block.confirmed).toBe(false)
    expect(block.source_refs).toHaveLength(1)
    const { tokens, Q, K, V } = block.config
    expect(Q).toHaveLength(tokens.length)
    expect(K).toHaveLength(tokens.length)
    expect(V).toHaveLength(tokens.length)
    expect(new Set(Q.map((row) => row.length)).size).toBe(1)
    expect(Q[0].length).toBe(K[0].length)
    expect(attentionExampleBlock({ language: 'vi' }).config.tokens).toEqual(['Tôi', 'yêu', 'mèo'])
  })

  it('prepares AI blocks: valid type, unique id, needs review', () => {
    const existing = [{ id: 'b1' }]
    const ok = prepareBlockForLab({ id: 'b1', type: 'graph', title: 'G', confirmed: true, ai_generated: false }, existing)
    expect(ok.id).not.toBe('b1')
    expect(ok.confirmed).toBe(false)
    expect(ok.ai_generated).toBe(true)
    expect(ok.source_refs).toEqual([])
    expect(prepareBlockForLab({ id: 'b2', type: 'graph' }, existing).id).toBe('b2')
    expect(prepareBlockForLab({ id: 'bad id!', type: 'graph' }).id).not.toBe('bad id!')
    expect(prepareBlockForLab({ type: 'rocket' })).toBeNull()
    expect(prepareBlockForLab(null)).toBeNull()
  })

  it('sanitizes an edited equation to the schema limits', () => {
    const eq = sanitizeEquation({
      id: 'eq1',
      label: '(1234567890123456789012)',
      latex: 'x',
      variables: [
        { symbol: ' d_k ', meaning: 'dim', unit: '', known_value: '64', provenance: 'user' },
        { symbol: '', meaning: 'empty row' },
        { symbol: 'T', known_value: 'abc', provenance: 'weird' },
      ],
      missing: ['  ', 'temperature'],
    })
    expect(eq.label).toHaveLength(20)
    expect(eq.variables).toEqual([
      { symbol: 'd_k', meaning: 'dim', unit: '', known_value: 64, provenance: 'user' },
      { symbol: 'T', meaning: '', unit: '', known_value: null, provenance: 'unknown' },
    ])
    expect(eq.missing).toEqual(['temperature'])
  })
})

describe('small formatters', () => {
  it('names Meta models', () => {
    expect(modelLabel('muse-spark-1.3-contributor')).toBe('Muse Spark 1.3 Contributor')
    expect(modelLabel('muse-spark-1.3')).toBe('Muse Spark 1.3')
    expect(modelLabel('muse-wonder-1.0')).toBe('Muse Wonder')
    expect(modelLabel('')).toBe('')
  })

  it('parses numbers typed in Vietnamese or English', () => {
    expect(parseNumberInput('0,5', 'vi')).toBe(0.5)
    expect(parseNumberInput('0.5', 'vi')).toBe(0.5)
    expect(parseNumberInput('1.000,25', 'vi')).toBe(1000.25)
    expect(parseNumberInput('1,000.5', 'en')).toBe(1000.5)
    expect(parseNumberInput('-3e2', 'en')).toBe(-300)
    expect(parseNumberInput('', 'vi')).toBeNull()
    expect(Number.isNaN(parseNumberInput('abc', 'vi'))).toBe(true)
  })

  it('formats elapsed time', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(65_400)).toBe('1:05')
  })
})

describe('conciseBlockTitle', () => {
  const named = (label) => `Khám phá phương trình ${label}`
  it('keeps short titles', () => {
    expect(conciseBlockTitle('  (1) Attention  ', '(1)', named)).toBe('(1) Attention')
  })
  it('replaces a long "(label) sentence" title with a named one', () => {
    const long = '(1) Công thức tính đầu ra attention bằng tích vô hướng Q với K chuyển vị, chia tỉ lệ, chuẩn hoá softmax rồi nhân với V.'
    expect(conciseBlockTitle(long, '(1)', named)).toBe('Khám phá phương trình (1)')
  })
  it('cuts at a word boundary when there is no label', () => {
    const out = conciseBlockTitle('a'.repeat(10) + ' ' + 'word '.repeat(30), '', null, 40)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(41)
  })
})
