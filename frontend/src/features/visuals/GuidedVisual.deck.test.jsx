import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '../../i18n/index.jsx'
import { BlockEnvProvider } from '../blocks/BlockEnv.jsx'
import GuidedVisual from './GuidedVisual.jsx'

vi.mock('../../components/lab3d/support.js', () => ({ can3D: () => false }))
vi.mock('../../lib/three/capability.js', () => ({ canRender3D: () => false }))

beforeEach(() => window.localStorage.setItem('cl.lang', 'en'))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** The deck's 3D slide: the model column and, beside it, the caption column with the lesson's words. */
function Slide({ kind, mode, geometry }) {
  return <BlockEnvProvider value={{ presentation: 'slides', language: 'en' }}>
    <div className="deck-visual3d">
      <div className="deck-visual3d-stage"><GuidedVisual kind={kind} initialMode={mode} initialGeometry={geometry} /></div>
      <div className="deck-visual3d-caption"><div className="prose"><p>The lesson's own words.</p></div></div>
    </div>
  </BlockEnvProvider>
}

/** jsdom has no layout: put the caption column to the right of the model column, as on a wide sheet. */
function sideBySide() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
    const box = (left, width) => ({ left, right: left + width, width, top: 0, bottom: 400, height: 400, x: left, y: 0, toJSON() {} })
    if (this.classList?.contains('deck-visual3d-stage')) return box(0, 600)
    if (this.classList?.contains('deck-visual3d-caption')) return box(624, 380)
    return box(0, 0)
  })
}

describe('a 3D scene on a lesson slide', () => {
  it('shows the stage, one row of choices and the chosen process explained, with the notes behind a disclosure', async () => {
    render(<I18nProvider><Slide kind="water_cycle" /></I18nProvider>)
    const scene = await screen.findByRole('region', { name: 'Water cycle: a cutaway landscape' })
    expect(scene.classList.contains('is-deck')).toBe(true)
    expect(scene.querySelectorAll('.stage3d-bar')).toHaveLength(1)
    // no repeated intro on the slide: the slide's own heading and caption say what to do
    expect(screen.queryByText(/Choose a process to locate it/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Infiltration' }))
    expect(screen.getByRole('status').textContent).toMatch(/replenishes groundwater/)
    const notes = screen.getByText('About this model').closest('details')
    expect(notes.open).toBe(false)
    expect(notes.textContent).toMatch(/Teaching illustration/)
  })

  it('moves the scene words into the caption column when it stands beside the model', async () => {
    sideBySide()
    const { container } = render(<I18nProvider><Slide kind="water_cycle" /></I18nProvider>)
    await screen.findByRole('button', { name: 'Rain' })
    const caption = container.querySelector('.deck-visual3d-caption')
    await waitFor(() => expect(caption.querySelector('.stage3d-aside')).toBeTruthy())
    // the lesson's words come first, the scene's follow, in the interface language
    expect(caption.firstElementChild.classList.contains('prose')).toBe(true)
    expect(caption.querySelector('.stage3d-aside').getAttribute('lang')).toBe('en')
    expect(container.querySelector('.deck-visual3d-stage .stage3d-aside')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Rain' }))
    expect(caption.textContent).toMatch(/combine, grow and fall as rain/)
  })

  it('folds the heart and the flow diagram switch into the scene row and keeps the focus on it', async () => {
    render(<I18nProvider><Slide kind="circulation" /></I18nProvider>)
    const flow = await screen.findByRole('button', { name: 'Blood flow diagram' })
    expect(flow.textContent).toBe('Diagram')
    fireEvent.click(flow)
    const pressed = await screen.findByRole('button', { name: 'Blood flow diagram' })
    expect(pressed.getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement).toBe(pressed)
    // the six stations are numbered beads in the same row, named for screen readers
    const row = pressed.closest('.stage3d-bar')
    expect(row.querySelectorAll('.stage3d-bead')).toHaveLength(6)
    fireEvent.click(screen.getByRole('button', { name: '3. Right ventricle' }))
    expect(screen.getByRole('status').textContent).toMatch(/pulmonary artery/)
  })

  it('gives the semiconductor topic, geometry and gate one compact row', async () => {
    render(<I18nProvider><Slide kind="semiconductor_chip" mode="device" geometry="nanowire" /></I18nProvider>)
    const topic = await screen.findByRole('combobox', { name: 'Choose a topic' })
    expect(topic.value).toBe('device')
    expect(screen.getByRole('combobox', { name: 'Device geometry' }).value).toBe('nanowire')
    expect(screen.queryByRole('heading', { name: 'From transistor to circuit and chip layers' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Gate high' }))
    expect(screen.getByRole('status').textContent).toMatch(/creates a channel between S and D/)
    fireEvent.change(topic, { target: { value: 'cmos' } })
    expect(screen.getByRole('button', { name: 'Check prediction' }).textContent).toBe('Check')
  })

  it('shows the molecules as a compact scene, with a flat drawing when 3D is off', async () => {
    render(<I18nProvider><Slide kind="molecular_geometry" /></I18nProvider>)
    fireEvent.click(await screen.findByRole('button', { name: 'Methane' }))
    expect(screen.getByRole('img', { name: 'Methane (CH₄)' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/tetrahedron/)
    expect(screen.getByText(/Approximate bond angle: 109.5°/)).toBeTruthy()
  })
})

describe('the same scene on a page', () => {
  it('keeps its page layout outside the deck', async () => {
    render(<I18nProvider><GuidedVisual kind="water_cycle" /></I18nProvider>)
    const scene = await screen.findByRole('region', { name: 'Water cycle: a cutaway landscape' })
    expect(scene.classList.contains('is-deck')).toBe(false)
    expect(screen.getByText(/Choose a process to locate it/)).toBeTruthy()
    expect(scene.querySelector('details.stage3d-notes')).toBeNull()
  })
})
