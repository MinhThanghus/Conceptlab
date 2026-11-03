import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../i18n/index.jsx'
import { MoleculeDeckScene } from './MoleculeScene.jsx'

vi.mock('../../lib/three/capability.js', () => ({ canRender3D: () => false }))
beforeEach(() => window.localStorage.setItem('cl.lang', 'en'))
afterEach(cleanup)

describe('molecules on a slide without 3D', () => {
  it('names every atom by its symbol, not by colour alone', () => {
    render(<I18nProvider><MoleculeDeckScene /></I18nProvider>)
    const symbols = () => [...document.querySelectorAll('.molecule-flat text')].map((el) => el.textContent)
    expect(symbols()).toEqual(['H', 'H', 'O'])
    fireEvent.click(screen.getByRole('button', { name: 'Carbon dioxide' }))
    expect(symbols()).toEqual(['O', 'O', 'C'])
    expect(screen.getByRole('img', { name: 'Carbon dioxide (CO₂)' })).toBeTruthy()
  })
})
