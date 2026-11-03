import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../../i18n/index.jsx'
import Circulation3D from './Circulation3D.jsx'

vi.mock('../../../components/lab3d/support.js', () => ({ can3D: () => false }))
vi.mock('./AnatomicalHeart3D.jsx', () => ({ default: () => <div>Heart model</div> }))
beforeEach(() => window.localStorage.setItem('cl.lang', 'en'))
afterEach(cleanup)

describe('circulation illustration without WebGL', () => {
  it('shows an accessible fallback and follows blood flow through the lungs and heart', () => {
    render(<I18nProvider><Circulation3D /></I18nProvider>)
    expect(screen.getByRole('button', { name: '3D heart' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Blood flow diagram' }))
    expect(screen.getByRole('img', { name: /circulation diagram/i })).toBeTruthy()
    expect(screen.getByText(/2D diagram is shown/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /right ventricle/i }))
    expect(screen.getByRole('status').textContent).toMatch(/oxygen-poor blood.*pulmonary artery/i)
    fireEvent.click(screen.getByRole('button', { name: /lungs/i }))
    expect(screen.getByRole('status').textContent).toMatch(/takes up oxygen.*pulmonary veins/i)
    fireEvent.click(screen.getByRole('button', { name: /left ventricle/i }))
    expect(screen.getByRole('status').textContent).toMatch(/oxygen-rich blood.*aorta/i)
    fireEvent.click(screen.getByRole('button', { name: '3D heart' }))
    expect(screen.getByRole('button', { name: '3D heart' }).getAttribute('aria-pressed')).toBe('true')
  })
  it('uses Vietnamese throughout when the interface is Vietnamese', () => {
    window.localStorage.setItem('cl.lang', 'vi')
    render(<I18nProvider><Circulation3D /></I18nProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Sơ đồ đường đi của máu' }))
    fireEvent.click(screen.getByRole('button', { name: /tâm thất phải/i }))
    expect(screen.getByRole('status').textContent).toMatch(/nghèo oxy.*động mạch phổi/i)
    expect(screen.getByText(/sơ đồ 2D/)).toBeTruthy()
  })
})
