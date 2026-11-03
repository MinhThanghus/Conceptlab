import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { I18nProvider } from '../../../i18n/index.jsx'
import { BlockEnvProvider } from '../BlockEnv.jsx'
import DiagramBlock from './DiagramBlock.jsx'

const asset = { id: 'img1', kind: 'image', url: '/api/share/X/assets/img1/file', meta: { width: 800, height: 600 } }
const block = {
  id: 'd1',
  type: 'diagram',
  title: 'Heart',
  image: { asset_id: 'img1' },
  hotspots: [
    { id: 'h1', label: 'Left ventricle', bbox: [0.1, 0.1, 0.3, 0.3], description_simple: 'Pumps blood out.', description_detailed: 'Thick wall; pumps oxygen-rich blood into the aorta.' },
    { id: 'h2', label: 'Right atrium', bbox: [0.5, 0.5, 0.7, 0.7], description_simple: 'Receives blood.', description_detailed: 'Receives oxygen-poor blood from the body.' },
  ],
  relations: [],
}

function ui(level, extra = {}) {
  return (
    <I18nProvider>
      <BlockEnvProvider value={{ language: 'en', level, assetById: (id) => (id === 'img1' ? asset : null), sourceById: () => null, ...extra }}>
        <DiagramBlock block={block} mode="view" onChange={vi.fn()} />
      </BlockEnvProvider>
    </I18nProvider>
  )
}

beforeEach(() => {
  window.localStorage.setItem('cl.lang', 'en')
})
afterEach(cleanup)

