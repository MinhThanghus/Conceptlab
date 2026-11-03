import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider, DICTS } from '../../i18n/index.jsx'
import viVision from '../../i18n/locales/vi/vision.js'
import enVision from '../../i18n/locales/en/vision.js'
import VisionPage from './VisionPage.jsx'

beforeEach(() => { DICTS.vi.vision = viVision; DICTS.en.vision = enVision })
afterEach(() => { cleanup(); window.localStorage.clear() })

describe('image learning page', () => {
  it('lets a learner inspect a different kernel and pixel, then move the flow path', () => {
    window.localStorage.setItem('cl.lang','en')
    render(<I18nProvider><VisionPage /></I18nProvider>)
    fireEvent.change(screen.getByLabelText('Operation'),{target:{value:'sobel'}})
    fireEvent.change(screen.getByLabelText('Row'),{target:{value:'0'}})
    fireEvent.change(screen.getByLabelText('Column'),{target:{value:'0'}})
    expect(screen.getByText('Selected pixel: row 1, column 1')).toBeTruthy()
    expect(screen.getByText(/The output image shows the absolute sum/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Interpolation t/),{target:{value:'1'}})
    expect(screen.getByText(/At the selected pixel:/)).toBeTruthy()
    expect(screen.getByText(/not a denoising algorithm/)).toBeTruthy()
  })
  it('renders the same controls in Vietnamese', () => {
    window.localStorage.setItem('cl.lang','vi')
    render(<I18nProvider><VisionPage /></I18nProvider>)
    expect(screen.getByRole('heading',{name:'Khám phá ảnh và nhiễu'})).toBeTruthy()
    expect(screen.getByLabelText('Phép tính')).toBeTruthy()
    expect(screen.getByLabelText('Hàng')).toBeTruthy()
  })
})
