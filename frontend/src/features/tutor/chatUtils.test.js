import { describe, expect, it } from 'vitest'
import { boardTutorState, buildChatContext, chatPath, compactState, contextKey, plainText, shareCodeFromChatPath, suggestionKeys } from './chatUtils.js'

// A board read from a notebook page (the shape of the live probe), with a crossed-out line.
const board = {
  id: 'bd1',
  type: 'board',
  title: 'Quang hợp',
  items: [
    { id: 'b1', kind: 'heading', text: '  quang  HỢP ' },
    { id: 'b2', kind: 'equation', text: '6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂', latex: '6CO_2 + 6H_2O \\xrightarrow[\\text{diệp lục}]{\\text{ánh sáng}} C_6H_{12}O_6 + 6O_2' },
    { id: 'b3', kind: 'text', text: 'diệp lục tố??', struck: true },
    { id: 'b4', kind: 'bullet', text: '• xảy ra ở lục lạp' },
    { id: 'b5', kind: 'formula', lead: 'Chu kì:', text: 'T = 2π√(l/g)', latex: 'T = 2\\pi\\sqrt{l/g}' },
    { id: 'b6', kind: 'diagram', text: 'Lá cây dưới ánh mặt trời', labels: ['CO₂', ' O₂ '] },
    { id: 'b7', kind: 'note', text: 'Học thuộc phương trình' },
    { id: 'b8', kind: 'text', text: '   ' },
  ],
}

describe('board blocks for the tutor', () => {
  it('reports what the sheet says: the title once, the visible lines and the drawings, never a crossed-out line', () => {
    const state = boardTutorState(board, 'text')
    expect(state.type).toBe('board')
    expect(state.view).toBe('text')
    expect(state.lines[0]).toBe('quang HỢP')
    expect(state.lines.filter((line) => /quang hợp/i.test(line))).toHaveLength(1)
    expect(state.lines).toEqual(expect.arrayContaining(['6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂', 'ánh sáng', 'diệp lục', 'T = 2π√(l/g)', 'Học thuộc phương trình']))
    expect(state.lines.at(-1)).toMatch(/^Lá cây dưới ánh mặt trời/)
    expect(state.lines.join('\n')).not.toContain('diệp lục tố')
    expect('more_lines' in state).toBe(false)
    expect('view' in boardTutorState(board)).toBe(false)
  })

  it('stays within the chat context limits', () => {
    const long = { title: 'T', items: Array.from({ length: 30 }, (_, i) => ({ id: `b${i}`, kind: 'text', text: `line ${i}` })) }
    const state = boardTutorState(long, 'visual')
    expect(state.lines).toHaveLength(24)
    expect(state.more_lines).toBe(7)
    const ctx = buildChatContext({ block_id: 'bd1' }, { bd1: boardTutorState(board, 'visual') })
    expect(ctx.state).toMatchObject({ type: 'board', view: 'visual' })
    expect(ctx.state.lines).toContain('T = 2π√(l/g)')
  })
})

describe('text helpers', () => {
  it('strips markdown and citation markers for announcements', () => {
    expect(plainText('**Chu kỳ** tăng khi $L$ tăng [1].')).toBe('Chu kỳ tăng khi L tăng .')
    expect(plainText('a'.repeat(400), 10)).toBe('aaaaaaaaaa…')
  })

  it('builds a stable context key', () => {
    expect(contextKey(null)).toBe('')
    expect(contextKey({ block_id: 'b1', nonce: 2 })).toBe('2|b1||')
  })
})

describe('suggestionKeys', () => {
  it('fits the part type: no graph question under a video, no paper question in a school lab', () => {
    expect(suggestionKeys({ blockType: 'simulation', space: 'school2lab' })).toEqual(['variable', 'graph', 'assumption'])
    expect(suggestionKeys({ blockType: 'video', space: 'school2lab' })).toEqual(['observe', 'bookPart'])
    expect(suggestionKeys({ blockType: 'quiz', space: 'school2lab' })).toEqual(['quiz', 'bookPart'])
    expect(suggestionKeys({ blockType: 'steps', space: 'school2lab' })).toEqual(['book', 'why'])
  })
  it('speaks about the paper (and its figures) in Paper2Explorer', () => {
    expect(suggestionKeys({ blockType: 'text', space: 'paper2explorer' })).toEqual(['term', 'paperPart', 'figure'])
    expect(suggestionKeys({ blockType: 'graph', space: 'paper2explorer' })).toEqual(['variable', 'graph', 'paperPart'])
    expect(suggestionKeys({ blockType: 'steps', space: 'paper2explorer' })).toEqual(['paperPart', 'why'])
  })
  it('falls back sensibly for an unknown part', () => {
    expect(suggestionKeys({})).toEqual(['variable', 'bookPart', 'why'])
    expect(suggestionKeys({ space: 'paper2explorer' })).toEqual(['figure', 'term', 'paperPart'])
  })
})

describe('shareCodeFromChatPath', () => {
  it('finds the share code of a learner chat and nothing for a studio preview', () => {
    expect(shareCodeFromChatPath(chatPath({ shareCode: 'ABC234' }))).toBe('ABC234')
    expect(shareCodeFromChatPath(chatPath({ labId: 'lab1', shareCode: 'ABC234' }))).toBeNull()
    expect(shareCodeFromChatPath(null)).toBeNull()
  })
})
