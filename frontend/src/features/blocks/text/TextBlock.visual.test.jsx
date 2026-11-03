import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../../i18n/index.jsx'
import TextBlock from './TextBlock.jsx'

vi.mock('../../visuals/GuidedVisual.jsx', () => ({ default: ({kind}) => <div data-testid="scene">{kind}</div> }))
afterEach(() => { cleanup(); localStorage.clear() })

it('allows a teacher to attach, preview and remove a model without changing the source text', () => {
  localStorage.setItem('cl.lang', 'en')
  const onChange = vi.fn()
  const block = { id: 'b1', type: 'text', body: 'The original explanation.', title: 'Lesson' }
  const { rerender } = render(<I18nProvider><TextBlock block={block} mode="edit" onChange={onChange} /></I18nProvider>)
  fireEvent.change(screen.getByRole('combobox', { name: 'Guided 2D / 3D model' }), { target: { value: 'water_cycle' } })
  expect(onChange).toHaveBeenLastCalledWith({ ...block, visual3d: 'water_cycle', visual_mode: null, visual_geometry: null })
  rerender(<I18nProvider><TextBlock block={{...block, visual3d:'water_cycle'}} mode="edit" onChange={onChange} /></I18nProvider>)
  fireEvent.click(screen.getByRole('button', {name:'Preview the model'}))
  expect(screen.getByTestId('scene').textContent).toBe('water_cycle')
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
  expect(onChange).toHaveBeenLastCalledWith({ ...block, visual3d: null, visual_mode: null, visual_geometry: null })
})

it('lets teachers select a starting chip mode and clears chip settings when changing the model', () => {
  localStorage.setItem('cl.lang', 'en')
  const onChange = vi.fn()
  const block = { id: 'chip', type: 'text', body: 'Read the original paper.', visual3d: 'semiconductor_chip', visual_mode: 'cmos', visual_geometry: 'planar' }
  render(<I18nProvider><TextBlock block={block} mode="edit" onChange={onChange} /></I18nProvider>)
  fireEvent.change(screen.getByRole('combobox', { name: 'Starting view' }), { target: { value: 'memristor' } })
  expect(onChange).toHaveBeenLastCalledWith({ ...block, visual_mode: 'memristor' })
  fireEvent.change(screen.getByRole('combobox', { name: 'Guided 2D / 3D model' }), { target: { value: 'water_cycle' } })
  expect(onChange).toHaveBeenLastCalledWith({ ...block, visual3d: 'water_cycle', visual_mode: null, visual_geometry: null })
})
