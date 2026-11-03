import { describe, expect, it } from 'vitest'
import {
  addMissingVariables,
  analysisCounts,
  confirmAll,
  emptyResult,
  itemKeys,
  knownSymbols,
  moveInList,
  nameSourceRefs,
  normalizeResult,
  parseSymbolList,
  removeAt,
  reopenMissing,
  replaceAt,
  resolveMissing,
  reviewProgress,
  upsertVariable,
} from './review.js'

const pendulum = () => ({
  topic: 'Con lắc đơn',
  summary: 'Chu kỳ dao động nhỏ của con lắc đơn.',
  formulas: [{ id: 'f1', latex: 'T=2\\pi\\sqrt{L/g}', expression: '2*pi*sqrt(L/g)', output_symbol: 'T', variables: ['L', 'g'], source_refs: [], confirmed: false }],
  variables: [
    { symbol: 'L', name: 'Chiều dài dây', unit: 'm', value: null, role: 'input', provenance: 'unknown', confirmed: false },
    { symbol: 'g', name: 'Gia tốc trọng trường', unit: 'm/s²', value: 9.81, role: 'constant', provenance: 'document', confirmed: true },
  ],
  objects: [{ id: 'o1', name: 'Quả nặng', sam_phrase: 'pendulum bob', source_refs: [], confirmed: false }],
  steps: [
    { id: 's1', title: 'Kéo lệch', source_refs: [], confirmed: false },
    { id: 's2', title: 'Thả tay', source_refs: [], confirmed: false },
  ],
  sequence_clear: false,
  relations: [],
  missing_info: [{ id: 'm1', text: 'Chiều dài dây chưa được cho', symbol: 'L', resolved: false }],
  assumptions: [{ id: 'a1', text: 'Bỏ qua lực cản không khí', confirmed: false }],
  warnings: ['Ảnh mờ ở góc trên'],
  suggested_blocks: [{ type: 'simulation', reason: 'Có công thức chu kỳ', feasibility: 'ready', model: 'pendulum' }],
})

describe('normalizeResult', () => {
  it('fills missing keys', () => {
    const r = normalizeResult({ topic: 'X', formulas: null })
    expect(r.formulas).toEqual([])
    expect(r.variables).toEqual([])
    expect(r.summary).toBe('')
    expect(normalizeResult(null)).toEqual(emptyResult())
  })
})

describe('reviewProgress', () => {
  it('counts every reviewable item', () => {
    const p = reviewProgress(pendulum())
    // topic 1 + formulas 1 + variables 2 + objects 1 + steps 2 + assumptions 1 + sequence 1 + missing 1
    expect(p.total).toBe(10)
    expect(p.done).toBe(1) // g is confirmed
    expect(p.sections.variables).toEqual({ done: 1, total: 2 })
    expect(p.sections.sequence).toEqual({ done: 0, total: 1 })
    expect(p.complete).toBe(false)
  })

  it('counts the topic only when confirmed', () => {
    expect(reviewProgress(pendulum(), { topicConfirmed: true }).sections.topic).toEqual({ done: 1, total: 1 })
    expect(reviewProgress({ ...pendulum(), topic: '', summary: '' }, { topicConfirmed: true }).sections.topic).toEqual({ done: 0, total: 0 })
  })

  it('does not ask about the order of a single step', () => {
    const r = { ...pendulum(), steps: [{ id: 's1', title: 'x', confirmed: true }] }
    expect(reviewProgress(r).sections.sequence).toEqual({ done: 0, total: 0 })
  })

  it('is complete when everything is checked', () => {
    let r = confirmAll(pendulum())
    r = { ...r, sequence_clear: true }
    r = resolveMissing(r, 0, { value: 0.75, unit: 'm' })
    const p = reviewProgress(r, { topicConfirmed: true })
    expect(p.done).toBe(p.total)
    expect(p.complete).toBe(true)
  })

  it('is never complete when there is nothing to review', () => {
    expect(reviewProgress(emptyResult()).complete).toBe(false)
  })
})

describe('confirmAll', () => {
  it('confirms items but not the sequence or missing info', () => {
    const r = confirmAll(pendulum())
    expect(r.formulas.every((f) => f.confirmed)).toBe(true)
    expect(r.variables.every((v) => v.confirmed)).toBe(true)
    expect(r.assumptions[0].confirmed).toBe(true)
    expect(r.sequence_clear).toBe(false)
    expect(r.missing_info[0].resolved).toBe(false)
  })
  it('does not mutate the input', () => {
    const input = pendulum()
    confirmAll(input)
    expect(input.formulas[0].confirmed).toBe(false)
  })
})

