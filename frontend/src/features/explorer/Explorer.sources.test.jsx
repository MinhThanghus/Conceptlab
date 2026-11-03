import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { I18nProvider } from '../../i18n/index.jsx'
import { BlockEnvProvider } from '../blocks/BlockEnv.jsx'
import { BlockFrame } from '../blocks/BlockRenderer.jsx'
import { SourceRefChips } from '../sources/SourceRefChips.jsx'
import Explorer from './Explorer.jsx'

vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ user: null, ai: { configured: false } }) }))
vi.mock('../blocks/steps/lessonHooks.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useElementSize: () => ({ width: 640, height: 200 }),
}))

const source = { id: 'source-a', kind: 'note', status: 'ready', title: 'Unique original research', text: 'Original research reading note.' }
const ref = { source_id: source.id, located: 'none' }
const flow = {
  id: 'flow1', type: 'flow', title: 'Evidence flow', source_refs: [ref], layout: 'linear',
  nodes: [{ id: 'node1', label: 'First stage', description: 'The first stage description.', source_refs: [ref] },
    { id: 'node2', label: 'Second stage', description: 'The second stage description.', source_refs: [ref] }],
  edges: [{ id: 'edge1', source: 'node1', target: 'node2', source_refs: [ref] }],
}

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem('cl.lang', 'en')
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => { cleanup(); window.localStorage.clear() })

describe('lesson sources', () => {
  it('opens the top source and avoids duplicate block and node chips in Explorer', async () => {
    const lab = { id: 'lab1', title: 'Research lesson', language: 'en', subject: 'biology', grade: 'university',
      level: 'detailed', space: 'paper2explorer', sources: [source], assets: [], allow_tutor: false,
      spec: { summary: 'A lesson.', objectives: [], assumptions: [], glossary: [], blocks: [flow] } }
    const { container } = render(<I18nProvider><Explorer lab={lab} mode="preview" /></I18nProvider>)
    const intro = container.querySelector('section.xp-sources-intro, section.xp-lesson-sources')
    expect(intro).not.toBeNull()
    fireEvent.click(within(intro).getByRole('button', { name: /Unique original research/ }))
    expect(await screen.findByText('Original research reading note.')).toBeTruthy()
    fireEvent.click(container.querySelector('.xp-side-close'))

    fireEvent.click(screen.getByRole('button', { name: 'Contents' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /First stage.*Second stage/ }))
    await waitFor(() => expect(container.querySelector('.flow-group')).not.toBeNull())
    const group = container.querySelector('.flow-group')
    expect(group.textContent).toContain('The first stage description.')
    expect(group.textContent).toContain('The second stage description.')
    fireEvent.click(within(group.querySelector('.flow-group-nodes')).getByRole('button', { name: 'Second stage' }))
    const frame = container.querySelector('[data-block-id="flow1"]')
    expect(frame).not.toBeNull()
    expect(frame.querySelector('.blk-sources')).toBeNull()
    expect(frame.querySelector('.src-refs')).toBeNull()
  })

  it.each(['view', 'edit'])('retains source chips and their action outside Explorer in %s mode', (mode) => {
    const openSource = vi.fn()
    const { container } = render(<I18nProvider><BlockEnvProvider value={{ mode, language: 'en', openSource, sourceById: () => source }}>
      <BlockFrame block={flow}><SourceRefChips refs={[ref]} /></BlockFrame>
    </BlockEnvProvider></I18nProvider>)
    const chips = container.querySelectorAll('.src-refs button')
    expect(chips).toHaveLength(2) // block-level and content-level refs
    fireEvent.click(chips[0])
    expect(openSource).toHaveBeenCalledWith(ref)
  })
})
it('starts in the slide introduction even when the old all-parts preference is saved', () => {
  window.localStorage.setItem('cl.explorer.view', JSON.stringify('all'))
  const lab = { id: 'lab1', title: 'Research lesson', language: 'en', subject: 'biology', grade: 'university',
    level: 'detailed', space: 'paper2explorer', sources: [source], assets: [], allow_tutor: false,
    spec: { summary: 'A lesson.', objectives: [], assumptions: [], glossary: [], blocks: [flow] } }
  const { container } = render(<I18nProvider><Explorer lab={lab} mode="preview" /></I18nProvider>)
  expect(container.querySelector('.lesson-deck')).not.toBeNull()
  expect(container.querySelector('.deck-paper').dataset.deckKind).toBe('intro')
  expect(container.querySelector('.xp-lesson-sources')).not.toBeNull()
})
