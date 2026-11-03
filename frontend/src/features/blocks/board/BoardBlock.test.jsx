import { StrictMode, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '../../../i18n/index.jsx'
import { BlockEnvProvider } from '../BlockEnv.jsx'
const api = vi.hoisted(() => ({ post: null, upload: null }))
vi.mock('../../../lib/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, post: (...args) => api.post(...args), upload: (...args) => api.upload(...args) }
})

import { ApiError } from '../../../lib/api.js'
import BoardBlock from './BoardBlock.jsx'
import { resetBoardTasks } from './boardTasks.js'

const photo = { id: 'src1', kind: 'image', title: 'Bảng lớp 10A', status: 'ready', width: 1600, height: 1200, urls: { file: '/api/sources/src1/file' } }
const pdf = { id: 'src2', kind: 'pdf', title: 'Vở ghi', status: 'ready', page_count: 3, urls: { page: '/api/sources/src2/pages/{n}.png' } }
const sheetAsset = { id: 'as1', kind: 'generated', mime: 'image/png', width: 1536, height: 1024, url: '/api/assets/as1/file', meta: {} }

const blank = {
  id: 'bd1',
  type: 'board',
  title: 'Board notes',
  description: '',
  source_refs: [],
  confirmed: false,
  ai_generated: false,
  image: { source_id: null, page: null, asset_id: null },
  surface: 'other',
  items: [],
  unreadable: '',
  visual: null,
  visual_proof: null,
  show: 'visual',
}
const line = (id, kind, text, extra = {}) => ({ id, kind, text, lead: '', latex: '', labels: [], bbox: null, uncertain: [], struck: false, ...extra })
const readResult = {
  image: { source_id: 'src1', page: null, asset_id: null },
  image_width: 1536,
  image_height: 1152,
  surface: 'whiteboard',
  title: 'Con lắc đơn',
  items: [
    line('b1', 'heading', 'Con lắc đơn', { bbox: [0.18, 0.05, 0.5, 0.23] }),
    line('b2', 'formula', 'Chu kì: T = 2π√(l/g)', { lead: 'Chu kì:', latex: 'T = 2\\pi\\sqrt{l/g}', bbox: [0.13, 0.13, 0.64, 0.33] }),
    line('b3', 'bullet', 'Không phụ thuộc khối lượng m', { uncertain: ['khối lượng'], bbox: [0.12, 0.27, 0.77, 0.43] }),
    line('b4', 'text', 'dao động nhỏ??', { struck: true }),
    line('b5', 'diagram', 'Con lắc đơn: dây dài l, vật nặng m', { labels: ['l', 'm', 'α'], bbox: [0.5, 0.43, 0.85, 0.83] }),
  ],
  unreadable: '',
  notes: '',
}
const readBlock = { ...blank, title: 'Con lắc đơn', image: { source_id: 'src1', page: null, asset_id: null }, surface: 'whiteboard', items: readResult.items, ai_generated: true }
const drawnBlock = { ...readBlock, visual: { source_id: null, page: null, asset_id: 'as1' }, visual_proof: { checked: true, ok: true, differences: [], missing: [], extra: [], attempts: 1 } }

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function envValue(extra = {}) {
  const sources = extra.sources || [photo, pdf]
  const assets = extra.assets || []
  return {
    mode: 'edit',
    labId: 'lab1',
    aiAvailable: true,
    aiPath: (name) => `/api/labs/lab1/ai/${name}`,
    language: 'en',
    sources,
    assets,
    sourceById: (id) => sources.find((s) => s.id === id) || null,
    assetById: (id) => assets.find((a) => a.id === id) || null,
    ...extra,
  }
}

function Harness({ initial, mode, env, onChange }) {
  const [block, setBlock] = useState(initial)
  return (
    <BlockEnvProvider value={env}>
      <BoardBlock
        block={block}
        mode={mode}
        onChange={(next) => {
          onChange(next)
          setBlock(next)
        }}
      />
    </BlockEnvProvider>
  )
}