describe('resolveMissing', () => {
  it('turns an entered value into a user-provided variable', () => {
    const r = resolveMissing(pendulum(), 0, { value: 0.75, unit: 'm' })
    const L = r.variables.find((v) => v.symbol === 'L')
    expect(L).toMatchObject({ value: 0.75, unit: 'm', provenance: 'user', confirmed: true, name: 'Chiều dài dây' })
    expect(r.missing_info[0].resolved).toBe(true)
    expect(r.variables).toHaveLength(2)
  })

  it('creates the variable when it does not exist yet', () => {
    const base = { ...pendulum(), missing_info: [{ id: 'm2', text: 'Khối lượng quả nặng', symbol: null, resolved: false }] }
    const r = resolveMissing(base, 0, { symbol: 'm', value: 0.2, unit: 'kg' })
    expect(r.variables.find((v) => v.symbol === 'm')).toMatchObject({ value: 0.2, unit: 'kg', provenance: 'user', name: 'Khối lượng quả nặng', role: 'input' })
    expect(r.missing_info[0]).toMatchObject({ resolved: true, symbol: 'm' })
  })

  it('can mark resolved without a value', () => {
    const r = resolveMissing(pendulum(), 0, {})
    expect(r.missing_info[0].resolved).toBe(true)
    expect(r.variables.find((v) => v.symbol === 'L').value).toBeNull()
  })

  it('ignores invalid values and indexes', () => {
    expect(resolveMissing(pendulum(), 0, { value: NaN }).variables.find((v) => v.symbol === 'L').value).toBeNull()
    expect(resolveMissing(pendulum(), 5, { value: 1 })).toEqual(normalizeResult(pendulum()))
  })

  it('reopens an entry', () => {
    const r = reopenMissing(resolveMissing(pendulum(), 0, {}), 0)
    expect(r.missing_info[0].resolved).toBe(false)
  })
})

describe('list helpers', () => {
  it('moves, replaces and removes immutably', () => {
    const list = ['a', 'b', 'c']
    expect(moveInList(list, 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveInList(list, 2, 1)).toEqual(['a', 'c', 'b'])
    expect(moveInList(list, 0, -1)).toEqual(list)
    expect(replaceAt(list, 1, 'x')).toEqual(['a', 'x', 'c'])
    expect(removeAt(list, 0)).toEqual(['b', 'c'])
    expect(list).toEqual(['a', 'b', 'c'])
  })

  it('makes unique keys from ids', () => {
    expect(itemKeys([{ id: 'a' }, { id: 'a' }, {}], 's')).toEqual(['a', 'a~1', 's2'])
  })

  it('upserts variables by symbol', () => {
    const vars = [{ symbol: 'L', value: 1 }]
    expect(upsertVariable(vars, { symbol: 'L', value: 2 })).toEqual([{ symbol: 'L', value: 2 }])
    expect(upsertVariable(vars, { symbol: 'g', value: 9.81 })).toHaveLength(2)
  })

  it('adds variables that a formula uses but the table lacks', () => {
    const r = addMissingVariables(pendulum(), ['L', 'g', 'theta'])
    expect(knownSymbols(r)).toEqual(['L', 'g', 'theta'])
    expect(r.variables[2]).toMatchObject({ symbol: 'theta', provenance: 'unknown', confirmed: false })
  })

  it('parses symbol lists', () => {
    expect(parseSymbolList('L, g ,, L; theta')).toEqual(['L', 'g', 'theta'])
    expect(parseSymbolList('')).toEqual([])
  })

  it('summarises counts for the analyze step', () => {
    expect(analysisCounts(pendulum())).toMatchObject({ formulas: 1, variables: 2, steps: 2, objects: 1, missing: 1 })
  })
})

describe('nameSourceRefs', () => {
  const titles = ['Trang sách', 'Ảnh con lắc', null]
  it('replaces prompt numbering with source titles', () => {
    expect(nameSourceRefs('Thước trong ảnh [2] quá nhỏ.', titles)).toBe('Thước trong ảnh “Ảnh con lắc” quá nhỏ.')
    expect(nameSourceRefs('Theo [1, 2].', titles)).toBe('Theo “Trang sách”, “Ảnh con lắc”.')
  })
  it('keeps unknown or deleted sources and other brackets untouched', () => {
    expect(nameSourceRefs('Nguồn [3] và [9]', titles)).toBe('Nguồn [3] và [9]')
    expect(nameSourceRefs('Khoảng [a, b] và [1]', titles)).toBe('Khoảng [a, b] và “Trang sách”')
    expect(nameSourceRefs('Không có số', [])).toBe('Không có số')
    expect(nameSourceRefs(null, titles)).toBe('')
  })
})
