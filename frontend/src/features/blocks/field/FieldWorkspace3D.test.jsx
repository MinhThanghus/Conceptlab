import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../../i18n/index.jsx'
import FieldWorkspace from './FieldWorkspace.jsx'

vi.mock('./SportsField3D.jsx', () => ({ default: () => <div>3D preview</div> }))
afterEach(() => { cleanup(); window.localStorage.clear() })

it('keeps the editable 2D board visible while 3D is shown or hidden', async () => {
  window.localStorage.setItem('cl.lang', 'en')
  const { container } = render(<I18nProvider><FieldWorkspace sport="football" mode="learn" frames={[{ id: 'f1', players: [], arrows: [] }]} makeId={(prefix) => `${prefix}1`} /></I18nProvider>)
  await screen.findByText('3D preview')
  expect(container.querySelector('svg.fb-svg')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Hide 3D field' }))
  expect(screen.queryByText('3D preview')).toBeNull()
  expect(container.querySelector('svg.fb-svg')).toBeTruthy()
})
