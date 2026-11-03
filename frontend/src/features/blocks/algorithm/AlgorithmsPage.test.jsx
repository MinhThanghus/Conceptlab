import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../../i18n/index.jsx'
import AlgorithmsPage from './AlgorithmsPage.jsx'

afterEach(() => { cleanup(); localStorage.clear() })

describe('public algorithm lessons', () => {
  it('opens a linear search in English without sorting its example', () => {
    localStorage.setItem('cl.lang', 'en')
    render(<I18nProvider><AlgorithmsPage /></I18nProvider>)
    fireEvent.change(screen.getByLabelText('Choose an algorithm'), { target: { value: 'linear_search' } })
    expect(screen.getByDisplayValue('7, 2, 9, 3, 5')).toBeTruthy()
    expect(screen.getByText(/input order is kept/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }))
    expect(screen.getByText(/Position 0 holds 7/)).toBeTruthy()
  })
  it('opens merge sort in Vietnamese and exposes the temporary buffer', () => {
    localStorage.setItem('cl.lang', 'vi')
    render(<I18nProvider><AlgorithmsPage /></I18nProvider>)
    fireEvent.change(screen.getByLabelText('Chọn thuật toán'), { target: { value: 'merge_sort' } })
    expect(screen.getByText('Sắp xếp trộn.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Đến bước cuối' }))
    expect(screen.getByText(/Dãy đã được sắp xếp/)).toBeTruthy()
  })
})
