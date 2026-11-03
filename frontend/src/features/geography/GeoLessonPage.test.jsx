import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../i18n/index.jsx'
import { resetRender3DCache } from '../../lib/three/capability.js'
import GeoLessonPage from './GeoLessonPage.jsx'

beforeEach(() => { window.localStorage.setItem('cl.lang', 'en'); resetRender3DCache() })
afterEach(() => { cleanup(); window.localStorage.clear() })

describe('geography lesson', () => {
  it('works without WebGL or Mapbox and updates the day length', () => {
    render(<I18nProvider><GeoLessonPage /></I18nProvider>)
    expect(screen.getByRole('heading', { name: 'Earth, daylight and the seasons' })).toBeTruthy()
    const lat = screen.getByLabelText(/^Latitude:/)
    fireEvent.change(lat, { target: { value: '0' } })
    expect(screen.getByText('12 hours')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open Mapbox map' }).disabled).toBe(true)
    expect(screen.queryByText('The map could not load.')).toBeNull()
  })
  it('switches a location and makes a token opt-in', () => {
    render(<I18nProvider><GeoLessonPage /></I18nProvider>)
    fireEvent.change(screen.getByLabelText('Choose a starting location'), { target: { value: 'london' } })
    expect(screen.getByLabelText(/^Latitude:/).value).toBe('51.51')
    fireEvent.change(screen.getByLabelText('Public Mapbox token'), { target: { value: 'pk.example' } })
    expect(screen.getByRole('button', { name: 'Open Mapbox map' }).disabled).toBe(false)
    expect(JSON.stringify(window.localStorage)).not.toContain('pk.example')
    fireEvent.change(screen.getByLabelText('Public Mapbox token'), { target: { value: 'sk.private' } })
    expect(screen.getByRole('button', { name: 'Open Mapbox map' }).disabled).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain('Do not enter a secret')
  })
  it('can be embedded without taking over the page title or asking for a Mapbox token', () => {
    document.title = 'Existing lesson'
    render(<I18nProvider><GeoLessonPage embedded /></I18nProvider>)
    expect(document.title).toBe('Existing lesson')
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.queryByLabelText('Public Mapbox token')).toBeNull()
    expect(screen.getByLabelText(/^Latitude:/)).toBeTruthy()
  })
  it('uses unique control IDs when the lesson contains two embedded globes', () => {
    render(<I18nProvider><GeoLessonPage embedded /><GeoLessonPage embedded /></I18nProvider>)
    const inputs = screen.getAllByLabelText(/^Latitude:/)
    expect(inputs).toHaveLength(2)
    expect(inputs[0].id).not.toBe(inputs[1].id)
  })
})
