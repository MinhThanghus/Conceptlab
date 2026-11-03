import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider, DICTS } from '../../i18n/index.jsx'
import viVision from '../../i18n/locales/vi/vision.js'
import enVision from '../../i18n/locales/en/vision.js'
import MorphologyLab from './MorphologyLab.jsx'

beforeEach(() => { DICTS.vi.vision = viVision; DICTS.en.vision = enVision })
afterEach(() => { cleanup(); window.localStorage.clear() })

describe('threshold and morphology lesson', () => {
  it('shows the selected pixel calculation and changes the result with the operation', () => {
    window.localStorage.setItem('cl.lang', 'en')
    render(<I18nProvider><MorphologyLab /></I18nProvider>)
    expect(screen.getByText('The thresholded image has 24 white pixels out of 64.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Selected row'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Selected column'), { target: { value: '2' } })
    expect(screen.getByText('Result at row 1, column 3: 1.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Morphology operation'), { target: { value: 'erode' } })
    expect(screen.getByText('Result at row 1, column 3: 0.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Brightness threshold T/), { target: { value: '1' } })
    expect(screen.getByText('The thresholded image has 0 white pixels out of 64.')).toBeTruthy()
    expect(screen.getByRole('table', { name: '3 × 3 thresholded neighbourhood' })).toBeTruthy()
  })
  it('shows the same controls and explicit border rule in Vietnamese', () => {
    window.localStorage.setItem('cl.lang', 'vi')
    render(<I18nProvider><MorphologyLab /></I18nProvider>)
    expect(screen.getByRole('heading', { name: '2. Ngưỡng và phép toán hình thái' })).toBeTruthy()
    expect(screen.getByLabelText('Phép hình thái')).toBeTruthy()
    expect(screen.getByText(/các vị trí ngoài ảnh được xem là nền 0/)).toBeTruthy()
  })
})
