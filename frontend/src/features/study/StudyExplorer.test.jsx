import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '../../i18n/index.jsx'
import StudyExplorer from './StudyExplorer.jsx'
import PaperStudyLibrary from './PaperStudyLibrary.jsx'
vi.mock('../../components/lab3d/support.js', () => ({ can3D: () => false }))
beforeEach(() => localStorage.setItem('cl.lang', 'en'))
const show = (child) => render(<I18nProvider><MemoryRouter>{child}</MemoryRouter></I18nProvider>)
describe('study controls remain usable without WebGL', () => {
  it('advances a numerical model and resets concentrations without losing selected controls', () => {
    show(<StudyExplorer kind="reaction_diffusion" />)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '.8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Advance 20 numerical steps' }))
    expect(screen.getByText('Model time: 2')).toBeTruthy()
    expect(screen.getByText('Total A + B + C: 41')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reset initial concentrations' }))
    expect(screen.getByText('Model time: 0')).toBeTruthy()
    expect(screen.getByText('Total A + B + C: 41')).toBeTruthy()
    expect(screen.getByRole('slider').value).toBe('0.8')
  })
  it('changes both the crop diagram and water stage in fallback mode', () => {
    const { container } = show(<StudyExplorer kind="agriculture_field" />)
    const before = container.querySelector('.study-linked').innerHTML
    fireEvent.change(screen.getByLabelText('Crop structure'), { target: { value: 'maize' } })
    expect(container.querySelector('.study-linked').innerHTML).not.toBe(before)
    expect(container.querySelector('.study-linked').textContent).toContain('Maize')
    fireEvent.change(screen.getByLabelText('Water stage'), { target: { value: 'drained' } })
    expect(container.querySelector('.study-linked rect')).toBeNull()
  })
  it('keeps manual site counts consistent when CO2 allocation reduces room for water', () => {
    show(<StudyExplorer kind="porous_adsorption" />)
    fireEvent.change(screen.getByRole('slider', { name: /Sites marked with CO₂/ }), { target: { value: '23' } })
    expect(screen.getByRole('slider', { name: /Sites marked with H₂O/ }).value).toBe('1')
    expect(screen.getByText('CO₂: 23')).toBeTruthy()
    expect(screen.getByText('H₂O: 1')).toBeTruthy()
    expect(screen.getByText('Unmarked sites: 0')).toBeTruthy()
  })
})
it('organizes all ten papers into three domains with real source links', () => {
  const { container } = show(<PaperStudyLibrary />)
  expect(container.querySelectorAll('.research-paper-card').length).toBe(10)
  expect(container.querySelectorAll('#research-semiconductor .research-paper-card').length).toBe(5)
  expect(container.querySelectorAll('#research-agriculture .research-paper-card').length).toBe(3)
  expect(container.querySelectorAll('#research-physical_chemistry .research-paper-card').length).toBe(2)
  for (const link of screen.getAllByRole('link', { name: /Original paper/ })) expect(link.href).toMatch(/^https:\/\/pmc\.ncbi\.nlm\.nih\.gov/)
})
