import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { I18nProvider } from '../../../i18n/index.jsx'
import { BlockEnvProvider } from '../BlockEnv.jsx'
import FlowSlide from './FlowSlide.jsx'

vi.mock('../steps/lessonHooks.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useElementSize: () => ({ width: 800, height: 400 }) }
})
const block = {
  id: 'flow1', title: 'Branching cycle', layout: 'cycle',
  nodes: [
    { id: 'a', label: 'Prepare material', description: 'A complete first explanation.' },
    { id: 'b', label: 'Inspect result', description: 'Check the actual observation.' },
    { id: 'c', label: 'Repeat process', description: 'Return to the start.' },
  ],
  edges: [
    { id: 'ab', source: 'a', target: 'b', label: 'Examine', description: 'The first connection explains examination.' },
    { id: 'ac', source: 'a', target: 'c', label: 'Alternative', description: 'A branching path.' },
    { id: 'ca', source: 'c', target: 'a', label: 'Repeat', description: 'The loop returns to the beginning.' },
  ],
}
const mount = (props, env = {}) => render(<I18nProvider><BlockEnvProvider value={env}><FlowSlide block={block} {...props} /></BlockEnvProvider></I18nProvider>)
beforeEach(() => window.localStorage.setItem('cl.lang', 'en'))
afterEach(cleanup)

it('keeps every authored node, branch and cycle on the overview and selects by ID', () => {
  const select = vi.fn()
  const { container } = mount({ kind: 'flow-overview', onSelect: select })
  for (const title of ['Prepare material', 'Inspect result', 'Repeat process']) expect(screen.getByRole('button', { name: title, exact: true })).toBeTruthy()
  expect(container.querySelectorAll('path.flow-edge')).toHaveLength(3)
  fireEvent.click(screen.getByRole('button', { name: 'Prepare material', exact: true }))
  expect(select).toHaveBeenLastCalledWith({ type: 'node', id: 'a' })
  fireEvent.click(screen.getByRole('button', { name: /Alternative/ }))
  expect(select).toHaveBeenLastCalledWith({ type: 'edge', id: 'ac' })
  expect(container.querySelector('.flow-step-rail')).toBeNull()
})

it('shows the complete authored node without its own previous or next controls and asks with the original ID', () => {
  const ask = vi.fn()
  const { container } = mount({ kind: 'flow-node', itemId: 'a' }, { aiAvailable: true, mode: 'view', ask, sourcesAtTop: true })
  expect(screen.getByRole('heading', { name: 'Prepare material' })).toBeTruthy()
  expect(screen.getByText('A complete first explanation.')).toBeTruthy()
  expect(container.querySelector('.flow-step-rail')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Ask AI/ }))
  expect(ask).toHaveBeenCalledWith({ block_id: 'flow1', item_id: 'a' })
})

it('shows a located uploaded image as the actual source, without inventing a figure for unknown locations', () => {
  const source = { id: 'photo', kind: 'image', status: 'ready', title: 'Original image', urls: { file: '/files/original.png' } }
  const sourceById = (id) => id === 'photo' ? source : null
  const original = block.nodes[0].source_refs
  block.nodes[0].source_refs = [{ source_id: 'photo', located: 'exact', bbox: [.1, .1, .8, .8] }]
  const view = mount({ kind: 'flow-node', itemId: 'a' }, { sourceById, sourcesAtTop: true })
  expect(screen.getByAltText('Original image').getAttribute('src')).toBe('/files/original.png')
  view.unmount()
  block.nodes[0].source_refs = [{ source_id: 'photo', located: 'none' }]
  mount({ kind: 'flow-node', itemId: 'a' }, { sourceById, sourcesAtTop: true })
  expect(screen.queryByAltText('Original image')).toBeNull()
  block.nodes[0].source_refs = original
})

