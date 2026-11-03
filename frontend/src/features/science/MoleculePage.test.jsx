import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '../../i18n/index.jsx'
import MoleculePage, { MoleculeExplorer } from './MoleculePage.jsx'

afterEach(() => { cleanup(); window.localStorage.clear() })

describe('molecular shapes lesson', () => {
  it('offers the same educational content without WebGL and switches molecules', () => {
    window.localStorage.setItem('cl.lang', 'en')
    render(<MemoryRouter><I18nProvider><MoleculePage /></I18nProvider></MemoryRouter>)
    expect(screen.getByText(/3D is unavailable/)).toBeTruthy()
    expect(screen.getByText('104.5°')).toBeTruthy()
    fireEvent.click(screen.getByLabelText(/Carbon dioxide/))
    expect(screen.getByText('180°')).toBeTruthy()
    fireEvent.click(screen.getByLabelText(/Methane/))
    expect(screen.getByText('109.5°')).toBeTruthy()
  })
  it('can embed multiple independent explorers without changing the page title', () => {
    window.localStorage.setItem('cl.lang', 'en')
    document.title = 'Existing lesson'
    render(<MemoryRouter><I18nProvider><MoleculeExplorer embedded /><MoleculeExplorer embedded /></I18nProvider></MemoryRouter>)
    expect(document.title).toBe('Existing lesson')
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    const choices = screen.getAllByLabelText(/Carbon dioxide/)
    fireEvent.click(choices[0])
    expect(choices[0].checked).toBe(true)
    expect(choices[1].checked).toBe(false)
  })
})
