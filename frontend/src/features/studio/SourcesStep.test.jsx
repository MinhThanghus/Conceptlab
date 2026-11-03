import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { I18nProvider } from '../../i18n/index.jsx'
import { ToastProvider } from '../../components/ui/Toast.jsx'

const mocks = vi.hoisted(() => ({ lab: null, addBlock: vi.fn() }))
vi.mock('../lab/LabContext.jsx', () => ({
  useLab: () => ({ lab: mocks.lab, updateFields: vi.fn(), addBlock: mocks.addBlock, flush: async () => mocks.lab, replaceLab: vi.fn(), reload: vi.fn() }),
}))
vi.mock('./LabStudioLayout.jsx', () => ({ useStudio: () => ({ openSource: vi.fn() }) }))
vi.mock('./authoring/sources/UploadPanel.jsx', () => ({ UploadPanel: () => null }))
vi.mock('./authoring/sources/useSourcePolling.js', () => ({ useSourcePolling: () => {} }))
vi.mock('../../lib/api.js', () => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }))

const { default: SourcesStep } = await import('./SourcesStep.jsx')

const photo = { id: 'src-photo', kind: 'image', title: 'Board photo', status: 'ready', width: 1600, height: 1200, urls: { file: '/api/sources/src-photo/file' } }
const pdf = { id: 'src-pdf', kind: 'pdf', title: 'Notebook scan', status: 'ready', page_count: 3, urls: {} }
const processing = { id: 'src-wait', kind: 'image', title: 'Still uploading', status: 'processing', urls: {} }
const video = { id: 'src-video', kind: 'video', title: 'Swing video', status: 'ready', urls: {} }

/** Where the shortcut lands: the Build step route, with its hash and router state. */
function BuildProbe() {
  const location = useLocation()
  return <p data-testid="build">{`${location.pathname}${location.hash}`}|{JSON.stringify(location.state)}</p>
}

function renderStep() {
  return render(
    <I18nProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={['/app/labs/lab1/sources']}>
          <Routes>
            <Route path="/app/labs/:id/sources" element={<SourcesStep />} />
            <Route path="/app/labs/:id/build" element={<BuildProbe />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </I18nProvider>,
  )
}

beforeEach(() => {
  localStorage.setItem('cl.lang', 'en')
  mocks.addBlock.mockReset()
  mocks.lab = { id: 'lab1', space: 'school2lab', subject: 'physics', ai_mode: 'standard', sources: [photo, pdf, processing, video], spec: { blocks: [] } }
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('Sources step: clean up handwriting', () => {
  it('offers the shortcut on ready photos and PDFs only, as a secondary action', () => {
    renderStep()
    const buttons = screen.getAllByRole('button', { name: /^Clean up handwriting in / })
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Clean up handwriting in Board photo', 'Clean up handwriting in Notebook scan'])
    expect(buttons[0].textContent).toBe('Clean up handwriting')
    expect(buttons[0].className).not.toMatch(/btn-primary/)
    expect(screen.queryByRole('button', { name: 'Clean up handwriting in Still uploading' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clean up handwriting in Swing video' })).toBeNull()
  })

  it('creates a board block for a photo and opens the Build step on it, reading at once', () => {
    renderStep()
    fireEvent.click(screen.getByRole('button', { name: 'Clean up handwriting in Board photo' }))
    expect(mocks.addBlock).toHaveBeenCalledTimes(1)
    const block = mocks.addBlock.mock.calls[0][0]
    expect(block).toMatchObject({ type: 'board', image: { source_id: 'src-photo', page: null, asset_id: null } })
    expect(screen.getByTestId('build').textContent).toBe(`/app/labs/lab1/build#block-${block.id}|${JSON.stringify({ boardAutoRead: block.id })}`)
  })

  it('starts a PDF on its first page', () => {
    renderStep()
    fireEvent.click(screen.getByRole('button', { name: 'Clean up handwriting in Notebook scan' }))
    expect(mocks.addBlock.mock.calls[0][0].image).toEqual({ source_id: 'src-pdf', page: 1, asset_id: null })
  })

  it('opens the board already made from a source instead of making another', () => {
    mocks.lab.spec.blocks = [
      { id: 'b_read', type: 'board', title: 'Pendulum', image: { source_id: 'src-photo', page: null, asset_id: null }, items: [{ id: 'b1', kind: 'heading', text: 'Pendulum' }], visual: null },
      { id: 'b_new', type: 'board', title: 'Notes', image: { source_id: 'src-pdf', page: 2, asset_id: null }, items: [], visual: null },
    ]
    renderStep()
    const open = screen.getByRole('button', { name: 'Open handwriting clean-up for Board photo' })
    expect(open.textContent).toBe('Open handwriting clean-up')
    fireEvent.click(open)
    expect(mocks.addBlock).not.toHaveBeenCalled()
    // already read: open it as it is, without reading again
    expect(screen.getByTestId('build').textContent).toBe('/app/labs/lab1/build#block-b_read|null')
  })

  it('reads a board that was made but never read', () => {
    mocks.lab.spec.blocks = [{ id: 'b_new', type: 'board', title: 'Notes', image: { source_id: 'src-pdf', page: 2, asset_id: null }, items: [], visual: null }]
    renderStep()
    fireEvent.click(screen.getByRole('button', { name: 'Open handwriting clean-up for Notebook scan' }))
    expect(mocks.addBlock).not.toHaveBeenCalled()
    expect(screen.getByTestId('build').textContent).toBe(`/app/labs/lab1/build#block-b_new|${JSON.stringify({ boardAutoRead: 'b_new' })}`)
  })
})
