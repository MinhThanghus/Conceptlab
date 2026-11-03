import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '../../i18n/index.jsx'
import GuidedVisual from './GuidedVisual.jsx'

afterEach(() => { cleanup(); window.localStorage.clear() })

describe('repeated guided models', () => {
  it.each([
    ['circulation', '.circulation3d-shell'], ['enzyme_binding', '.research3d'],
    ['molecular_geometry', '.science-embedded'], ['solar_globe', '.geo-page-embedded'],
    ['water_cycle', '.water-cycle'], ['population_grid', '.research3d'],
    ['image_relief', '.vision-embedded'], ['data_tree', '.structures-embedded'],
  ])('%s keeps IDs unique across two instances', async (kind, selector) => {
    window.localStorage.setItem('cl.lang', 'en')
    const { container } = render(<MemoryRouter><I18nProvider><GuidedVisual kind={kind} /><GuidedVisual kind={kind} /></I18nProvider></MemoryRouter>)
    await waitFor(() => expect(container.querySelectorAll(selector)).toHaveLength(2))
    const ids = [...container.querySelectorAll('[id]')].map((element) => element.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