it('shows an edge with both endpoints, its full label and its own explanation', () => {
  const ask = vi.fn()
  mount({ kind: 'flow-edge', itemId: 'ca' }, { aiAvailable: true, mode: 'view', ask })
  expect(screen.getByText('Repeat process')).toBeTruthy()
  expect(screen.getByText('Prepare material')).toBeTruthy()
  expect(screen.getByText('Repeat')).toBeTruthy()
  expect(screen.getByText('The loop returns to the beginning.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Ask AI/ }))
  expect(ask).toHaveBeenCalledWith({ block_id: 'flow1', item_id: 'ca' })
})

it('keeps the reviewed illustration specific to its authored lesson', () => {
  const authored = { ...block, nodes: [{ id: 'n1', label: 'Nanowire', description: 'Real description' }], edges: [] }
  const { rerender } = render(<I18nProvider><BlockEnvProvider value={{ shareCode: 'CHNWRE', visualContext: { visual3d: 'semiconductor_chip' } }}><FlowSlide block={authored} kind="flow-node" itemId="n1" /></BlockEnvProvider></I18nProvider>)
  expect(screen.getByRole('img', { name: 'Nanowire' })).toBeTruthy()
  rerender(<I18nProvider><BlockEnvProvider value={{ shareCode: 'OTHER' }}><FlowSlide block={authored} kind="flow-node" itemId="n1" /></BlockEnvProvider></I18nProvider>)
  expect(screen.queryByRole('img')).toBeNull()
  expect(screen.getByText('Real description')).toBeTruthy()
})
it('groups the authored descriptions and relationships without dropping content', () => {
  const select = vi.fn()
  const { container } = mount({ kind: 'flow-group', nodeIds: ['a', 'b', 'c'], edgeIds: ['ab', 'ac', 'ca'], onSelect: select })
  for (const text of ['A complete first explanation.', 'Check the actual observation.', 'Return to the start.', 'The first connection explains examination.', 'A branching path.', 'The loop returns to the beginning.']) expect(within(container.querySelector('.flow-group-copy')).getByText(text)).toBeTruthy()
  expect(container.querySelectorAll('.flow-group-nodes > li')).toHaveLength(3)
  const second = within(container.querySelector('.flow-group-nodes')).getByRole('button', { name: 'Inspect result' })
  fireEvent.click(second)
  expect(second.getAttribute('aria-pressed')).toBe('true')
  expect(select).not.toHaveBeenCalled()
  expect(container.querySelectorAll('path.flow-edge')).toHaveLength(3)
})

it('uses the correct topic preview with honest caption and falls back to the original diagram', () => {
  const { container } = mount({ kind: 'flow-group', nodeIds: ['a', 'b'], edgeIds: ['ab'] }, { shareCode: 'CHNWRE' })
  const image = screen.getByRole('img', { name: 'Topic illustration' })
  expect(image.getAttribute('src')).toBe('/paper-previews/CHNWRE.png')
  expect(screen.getByText('Topic illustration, not a figure from the paper')).toBeTruthy()
  fireEvent.error(image)
  expect(container.querySelector('.flow-wrap')).toBeTruthy()
  expect(within(container.querySelector('.flow-group-copy')).getByText('A complete first explanation.')).toBeTruthy()
})

it('uses a located real source image for the selected node and never invents one for an unlocated reference', () => {
  const source = { id: 'photo', kind: 'image', status: 'ready', title: 'Original image', urls: { file: '/files/original.png' } }
  const originalA = block.nodes[0].source_refs
  const originalB = block.nodes[1].source_refs
  block.nodes[0].source_refs = [{ source_id: 'photo', located: 'exact', bbox: [.1, .1, .8, .8] }]
  block.nodes[1].source_refs = [{ source_id: 'photo', located: 'none' }]
  const { container } = mount({ kind: 'flow-group', nodeIds: ['a', 'b'] }, { sourceById: () => source, sourcesAtTop: true })
  expect(screen.getByAltText('1. Original image').getAttribute('src')).toBe('/files/original.png')
  fireEvent.click(within(container.querySelector('.flow-group-nodes')).getByRole('button', { name: 'Inspect result' }))
  expect(screen.queryByAltText(/Original image/)).toBeNull()
  expect(container.querySelector('.flow-wrap')).toBeTruthy()
  block.nodes[0].source_refs = originalA
  block.nodes[1].source_refs = originalB
})

it('routes a diagram selection outside the active group to the deck', () => {
  const select = vi.fn()
  const { container } = mount({ kind: 'flow-group', nodeIds: ['a', 'b'], edgeIds: ['ab'], onSelect: select })
  fireEvent.click(within(container.querySelector('.flow-wrap')).getByRole('button', { name: 'Repeat process', exact: true }))
  expect(select).toHaveBeenCalledWith({ type: 'node', id: 'c' })
})
it('shows every stage with its explanation and links, and a row only chooses what the picture shows', () => {
  const { container } = mount({ kind: 'flow-group', nodeIds: ['a', 'b', 'c'], edgeIds: ['ab', 'ac', 'ca'] })
  const rows = container.querySelectorAll('.flow-group-nodes > li')
  expect([...rows].map((row) => row.classList.contains('is-active'))).toEqual([true, false, false])
  // nothing is folded away or inert: each stage shows its own explanation
  expect(container.querySelector('[inert]')).toBeNull()
  for (const [i, text] of ['A complete first explanation.', 'Check the actual observation.', 'Return to the start.'].entries()) expect(within(rows[i]).getByText(text)).toBeTruthy()
  // each stage lists where it leads: an arrow icon, the next stage, the link's label and its words
  expect(rows[0].querySelectorAll('.flow-group-connection')).toHaveLength(2)
  expect(rows[0].querySelectorAll('.flow-group-connection svg')).toHaveLength(2)
  expect(within(rows[0]).getByText('Examine')).toBeTruthy()
  expect(within(rows[0]).getByText('The first connection explains examination.')).toBeTruthy()
  expect(within(rows[2]).getByText('The loop returns to the beginning.')).toBeTruthy()
  expect(container.querySelector('.flow-group-copy').textContent).not.toContain('→')
  const third = within(rows[2]).getByRole('button', { name: 'Repeat process' })
  expect(third.hasAttribute('aria-controls')).toBe(false)
  fireEvent.click(third)
  expect(third.getAttribute('aria-pressed')).toBe('true')
  expect(rows[2].classList.contains('is-active')).toBe(true)
  expect(rows[0].classList.contains('is-active')).toBe(false)
  // the choice changes the picture only: the first stage keeps its words on screen
  expect(within(rows[0]).getByText('A complete first explanation.')).toBeTruthy()
  // a slide of several stages has no line of neighbours
  expect(container.querySelector('.flow-around')).toBeNull()
})

it('names the stages before and after a slide of one stage, in words and without arrows or dots', () => {
  const chain = { id: 'flow2', title: 'Chain', nodes: [
    { id: 'x', label: 'Evaporation', description: 'Water turns into vapour.' },
    { id: 'y', label: 'Condensation', description: 'Vapour turns into droplets.' },
    { id: 'z', label: 'Rain', description: 'Droplets fall.' },
  ], edges: [{ id: 'xy', source: 'x', target: 'y' }, { id: 'yz', source: 'y', target: 'z', label: 'grow heavy' }] }
  const { container } = mount({ block: chain, kind: 'flow-group', nodeIds: ['y'], edgeIds: ['yz'] })
  const line = container.querySelector('.flow-around')
  expect(line.textContent).toBe('Before: Evaporation. After: Rain.')
  expect(line.textContent).not.toMatch(/[→·]/)
  // the stage's own link is listed too, with its label
  expect(within(container.querySelector('.flow-group-nodes')).getByText('grow heavy')).toBeTruthy()
  cleanup()
  // without links, the list order gives the neighbours
  const unlinked = { ...chain, edges: [] }
  const first = mount({ block: unlinked, kind: 'flow-group', nodeIds: ['x'], edgeIds: [] })
  expect(first.container.querySelector('.flow-around').textContent).toBe('After: Condensation.')
})

it('shows the topic picture on the first group only, never on the later ones', () => {
  const { container } = mount({ kind: 'flow-group', nodeIds: ['b', 'c'], edgeIds: [] }, { shareCode: 'CHNWRE' })
  expect(container.querySelector('.flow-group-topic')).toBeNull()
  expect(screen.queryByRole('img', { name: 'Topic illustration' })).toBeNull()
  expect(container.querySelector('.flow-wrap')).toBeTruthy()
})

it('zooms the picture on the chosen stage and marks it with the stage number', () => {
  const source = { id: 'photo', kind: 'image', status: 'ready', title: 'Original image', width: 1200, height: 800, urls: { file: '/files/original.png' } }
  const originalA = block.nodes[0].source_refs
  block.nodes[0].source_refs = [{ source_id: 'photo', located: 'exact', bbox: [0.1, 0.1, 0.3, 0.4] }]
  const { container } = mount({ kind: 'flow-group', nodeIds: ['a', 'b'], inDeck: true }, { sourceById: () => source, sourcesAtTop: true })
  // the bead's number is spoken with the picture, since the outline layer is hidden
  const picture = screen.getByAltText('1. Original image')
  expect(Number(picture.style.transform.match(/scale\(([\d.]+)\)/)[1])).toBeGreaterThan(1)
  fireEvent.load(picture)
  expect(container.querySelector('.lk-cover-badge').textContent).toBe('1')
  // in the deck the slide names itself after its stages and adds no heading of its own
  expect(screen.getByRole('article', { name: 'Prepare material, Inspect result' })).toBeTruthy()
  expect(container.querySelector('h2, h3')).toBeNull()
  block.nodes[0].source_refs = originalA
})

it('keeps selection inside the current group when the prior group focus is stale', () => {
  const ask = vi.fn()
  const { container } = mount({ kind: 'flow-group', nodeIds: ['a', 'b'], edgeIds: ['ab'], focusItem: { type: 'node', id: 'c' } }, { aiAvailable: true, mode: 'view', ask })
  const buttons = within(container.querySelector('.flow-group-nodes'))
  expect(buttons.getByRole('button', { name: 'Prepare material' }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: /Ask AI/ }))
  expect(ask).toHaveBeenCalledWith({ block_id: 'flow1', item_id: 'a' })
})