describe('DiagramBlock (learner view)', () => {
  it('follows the lesson-wide explanation level, and its own toggle still works', () => {
    const { rerender } = render(ui('simple'))
    fireEvent.click(screen.getAllByRole('button', { name: /Left ventricle/ })[0])
    expect(document.body.textContent).toContain('Pumps blood out.')
    rerender(ui('detailed'))
    expect(document.body.textContent).toContain('Thick wall; pumps oxygen-rich blood into the aorta.')
    fireEvent.click(screen.getByRole('radio', { name: 'Simple' }))
    expect(document.body.textContent).toContain('Pumps blood out.')
  })

  it('self-test hides the words printed on the picture (blur), and learners can turn that off', () => {
    render(ui('simple'))
    const stageCol = () => document.querySelector('.dg-stage-col')
    expect(stageCol().classList.contains('is-masked')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Hide labels to test yourself' }))
    expect(stageCol().classList.contains('is-masked')).toBe(true)
    const toggle = screen.getByRole('switch', { name: 'Blur the words printed on the picture' })
    fireEvent.click(toggle)
    expect(stageCol().classList.contains('is-masked')).toBe(false)
  })

  it('self-test keeps keyboard focus: on Next after an answer, then on the new question, then on the result', () => {
    render(ui('simple'))
    fireEvent.click(screen.getByRole('button', { name: 'Hide labels to test yourself' }))
    const answer = () => {
      const group = screen.getByRole('group', { name: 'What is the highlighted part of the picture?' })
      fireEvent.click(within(group).getAllByRole('button')[0])
    }
    answer()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next question' }))
    fireEvent.click(document.activeElement)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'What is the highlighted part of the picture?' }))
    answer()
    fireEvent.click(screen.getByRole('button', { name: 'See my result' }))
    expect(document.activeElement.textContent).toMatch(/You recognised \d of 2 parts/)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'What is the highlighted part of the picture?' }))
  })

  it('on a lesson slide lets the picture lead: zoom on its well, the tools beside it with the parts', () => {
    render(ui('simple', { presentation: 'slides' }))
    const root = document.querySelector('.dg')
    expect(root.classList.contains('dg-slide')).toBe(true)
    const stageCol = root.querySelector('.dg-stage-col')
    const side = root.querySelector('.dg-side')
    // the picture fits its well's height, the zoom rides on the well
    expect(stageCol.querySelector('.lk-stage').style.getPropertyValue('--lk-max-block')).toBe('100cqh')
    expect(stageCol.querySelector('.dg-zoom [aria-label="Zoom in"], .dg-zoom button')).not.toBeNull()
    // level, self-test and the parts list share the side column
    expect(side.querySelector('.dg-toolbar [role="radio"]')).not.toBeNull()
    expect(side.querySelector('.dg-test-toggle')).not.toBeNull()
    expect(side.querySelector('.dg-parts')).not.toBeNull()
    expect(root.querySelector(':scope > .dg-toolbar')).toBeNull()
    // the self-test still works from its new place
    fireEvent.click(screen.getByRole('button', { name: 'Hide labels to test yourself' }))
    expect(stageCol.classList.contains('is-masked')).toBe(true)
  })

  it('on a slide lists each part beside its simple description, opens the first part and shows a few relations open', () => {
    const linked = {
      ...block,
      description: 'Press a part or pick it from the list.',
      relations: [{ id: 'r1', source: 'h2', target: 'h1', label: 'blood flow' }],
    }
    render(
      <I18nProvider>
        <BlockEnvProvider value={{ language: 'en', level: 'simple', presentation: 'slides', assetById: (id) => (id === 'img1' ? asset : null), sourceById: () => null }}>
          <DiagramBlock block={linked} mode="view" onChange={vi.fn()} />
        </BlockEnvProvider>
      </I18nProvider>,
    )
    const side = document.querySelector('.dg-side')
    // every part's name sits beside its simple description
    const rows = side.querySelectorAll('.dg-parts.is-described > li')
    expect(rows).toHaveLength(2)
    expect(rows[0].querySelector('.dg-part-label').textContent).toBe('Left ventricle')
    expect(rows[0].querySelector('.dg-part-desc').textContent).toBe('Pumps blood out.')
    expect(rows[1].querySelector('.dg-part-desc').textContent).toBe('Receives blood.')
    // the first part is chosen on arrival and its detailed explanation is on screen
    expect(rows[0].querySelector('button').getAttribute('aria-pressed')).toBe('true')
    expect(side.querySelector('.dg-detail').textContent).toContain('Thick wall; pumps oxygen-rich blood into the aorta.')
    expect(screen.getByRole('radio', { name: 'Detailed' }).getAttribute('aria-checked')).toBe('true')
    // the byline above already says what to do: no hint line on the side
    expect(side.textContent).not.toContain('Press a part on the picture')
    // one relation: listed under its title, not folded away
    expect(side.querySelector('details.dg-more')).toBeNull()
    expect(side.textContent).toContain('Relationship (1)')
    fireEvent.click(screen.getAllByRole('button', { name: /blood flow/ })[0])
    expect(side.querySelector('.dg-relation-name').textContent).toContain('blood flow')
  })

  it('on a slide folds more than three relations under their title', () => {
    const many = {
      ...block,
      description: 'Press a part.',
      hotspots: [...block.hotspots, { id: 'h3', label: 'Aorta', bbox: [0.4, 0.1, 0.5, 0.2] }],
      relations: [
        { id: 'r1', source: 'h2', target: 'h1' }, { id: 'r2', source: 'h1', target: 'h3' },
        { id: 'r3', source: 'h3', target: 'h2' }, { id: 'r4', source: 'h1', target: 'h2' },
      ],
    }
    render(
      <I18nProvider>
        <BlockEnvProvider value={{ language: 'en', level: 'simple', presentation: 'slides', assetById: (id) => (id === 'img1' ? asset : null), sourceById: () => null }}>
          <DiagramBlock block={many} mode="view" onChange={vi.fn()} />
        </BlockEnvProvider>
      </I18nProvider>,
    )
    const folded = document.querySelector('.dg-side details.dg-more')
    expect(folded.open).toBe(false)
    expect(folded.querySelector('summary').textContent).toBe('Relationships (4)')
  })

  it('on a slide shows many parts as a grid of names and explains the chosen one in a well, in step with the picture', () => {
    const names = ['Lungs', 'Body organs', 'Right atrium', 'Left atrium', 'Right ventricle', 'Left ventricle']
    const many = {
      ...block,
      description: 'Each part has one job along the path of blood.',
      hotspots: names.map((label, i) => ({ id: `p${i}`, label, bbox: [0.1 * i, 0.1, 0.1 * i + 0.08, 0.2], description_simple: `${label} in short.`, description_detailed: `${label} in detail, with its reason.` })),
    }
    render(
      <I18nProvider>
        <BlockEnvProvider value={{ language: 'en', level: 'simple', presentation: 'slides', assetById: (id) => (id === 'img1' ? asset : null), sourceById: () => null }}>
          <DiagramBlock block={many} mode="view" onChange={vi.fn()} />
        </BlockEnvProvider>
      </I18nProvider>,
    )
    expect(document.querySelector('.dg-slide').dataset.shape).toBe('compact')
    const side = document.querySelector('.dg-side')
    // six parts: names only, in a grid; no row carries a description
    const chips = [...side.querySelectorAll('.dg-parts.is-grid > li button')]
    expect(chips.map((chip) => chip.querySelector('.dg-part-label').textContent)).toEqual(names)
    expect(side.querySelector('.dg-part-desc')).toBeNull()
    // the first part is chosen on arrival: its simple and detailed descriptions share one well
    const well = () => side.querySelector('.dg-detail.is-well')
    expect(chips[0].getAttribute('aria-pressed')).toBe('true')
    expect(well().querySelector('h3').textContent).toBe('Lungs')
    expect(well().querySelector('.dg-well-simple').textContent).toBe('Lungs in short.')
    expect(well().querySelector('.dg-detail-text').textContent).toBe('Lungs in detail, with its reason.')
    expect(side.querySelectorAll('.dg-detail')).toHaveLength(1)
    // a name chosen in the grid lights its pin; a pin chosen on the picture presses its name
    fireEvent.click(chips[2])
    expect(well().querySelector('h3').textContent).toBe('Right atrium')
    expect(document.querySelector('.dg-marker.is-active .dg-marker-num').textContent).toBe('3')
    fireEvent.click(document.querySelectorAll('.dg-marker')[4])
    expect(chips[4].getAttribute('aria-pressed')).toBe('true')
    expect(well().querySelector('.dg-well-simple').textContent).toBe('Right ventricle in short.')
    expect(well().querySelector('.dg-detail-text').textContent).toBe('Right ventricle in detail, with its reason.')
    // both levels are on screen, so there is no level switch; the self-test stays
    expect(screen.queryByRole('radio', { name: 'Simple' })).toBeNull()
    expect(side.querySelector('.dg-test-toggle')).not.toBeNull()
  })

  it('beside a grid of names folds the relations into the tools row and explains a chosen one in the well', () => {
    const names = ['Lungs', 'Body organs', 'Right atrium', 'Left atrium', 'Right ventricle', 'Left ventricle', 'Pulmonary artery', 'Pulmonary veins', 'Aorta', 'Venae cavae']
    const many = {
      ...block,
      description: 'Each part has one job.',
      hotspots: names.map((label, i) => ({ id: `p${i}`, label, bbox: [0.09 * i, 0.1, 0.09 * i + 0.05, 0.2], description_simple: `${label} in short.` })),
      relations: [{ id: 'r1', source: 'p4', target: 'p0', label: 'pulmonary circuit', description: 'Blood goes to the lungs.' }],
    }
    render(
      <I18nProvider>
        <BlockEnvProvider value={{ language: 'en', level: 'simple', presentation: 'slides', assetById: (id) => (id === 'img1' ? asset : null), sourceById: () => null }}>
          <DiagramBlock block={many} mode="view" onChange={vi.fn()} />
        </BlockEnvProvider>
      </I18nProvider>,
    )
    const side = document.querySelector('.dg-side')
    // ten names keep to three rows of four
    expect(side.querySelector('.dg-parts.is-grid').style.getPropertyValue('--dg-cols')).toBe('4')
    expect(side.querySelector('.dg-list h3').className).toBe('visually-hidden')
    // one relation still folds, in the tools row, and opens in the well when chosen
    const folded = side.querySelector('.dg-toolbar details.dg-more')
    expect(folded.querySelector('summary').textContent).toBe('Relationship (1)')
    fireEvent.click(within(folded).getByRole('button', { name: /pulmonary circuit/ }))
    expect(side.querySelectorAll('.dg-detail')).toHaveLength(1)
    expect(side.querySelector('.dg-detail .dg-relation-name').textContent).toContain('pulmonary circuit')
    expect(side.querySelector('.dg-parts.is-grid [aria-pressed="true"]')).toBeNull()
  })

  it('on a slide keeps the described rows for a few short parts, and turns long ones into the grid', () => {
    const slide = (hotspots) => render(
      <I18nProvider>
        <BlockEnvProvider value={{ language: 'en', level: 'simple', presentation: 'slides', assetById: (id) => (id === 'img1' ? asset : null), sourceById: () => null }}>
          <DiagramBlock block={{ ...block, hotspots }} mode="view" onChange={vi.fn()} />
        </BlockEnvProvider>
      </I18nProvider>,
    )
    const five = Array.from({ length: 5 }, (_, i) => ({ id: `q${i}`, label: `Part ${i + 1}`, bbox: [0.1 * i, 0.5, 0.1 * i + 0.08, 0.6], description_simple: 'A short job.' }))
    slide(five)
    expect(document.querySelector('.dg-slide').dataset.shape).toBeUndefined()
    expect(document.querySelectorAll('.dg-parts.is-described > li')).toHaveLength(5)
    cleanup()
    // three parts whose simple descriptions run past about 300 characters
    slide(five.slice(0, 3).map((h) => ({ ...h, description_simple: 'A longer job that takes a sentence or two to say. '.repeat(3) })))
    expect(document.querySelector('.dg-slide').dataset.shape).toBe('compact')
    expect(document.querySelectorAll('.dg-parts.is-grid > li')).toHaveLength(3)
  })

  it('on a slide without a description says what to do in one quiet line', () => {
    render(ui('simple', { presentation: 'slides' }))
    const hint = document.querySelector('.dg-side .dg-hint')
    expect(hint).not.toBeNull()
    expect(hint.closest('.lk-panel')).toBeNull()
  })
})
