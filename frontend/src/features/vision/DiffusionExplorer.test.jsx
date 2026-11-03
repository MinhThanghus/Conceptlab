import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { I18nProvider } from '../../i18n/index.jsx'
import DiffusionExplorer from './DiffusionExplorer.jsx'

vi.mock('../../lib/three/capability.js', () => ({ canRender3D: () => false }))
beforeEach(() => window.localStorage.setItem('cl.lang', 'en'))
afterEach(cleanup)

it('supports exact forward endpoints and keeps the raw sample visible without WebGL', () => {
  render(<I18nProvider><DiffusionExplorer /></I18nProvider>)
  expect(screen.getByText(/not a sampled Markov trajectory/i)).toBeTruthy()
  expect(screen.getByText(/not learned denoising/i)).toBeTruthy()
  expect(screen.getByText(/WebGL is unavailable/i)).toBeTruthy()
  const slider = screen.getByLabelText(/Cumulative signal/)
  fireEvent.change(slider, { target: { value: '1' } })
  const values = within(screen.getByLabelText('Selected pixel'))
  expect(values.getByText('Unclipped xₜ').nextElementSibling.textContent).toBe(values.getByText('x₀').nextElementSibling.textContent)
  fireEvent.change(slider, { target: { value: '0' } })
  expect(values.getByText('Unclipped xₜ').nextElementSibling.textContent).toBe(values.getByText('ε').nextElementSibling.textContent)
  const initial = values.getByText('ε').nextElementSibling.textContent
  fireEvent.click(screen.getByRole('button', { name: 'Draw new noise' }))
  expect(values.getByText('ε').nextElementSibling.textContent).not.toBe(initial)
  fireEvent.click(screen.getByText('View unclipped xₜ values'))
  expect(screen.getByRole('table', { name: 'Table of unclipped xₜ values' })).toBeTruthy()
})

it('keeps the formula and scientific limitations available in Vietnamese', () => {
  window.localStorage.setItem('cl.lang', 'vi')
  render(<I18nProvider><DiffusionExplorer /></I18nProvider>)
  expect(screen.getByLabelText(/Tín hiệu tích lũy/)).toBeTruthy()
  expect(screen.getByText(/không phải khử nhiễu đã học/i)).toBeTruthy()
  expect(screen.getByText(/không lấy từ bài báo hoặc ảnh tải lên/i)).toBeTruthy()
  expect(screen.getByRole('link', { name: /Ho, Jain/ }).getAttribute('href')).toBe('https://arxiv.org/abs/2006.11239')
})
