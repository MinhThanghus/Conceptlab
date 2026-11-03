import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '../../i18n/index.jsx'
import PublicLabCard from './PublicLabCard.jsx'

vi.mock('../labs/LabCover.jsx', () => ({ default: () => <div /> }))
beforeEach(() => window.localStorage.setItem('cl.lang', 'en'))
afterEach(() => { cleanup(); window.localStorage.clear() })
it('presents the prepared title, topic, and displayed language consistently', () => {
  const lab = { share_code: 'ABC234', title: 'Vietnamese original', topic: 'Original topic', language: 'vi', display_title: 'Prepared title', display_topic: 'Prepared topic', display_language: 'en', subject: 'physics', grade: '10', block_count: 2 }
  render(<MemoryRouter><I18nProvider><PublicLabCard lab={lab} /></I18nProvider></MemoryRouter>)
  const card=screen.getByRole('article')
  expect(within(card).getByRole('link', { name: 'Prepared title' }).getAttribute('lang')).toBe('en')
  expect(within(card).getByText('Prepared topic').getAttribute('lang')).toBe('en')
  expect(within(card).getByText('English')).toBeTruthy()
  expect(within(card).queryByText('Vietnamese original')).toBeNull()
})