function renderBoard(block, { mode = 'edit', env = {}, route = null, strict = false } = {}) {
  const onChange = vi.fn()
  let tree = (
    <I18nProvider>
      <Harness initial={block} mode={mode} env={envValue(env)} onChange={onChange} />
    </I18nProvider>
  )
  if (route) tree = <MemoryRouter initialEntries={[route]}>{tree}</MemoryRouter>
  if (strict) tree = <StrictMode>{tree}</StrictMode>
  render(tree)
  return { onChange, last: () => onChange.mock.calls.at(-1)?.[0] }
}

beforeEach(() => {
  window.localStorage.setItem('cl.lang', 'en')
  resetBoardTasks()
  api.post = vi.fn(() => Promise.reject(new Error('unexpected post')))
  api.upload = vi.fn(() => Promise.reject(new Error('unexpected upload')))
})
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('BoardBlock editor', () => {
  it('starts with the photo, reads it behind a designed wait, then opens the review', async () => {
    const { last } = renderBoard(blank)
    const read = await screen.findByRole('button', { name: 'Read the handwriting' })
    expect(read.disabled).toBe(true)
    expect(document.querySelector('.bd-steps [aria-current="step"]').textContent).toContain('Choose a photo')

    fireEvent.click(screen.getByRole('button', { name: /Bảng lớp 10A/ }))
    expect(last().image).toEqual({ source_id: 'src1', page: null, asset_id: null })
    expect(screen.getByRole('button', { name: /Bảng lớp 10A/ }).getAttribute('aria-pressed')).toBe('true')

    const call = deferred()
    api.post = vi.fn(() => call.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Read the handwriting' }))
    expect(api.post).toHaveBeenCalledWith('/api/labs/lab1/ai/board-read', { source_id: 'src1', page: null }, { signal: expect.any(AbortSignal) })
    const wait = await screen.findByRole('status', { name: 'Reading the handwriting' })
    expect(wait.getAttribute('aria-busy')).toBe('true')
    // the button that started it is gone: the keyboard lands on the wait, not on the page body
    expect(document.activeElement).toBe(within(wait).getByRole('heading', { name: 'Reading the handwriting' }))
    expect(wait.querySelector('.bd-track')).not.toBeNull()
    expect(within(wait).getByText(/Waiting for \d+ s/)).toBeTruthy()

    await act(async () => call.resolve(readResult))
    expect(await screen.findByRole('heading', { name: 'Check the reading' })).toBeTruthy()
    const block = last()
    expect(block.items).toHaveLength(5)
    expect(block.title).toBe('Con lắc đơn')
    expect(block.surface).toBe('whiteboard')
    expect(block.ai_generated).toBe(true)
    // the photo carries a numbered frame for every line that has a box
    expect(document.querySelectorAll('.bd-box')).toHaveLength(4)
  })

  it('a reading without handwriting keeps the photo stage with a friendly message', async () => {
    const { onChange } = renderBoard({ ...blank, image: { source_id: 'src1', page: null, asset_id: null } })
    api.post = vi.fn(() => Promise.resolve({ ...readResult, items: [] }))
    fireEvent.click(await screen.findByRole('button', { name: 'Read the handwriting' }))
    // shown in a visible alert and announced once through the editor's live region
    await waitFor(() => expect(document.querySelector('.bd-stage .alert-info')?.textContent).toMatch(/found no handwriting in this photo/))
    expect(document.querySelector('.bd-editor > [role="status"]').textContent).toMatch(/found no handwriting/)
    expect(onChange.mock.calls.some(([b]) => b.items?.length)).toBe(false)
    expect(screen.getByRole('button', { name: 'Read the handwriting' })).toBeTruthy()
  })

  it('a cancelled reading goes back to the photo without an error', async () => {
    renderBoard({ ...blank, image: { source_id: 'src1', page: null, asset_id: null } })
    api.post = vi.fn((_path, _body, { signal }) => new Promise((_res, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))))
    fireEvent.click(await screen.findByRole('button', { name: 'Read the handwriting' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('button', { name: 'Read the handwriting' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('reads at once, a single time, when the Sources step opened it (router state, StrictMode)', async () => {
    api.post = vi.fn(() => Promise.resolve(readResult))
    const block = { ...blank, image: { source_id: 'src1', page: null, asset_id: null } }
    const { last } = renderBoard(block, { route: { pathname: '/app/labs/lab1/build', state: { boardAutoRead: 'bd1' } }, strict: true })
    expect(await screen.findByRole('heading', { name: 'Check the reading' })).toBeTruthy()
    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.post.mock.calls[0][0]).toBe('/api/labs/lab1/ai/board-read')
    expect(last().items).toHaveLength(5)
  })

  it('does not read by itself for another block or without the flag', async () => {
    const block = { ...blank, image: { source_id: 'src1', page: null, asset_id: null } }
    renderBoard(block, { route: { pathname: '/b', state: { boardAutoRead: 'other' } } })
    expect(await screen.findByRole('button', { name: 'Read the handwriting' })).toBeTruthy()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('review: unsure words are underlined, “Checked” clears them, a crossed-out line can come back', async () => {
    const { last } = renderBoard(readBlock)
    await screen.findByRole('heading', { name: 'Check the reading' })
    const mark = document.querySelector('mark.bd-unsure-word')
    expect(mark.textContent).toBe('khối lượng')
    expect(screen.getByText('1 unsure word')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Checked' }))
    expect(last().items[2].uncertain).toEqual([])
    expect(document.querySelector('mark.bd-unsure-word')).toBeNull()

    // the crossed-out line is shown struck, outside the clean copy, and can be kept
    expect(screen.getByText('dao động nhỏ??').closest('s')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Put it in the clean copy' }))
    expect(last().items[3].struck).toBe(false)
    expect(screen.getByRole('textbox', { name: 'Words of line 4' }).value).toBe('dao động nhỏ??')
  })

  it('review: editing a line unflags the words rewritten, formulas preview live, lines move and come back', async () => {
    const { last } = renderBoard(readBlock)
    await screen.findByRole('heading', { name: 'Check the reading' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Words of line 3' }), { target: { value: 'Không phụ thuộc\nkhối lượng vật m' } })
    expect(last().items[2].text).toBe('Không phụ thuộc khối lượng vật m')
    expect(last().items[2].uncertain).toEqual(['khối lượng'])
    fireEvent.change(screen.getByRole('textbox', { name: 'Words of line 3' }), { target: { value: 'Không phụ thuộc khối lượng của vật' } })
    expect(last().items[2].uncertain).toEqual(['khối lượng'])
    fireEvent.change(screen.getByRole('textbox', { name: 'Words of line 3' }), { target: { value: 'Không phụ thuộc vào vật' } })
    expect(last().items[2].uncertain).toEqual([])

    const latex = screen.getByRole('textbox', { name: /Formula \(LaTeX\)/ })
    fireEvent.change(latex, { target: { value: 'T = 2\\pi\\sqrt{\\frac{l}{g}}' } })
    expect(last().items[1].latex).toBe('T = 2\\pi\\sqrt{\\frac{l}{g}}')
    expect(screen.getByRole('group', { name: 'Formula preview' }).textContent).toContain('Chu kì:')

    fireEvent.click(screen.getByRole('button', { name: 'Move line 1 down' }))
    expect(last().items.map((i) => i.id)).toEqual(['b2', 'b1', 'b3', 'b4', 'b5'])
    fireEvent.click(screen.getByRole('button', { name: 'Delete line 5' }))
    expect(last().items).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(last().items.map((i) => i.id)).toEqual(['b2', 'b1', 'b3', 'b4', 'b5'])
    fireEvent.click(screen.getByRole('button', { name: 'Add a line' }))
    expect(last().items.at(-1)).toMatchObject({ id: 'b6', kind: 'text', text: '' })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Words of line 6' })))
  })

  it('draws the clean copy from the confirmed reading, shows the proof and the learners’ first view', async () => {
    const { last } = renderBoard(readBlock)
    await screen.findByRole('heading', { name: 'Check the reading' })
    const call = deferred()
    api.post = vi.fn(() => call.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Draw the clean copy' }))
    const [path, body] = api.post.mock.calls[0]
    expect(path).toBe('/api/labs/lab1/ai/board-visual')
    expect(body).toMatchObject({ source_id: 'src1', page: null, title: 'Con lắc đơn', surface: 'whiteboard' })
    expect(body.items.map((i) => [i.id, i.struck])).toEqual([
      ['b1', false],
      ['b2', false],
      ['b3', false],
      ['b4', true],
      ['b5', false],
    ])
    const wait = await screen.findByRole('status', { name: 'Drawing the clean copy' })
    expect(within(wait).getByText('Redraw as a clean page')).toBeTruthy()
    // the reading is locked while it is drawn
    expect(screen.getByRole('textbox', { name: 'Words of line 3' }).closest('fieldset').disabled).toBe(true)

    await act(async () =>
      call.resolve({
        visual: { source_id: null, page: null, asset_id: 'as1' },
        asset: sheetAsset,
        proof: { checked: true, ok: false, differences: [{ expected: 'khối lượng', found: 'khối luợng' }], missing: [], extra: ['dao động nhỏ??'], attempts: 2 },
      }),
    )
    expect(await screen.findByRole('heading', { name: 'Clean copy' })).toBeTruthy()
    expect(last().visual).toEqual({ source_id: null, page: null, asset_id: 'as1' })
    expect(last().visual_proof.attempts).toBe(2)
    expect(document.querySelector('.bd-result-img').getAttribute('src')).toBe('/api/assets/as1/file')
    expect(screen.getByText('The picture still differs from the reading in 2 places')).toBeTruthy()
    expect(screen.getByText('should be: khối lượng, picture shows: khối luợng')).toBeTruthy()
    expect(screen.getByText('extra: dao động nhỏ??')).toBeTruthy()
    expect(screen.getByText('The AI drew it 2 times and kept the better one.')).toBeTruthy()
    // one primary at a time: up to date, so "Redraw" is secondary and the draw bar is gone
    expect(screen.queryByRole('button', { name: 'Draw the clean copy' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Redraw' }).className).not.toContain('btn-primary')

    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Learners see first' })).getByRole('radio', { name: 'Text' }))
    expect(last().show).toBe('text')

    // editing the text afterwards marks the sheet out of date but keeps it
    fireEvent.change(screen.getByRole('textbox', { name: 'Words of line 3' }), { target: { value: 'Không phụ thuộc khối lượng' } })
    expect(screen.getByText('Out of date')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Redraw with the corrected text' }).className).toContain('btn-primary')
    expect(document.querySelector('.bd-result-img')).not.toBeNull()
    // the proof was about the words as drawn: it no longer speaks for the edited ones
    expect(screen.queryByText('The picture still differs from the reading in 2 places')).toBeNull()
    expect(document.querySelector('.bd-proof')).toBeNull()
    expect(document.querySelector('.bd-stale')).not.toBeNull()
  })

  it('says when the notes are too long for one sheet, and that the Text view still works', async () => {
    renderBoard(readBlock)
    await screen.findByRole('heading', { name: 'Check the reading' })
    api.post = vi.fn(() => Promise.reject(new ApiError({ status: 422, code: 'board_too_long', extra: { chars: 1612, max_chars: 1500 } })))
    fireEvent.click(screen.getByRole('button', { name: 'Draw the clean copy' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('1612 characters, at most 1500')
    expect(alert.textContent).toContain('Text view')
  })

  it('uploads a photo taken on the spot and selects it', async () => {
    const { last } = renderBoard(blank)
    await screen.findByRole('button', { name: 'Take or upload a photo' })
    api.upload = vi.fn(() => Promise.resolve({ id: 'src9', kind: 'image', title: 'bang', status: 'ready', urls: { file: '/api/sources/src9/file' } }))
    const input = screen.getByTestId('board-upload-input')
    expect(input.getAttribute('accept')).toBe('image/*')
    const file = new File(['x'], 'bang_lop.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(last()?.image?.source_id).toBe('src9'))
    const [path, sent, opts] = api.upload.mock.calls[0]
    expect(path).toBe('/api/labs/lab1/sources')
    expect(sent).toBe(file)
    expect(opts.fields).toEqual({ title: 'bang lop', contains_people: false, consent_confirmed: false })
  })

  it('a PDF page can be chosen before reading', async () => {
    const { last } = renderBoard(blank)
    fireEvent.click(await screen.findByRole('button', { name: /Vở ghi/ }))
    expect(last().image).toEqual({ source_id: 'src2', page: 1, asset_id: null })
    const page = screen.getByRole('textbox', { name: 'Page' })
    fireEvent.change(page, { target: { value: '3' } })
    fireEvent.blur(page)
    expect(last().image).toEqual({ source_id: 'src2', page: 3, asset_id: null })
  })
})

describe('BoardBlock learner view', () => {
  const viewEnv = { mode: 'view', labId: null, shareCode: 'ABC234', aiAvailable: false, assets: [sheetAsset] }

  it('opens on the clean copy and switches to the Text view and the original photo', () => {
    renderBoard(drawnBlock, { mode: 'view', env: viewEnv })
    const group = screen.getByRole('radiogroup', { name: 'How to view the board notes' })
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Clean copy', 'Text', 'Original photo'])
    const sheet = document.querySelector('.bd-view-stage img')
    expect(sheet.getAttribute('src')).toBe('/api/assets/as1/file')
    expect(sheet.getAttribute('alt')).toMatch(/^Clean copy redrawn by AI\. Con lắc đơn\. Chu kì/)
    expect(screen.getByText('Redrawn by AI from the photo')).toBeTruthy()

    fireEvent.click(within(group).getByRole('radio', { name: 'Text' }))
    const text = document.querySelector('.bd-sheet')
    // the title is written once: the part's heading says it, the sheet starts with the lines
    expect(screen.getByRole('heading', { level: 2, name: 'Con lắc đơn' })).toBeTruthy()
    expect(within(text).queryByRole('heading', { name: 'Con lắc đơn' })).toBeNull()
    expect(text.querySelector('.bd-sheet-ul li').textContent).toBe('Không phụ thuộc khối lượng m')
    expect(text.querySelector('.bd-sheet-math .bd-sheet-lead').textContent).toBe('Chu kì:')
    expect(within(text).getAllByRole('listitem').map((li) => li.textContent)).toContain('α')
    // crossed-out lines never reach learners, and unsure marks are the teacher's business
    expect(text.textContent).not.toContain('dao động nhỏ')
    expect(text.querySelector('mark')).toBeNull()

    fireEvent.click(within(group).getByRole('radio', { name: 'Original photo' }))
    expect(document.querySelector('.bd-view-stage img').getAttribute('src')).toBe('/api/sources/src1/file')
  })

  it('opens the Text view first in a translated lesson, and when the teacher chose it', () => {
    renderBoard(drawnBlock, { mode: 'view', env: { ...viewEnv, translatedLanguage: 'en' } })
    expect(screen.getByRole('radio', { name: 'Text' }).getAttribute('aria-checked')).toBe('true')
    cleanup()
    renderBoard({ ...drawnBlock, show: 'text' }, { mode: 'view', env: viewEnv })
    expect(screen.getByRole('radio', { name: 'Text' }).getAttribute('aria-checked')).toBe('true')
  })

  it('without a drawing offers the Text view and the photo; a sheet that differs says so', () => {
    renderBoard(readBlock, { mode: 'view', env: viewEnv })
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(['Text', 'Original photo'])
    expect(document.querySelector('.bd-sheet')).not.toBeNull()
    cleanup()
    renderBoard({ ...drawnBlock, visual_proof: { checked: true, ok: false, differences: [], missing: ['m'], extra: [], attempts: 2 } }, { mode: 'view', env: viewEnv })
    expect(screen.getByText('The drawing may differ from the board in a few words.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open the Text view' }))
    expect(screen.getByRole('radio', { name: 'Text' }).getAttribute('aria-checked')).toBe('true')
  })

  it('fills a lesson slide, and an unread board shows an empty state', () => {
    renderBoard(drawnBlock, { mode: 'view', env: { ...viewEnv, presentation: 'slides' } })
    expect(document.querySelector('.bd-view.bd-slide')).not.toBeNull()
    cleanup()
    renderBoard({ ...blank, image: { source_id: 'src1', page: null, asset_id: null } }, { mode: 'view', env: viewEnv })
    expect(screen.getByText('These board notes are empty')).toBeTruthy()
  })
})
