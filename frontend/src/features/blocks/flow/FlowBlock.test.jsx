import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../../i18n/index.jsx'
import { BlockEnvProvider } from '../BlockEnv.jsx'
import FlowBlock from './FlowBlock.jsx'

const block = {
  id: 'flow', type: 'flow', title: 'Reading the research', layout: 'linear',
  nodes: ['Make the channel', 'Compare devices', 'Trace a logic state', 'Check the model'].map((label, i) => ({ id: `n${i+1}`, label, description: `Explanation ${i+1}` })),
  edges: [1,2,3].map(i => ({ id: `e${i}`, source: `n${i}`, target: `n${i+1}`, description: `Relationship ${i}` })),
}
const mount = (overrides = {}, value = {}) => render(<I18nProvider><BlockEnvProvider value={{shareCode: 'CHNWRE', visualContext: {visual3d: 'semiconductor_chip'}, ...value}}><FlowBlock block={{...block, ...overrides}} /></BlockEnvProvider></I18nProvider>)
beforeEach(() => window.localStorage.setItem('cl.lang', 'en'))
afterEach(() => { cleanup(); vi.useRealTimers() })

it('opens on an illustrated first step and switches explanation and illustration together', () => {
  mount()
  expect(screen.getByRole('img', { name: 'Make the channel' })).toBeTruthy()
  expect(screen.getByText('Explanation 1')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '2 Compare devices' }))
  expect(screen.getByText('Explanation 2')).toBeTruthy()
  expect(screen.queryByText('Explanation 1')).toBeNull()
  // the switch states are text a screen reader reaches, not hidden inside one image
  expect(screen.queryByRole('img', { name: 'Compare devices' })).toBeNull()
  expect(screen.getByText('One shared input: 0')).toBeTruthy()
  expect(screen.getByText('On')).toBeTruthy()
  expect(screen.getByText('Off')).toBeTruthy()
})

it('says which item the explanation now shows when the learner picks one', () => {
  mount()
  const live = document.querySelector('.flow [aria-live="polite"]')
  fireEvent.click(screen.getByRole('button', { name: '3 Trace a logic state' }))
  expect(live.textContent).toBe('Now showing: Trace a logic state')
  fireEvent.click(screen.getByRole('button', { name: 'Arrow from “Make the channel” to “Compare devices”' }))
  expect(live.textContent).toBe('Now showing: Arrow from “Make the channel” to “Compare devices”')
})

it('keeps relationships accessible and next-step navigation direct', () => {
  mount()
  fireEvent.click(screen.getByRole('button', { name: 'Arrow from “Make the channel” to “Compare devices”' }))
  expect(screen.getByText('Relationship 1')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Compare devices', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Trace a logic state', exact: true }))
  expect(screen.getByRole('img', { name: 'Trace a logic state' })).toBeTruthy()
})

it('does not substitute curated semiconductor pictures into unrelated lessons', () => {
  mount({}, {shareCode: 'CUSTOM'})
  expect(screen.queryByRole('img')).toBeNull()
  expect(screen.getByText('Explanation 1')).toBeTruthy()
})

it('retains the graph for cycles and branches', () => {
  const {container} = mount({layout: 'cycle', edges: [...block.edges, {id: 'loop', source: 'n4', target: 'n1'}]})
  expect(container.querySelector('.flow-wrap')).toBeTruthy()
  expect(container.querySelector('.flow-step-rail')).toBeNull()
})

it('runs through nodes and edges, and stops when the learner chooses a step', () => {
  vi.useFakeTimers()
  mount()
  fireEvent.click(screen.getByRole('button', {name: 'Run the flow'}))
  act(() => vi.advanceTimersByTime(6500))
  expect(screen.getByText('Relationship 1')).toBeTruthy()
  act(() => vi.advanceTimersByTime(4000))
  expect(screen.getByText('Explanation 2')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', {name: '4 Check the model'}))
  expect(screen.getByRole('button', {name: 'Run the flow'})).toBeTruthy()
  expect(screen.getByText('Explanation 4')).toBeTruthy()
  act(() => vi.advanceTimersByTime(20000))
  expect(screen.getByText('Explanation 4')).toBeTruthy()
})
