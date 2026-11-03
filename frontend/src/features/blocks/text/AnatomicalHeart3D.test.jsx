import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../../i18n/index.jsx'
import AnatomicalHeart3D from './AnatomicalHeart3D.jsx'

vi.mock('../../../components/lab3d/support.js', () => ({ can3D: () => false }))
beforeEach(() => window.localStorage.setItem('cl.lang', 'en'))
afterEach(cleanup)

describe('anatomical heart fallback', () => {
  it('explains the unavailable 3D model, credits its source, and disables model controls', () => {
    render(<I18nProvider><AnatomicalHeart3D /></I18nProvider>)
    expect(screen.getByRole('status').textContent).toMatch(/could not be opened/i)
    expect(screen.getByRole('button', { name: /ventricular cavities/i }).disabled).toBe(true)
    expect(screen.getByRole('link', { name: /BodyParts3D/ }).getAttribute('href')).toContain('bodyparts3d')
    expect(screen.getByText(/expert anatomical review is pending/i)).toBeTruthy()
  })
})
