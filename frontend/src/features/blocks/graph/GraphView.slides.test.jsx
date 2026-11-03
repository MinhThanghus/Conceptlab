import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { I18nProvider } from '../../../i18n/index.jsx'
import { BlockEnvProvider } from '../BlockEnv.jsx'
import { GraphView } from './GraphView.jsx'

const graph = { id: 'graph1', type: 'graph', title: 'Parabola', expression: 'a*x*x', x_var: 'x', x_min: -3, x_max: 3,
  params: [{ symbol: 'a', name: 'Coefficient', value: 1, min: -2, max: 2, step: .1, role: 'input' }],
  explanation: 'This is the author explanation.' }
function show(block = graph, presentation = 'slides') {
  window.localStorage.setItem('cl.lang', 'en')
  return render(<I18nProvider><BlockEnvProvider value={{ presentation }}><GraphView block={block} /></BlockEnvProvider></I18nProvider>)
}
afterEach(() => { cleanup(); window.localStorage.clear() })

describe('graph in lesson slides', () => {
  it('keeps the same slider and comparison state when navigating tabs', async () => {
    show()
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '1.5' } })
    expect(slider.value).toBe('1.5')
    const explore = screen.getByRole('tab', { name: 'Explore' })
    const results = screen.getByRole('tab', { name: 'Results and explanation' })
    fireEvent.click(results)
    expect(results.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('This is the author explanation.')).toBeTruthy()
    fireEvent.click(explore)
    expect(screen.getByRole('slider')).toBe(slider)
    expect(slider.value).toBe('1.5')
    fireEvent.click(screen.getByText('Compare two scenarios', { selector: 'summary' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep as A to compare' }))
    expect(screen.getByRole('button', { name: 'Stop comparing' })).toBeTruthy()
    fireEvent.click(results)
    fireEvent.click(explore)
    expect(screen.getByRole('button', { name: 'Stop comparing' })).toBeTruthy()
    expect(screen.getByRole('slider')).toBe(slider)
    explore.focus()
    fireEvent.keyDown(explore, { key: 'ArrowRight' })
    expect(results.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(results)
    fireEvent.keyDown(results, { key: 'ArrowRight' })
    const predict = screen.getByRole('tab', { name: 'Predict' })
    expect(predict.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(predict)
  })
  it('opens prediction in its own panel without discarding the graph', () => {
    show()
    const slider = screen.getByRole('slider')
    fireEvent.click(screen.getByRole('tab', { name: 'Predict' }))
    const predictionPanel = screen.getByRole('tabpanel', { name: 'Predict' })
    expect(within(predictionPanel).getByText(/prediction/i)).toBeTruthy()
    const radio = within(predictionPanel).getAllByRole('radio')[0]
    fireEvent.click(radio)
    fireEvent.click(screen.getByRole('tab', { name: 'Explore' }))
    expect(screen.getByRole('slider')).toBe(slider)
    fireEvent.click(screen.getByRole('tab', { name: 'Predict' }))
    expect(within(screen.getByRole('tabpanel', { name: 'Predict' })).getAllByRole('radio')[0].checked).toBe(true)
  })
  it('leaves the ordinary graph layout untabbed', () => {
    show(graph, null)
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByText('This is the author explanation.')).toBeTruthy()
    expect(screen.getByRole('slider')).toBeTruthy()
  })
  it('omits a prediction tab when there is no input to change', () => {
    show({ ...graph, expression: 'x*x', params: [] })
    expect(screen.queryByRole('tab', { name: 'Predict' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Explore' })).toBeTruthy()
  })
})
