import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../i18n/index.jsx'
import EmbeddedTree3D from './EmbeddedTree3D.jsx'

vi.mock('../../lib/three/capability.js', () => ({ canRender3D: () => false }))
beforeEach(() => window.localStorage.setItem('cl.lang', 'en'))
afterEach(cleanup)

describe('embedded tree example', () => {
  it('keeps the diagram, BFS steps and queue available without 3D', () => {
    render(<I18nProvider><EmbeddedTree3D /></I18nProvider>)
    expect(screen.getByText(/not data extracted from the uploaded source/)).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Example binary tree' }).textContent).toContain('8')
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }))
    expect(screen.getByText('8', { selector: 'strong' })).toBeTruthy()
    expect(screen.getByText('Queue: 3, 10')).toBeTruthy()
  })
})
