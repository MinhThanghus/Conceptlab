import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { I18nProvider } from '../../../i18n/index.jsx'
import { BlockEnvProvider } from '../BlockEnv.jsx'
import StepSlide from './StepSlide.jsx'
import { OrderActivity } from './StepsBlock.jsx'
import { coverRegion, cropRegion, marginRegion } from './lessonKit.js'

const image = { id: 'image-1', kind: 'image', title: 'Original illustration', status: 'ready', width: 800, height: 600,
  urls: { file: '/source-picture.png' } }
const highlight = { source_id: image.id, bbox: [.2, .2, .7, .8], located: 'exact' }
const step = { id: 's1', title: 'Observe the system', body: 'Read the explanation first.', highlight,
  check_question: 'What changes if the input doubles?' }
const block = { id: 'steps1', type: 'steps', steps: [step] }

function view(props = {}, env = {}) {
  return render(<I18nProvider><BlockEnvProvider value={{ language: 'en', mode: 'view', sourcesAtTop: true,
    sourceById: (id) => id === image.id ? image : null, ...env }}>
    <StepSlide block={block} step={step} index={0} total={2} phase="explain" {...props} />
  </BlockEnvProvider></I18nProvider>)
}

beforeEach(() => { window.localStorage.clear(); window.localStorage.setItem('cl.lang', 'en') })
afterEach(() => { cleanup(); window.localStorage.clear() })

describe('StepSlide', () => {
  it('opens zoomed on the highlighted region beside the explanation, with the whole page on demand', () => {
    const { container } = view()
    expect(screen.getByText('Read the explanation first.')).toBeTruthy()
    expect(screen.queryByText('What changes if the input doubles?')).toBeNull()
    const figure = container.querySelector('.step-slide-visual img')
    expect(figure.getAttribute('src')).toBe('/source-picture.png')
    // the region fills the figure well: the picture is magnified around the highlight box
    expect(figure.style.transform).toMatch(/scale\((\d*\.)?\d+\)/)
    expect(Number(figure.style.transform.match(/scale\(([\d.]+)\)/)[1])).toBeGreaterThan(1)
    expect(container.querySelector('.steps-figure').classList.contains('is-zoomed')).toBe(true)
    expect(container.querySelector('.steps-figure-where')).toBeNull()
    expect(container.querySelector('.src-refs')).toBeNull()
    expect(screen.queryByRole('button', { name: /open in source/i })).toBeNull()
    // The whole page remains available on demand, and the region comes back.
    const toggle = container.querySelector('.steps-figure-tools button')
    expect(toggle.textContent).toBe('Show the whole page')
    fireEvent.click(toggle)
    const whole = container.querySelector('.step-slide-visual img')
    expect(whole.getAttribute('src')).toBe('/source-picture.png')
    expect(whole.style.inlineSize).toBe('100%') // the full picture, even with a smaller highlight box
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(toggle)
    expect(container.querySelector('.steps-figure').classList.contains('is-zoomed')).toBe(true)
  })

  it('gives the question its own page and sends the entered answer to the tutor', () => {
    const ask = vi.fn()
    view({ phase: 'question' }, { aiAvailable: true, ask })
    expect(screen.queryByText('Read the explanation first.')).toBeNull()
    expect(screen.getByText('What changes if the input doubles?')).toBeTruthy()
    expect(screen.getByRole('img').getAttribute('src')).toBe('/source-picture.png')
    const answer = screen.getByRole('textbox')
    const askButton = screen.getByRole('button', { name: /ask.*ai/i })
    expect(askButton.disabled).toBe(true)
    fireEvent.change(answer, { target: { value: 'The output becomes larger.' } })
    fireEvent.click(askButton)
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ block_id: 'steps1', item_id: 's1', selection: 'The output becomes larger.' }))
  })

  it('keeps answers per step while switching explanation and question pages', () => {
    const second = { ...step, id: 's2', title: 'Another stage', check_question: 'Why does it change?' }
    const renderPage = (current, phase) => <I18nProvider><BlockEnvProvider value={{ language: 'en', mode: 'view', sourcesAtTop: true, sourceById: () => image }}>
      <StepSlide block={block} step={current} index={current.id === 's1' ? 0 : 1} total={2} phase={phase} />
    </BlockEnvProvider></I18nProvider>
    const { rerender } = render(renderPage(step, 'question'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My first answer' } })
    rerender(renderPage(step, 'explain'))
    rerender(renderPage(second, 'question'))
    expect(screen.getByRole('textbox').value).toBe('')
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A different answer' } })
    rerender(renderPage(step, 'question'))
    expect(screen.getByRole('textbox').value).toBe('My first answer')
    rerender(renderPage(second, 'question'))
    expect(screen.getByRole('textbox').value).toBe('A different answer')
  })

  it('combines a short explanation, image and question and preserves its draft', () => {
    const ask = vi.fn()
    const renderPage = (phase) => <I18nProvider><BlockEnvProvider value={{ language: 'en', mode: 'view', sourcesAtTop: true,
      aiAvailable: true, ask, sourceById: () => image }}>
      <StepSlide block={block} step={step} index={0} total={2} phase={phase} />
    </BlockEnvProvider></I18nProvider>
    const { rerender, container } = render(renderPage('combined'))
    expect(screen.getByText('Read the explanation first.')).toBeTruthy()
    expect(screen.getByText('What changes if the input doubles?')).toBeTruthy()
    expect(container.querySelector('.step-slide-visual img').getAttribute('src')).toBe('/source-picture.png')
    expect(container.querySelector('.step-slide-meta')).toBeNull()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A short prediction' } })
    rerender(renderPage('explain'))
    rerender(renderPage('combined'))
    expect(screen.getByRole('textbox').value).toBe('A short prediction')
    fireEvent.click(screen.getByRole('button', { name: /ask.*ai/i }))
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ item_id: 's1', selection: 'A short prediction' }))
  })

  it('shows a labeled conceptual illustration for a paper preview, including teacher preview', () => {
    const noImage = { ...step, highlight: null, source_refs: [{ source_id: 'note-1', located: 'none' }] }
    const note = { id: 'note-1', kind: 'note', text: 'Source DOI: 10.1186/s11671-016-1396-7' }
    view({ step: noImage }, { space: 'paper2explorer', shareCode: null, sources: [note], sourceById: () => note })
    expect(screen.getByRole('img').getAttribute('src')).toBe('/paper-previews/CHNWRE.png')
    expect(screen.getByText('Topic illustration, not a figure from the paper')).toBeTruthy()
  })

  it('shows the topic picture once, on the first step of a part, never repeated on later steps', () => {
    const noImage = { ...step, highlight: null, source_refs: [] }
    const { container, rerender } = view({ step: noImage, index: 0 }, { shareCode: 'CHNWRE' })
    expect(container.querySelector('.step-slide-topic img').getAttribute('src')).toBe('/paper-previews/CHNWRE.png')
    rerender(<I18nProvider><BlockEnvProvider value={{ language: 'en', mode: 'view', sourcesAtTop: true, shareCode: 'CHNWRE', sourceById: () => null }}>
      <StepSlide block={block} step={{ ...noImage, id: 's2' }} index={1} total={2} phase="explain" />
    </BlockEnvProvider></I18nProvider>)
    expect(container.querySelector('.step-slide-visual')).toBeNull()
    expect(container.querySelector('.step-slide').classList.contains('no-visual')).toBe(true)
  })

  it('never sets short text large: the body stays at body size and only a first sentence with more after it leads', () => {
    const { container } = view()
    const article = () => container.querySelector('article.step-slide')
    // one short sentence beside a figure: body text, no lead, no enlarged state
    expect(article().classList.contains('has-visual')).toBe(true)
    expect(article().className).not.toMatch(/is-(statement|brief)/)
    expect(container.querySelector('.step-slide-lead')).toBeNull()
    expect(container.querySelector('.step-slide-body').textContent).toBe('Read the explanation first.')
    cleanup()
    // more than one sentence: the first (150 characters or fewer) leads, the rest is the body
    const two = view({ step: { ...step, body: 'A pendulum swings back and forth. Its period depends on the length of the string.' } })
    expect(two.container.querySelector('.step-slide-lead').textContent).toBe('A pendulum swings back and forth.')
    expect(two.container.querySelector('.step-slide-body').textContent).toBe('Its period depends on the length of the string.')
    cleanup()
    // a decimal point or inline math never ends the first sentence
    const math = view({ step: { ...step, body: 'With $g = 9.8$ the period is 2.0 s. Then compare.' } })
    expect(math.container.querySelector('.step-slide-body').textContent).toBe('Then compare.')
    cleanup()
    // a first sentence over 150 characters stays in the body, and so does a body that opens with a list
    const longFirst = `${'Một vật nhỏ treo vào sợi dây không dãn và dao động quanh vị trí cân bằng, '.repeat(3)}rồi dừng lại. Câu thứ hai.`
    const third = view({ step: { ...step, body: longFirst } })
    expect(third.container.querySelector('.step-slide-lead')).toBeNull()
    expect(third.container.querySelector('.step-slide-body').textContent).toContain('Câu thứ hai.')
    cleanup()
    const list = view({ step: { ...step, body: '- First point.\n- Second point.' } })
    expect(list.container.querySelector('.step-slide-lead')).toBeNull()
    cleanup()
    // a page that asks keeps its question as the one line at lead size
    const asks = view({ phase: 'combined', step: { ...step, body: 'First sentence. Second sentence.' } })
    expect(asks.container.querySelector('.step-slide-lead')).toBeNull()
    expect(asks.container.querySelector('.step-slide-body').textContent).toBe('First sentence. Second sentence.')
    cleanup()
    // no figure: a long body reads in two columns across the sheet, a short one in one column
    const plain = { ...step, highlight: null, source_refs: [], check_question: null }
    const wide = view({ step: { ...plain, body: 'Một vật nhỏ treo vào sợi dây không dãn. '.repeat(12) } })
    expect(wide.container.querySelector('article.step-slide').classList.contains('no-visual')).toBe(true)
    expect(wide.container.querySelector('article.step-slide').classList.contains('has-columns')).toBe(true)
    cleanup()
    const narrow = view({ step: { ...plain, body: 'Một vật nhỏ treo vào sợi dây không dãn.' } })
    expect(narrow.container.querySelector('article.step-slide').classList.contains('has-columns')).toBe(false)
  })

  it('in the deck leaves the title and position to the deck heading and names the page for assistive technology', () => {
    const { container } = view({ inDeck: true })
    expect(container.querySelector('h3')).toBeNull()
    expect(container.querySelector('.step-slide-meta')).toBeNull()
    expect(screen.getByRole('article', { name: 'Observe the system' })).toBeTruthy()
    // outside the deck the page keeps its own title
    cleanup()
    view()
    expect(screen.getByRole('heading', { name: 'Observe the system' })).toBeTruthy()
  })

  it('marks the question with one coral bead and gives the answer three lines on its own page', () => {
    const { container } = view({ phase: 'question', inDeck: true }, { aiAvailable: true, ask: vi.fn() })
    const check = container.querySelector('.steps-check.is-slide')
    expect(check).not.toBeNull()
    expect(check.querySelectorAll('.steps-check-bead')).toHaveLength(1)
    expect(within(check).getByText('What changes if the input doubles?')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Your answer' }).getAttribute('rows')).toBe('3')
    expect(container.querySelector('.step-slide').classList.contains('is-question')).toBe(true)
  })

  it('says on the first page when the order of the steps is not confirmed, and only there', () => {
    const { container, rerender } = view({ block: { ...block, sequence_confirmed: false, ai_generated: true }, inDeck: true })
    expect(container.querySelector('.step-slide-notice').textContent).toBe('Order suggested by AI, not yet confirmed by the teacher')
    rerender(<I18nProvider><BlockEnvProvider value={{ language: 'en', mode: 'view', sourcesAtTop: true, sourceById: () => image }}>
      <StepSlide block={{ ...block, sequence_confirmed: false }} step={step} index={1} total={2} phase="explain" inDeck />
    </BlockEnvProvider></I18nProvider>)
    expect(container.querySelector('.step-slide-notice')).toBeNull()
    rerender(<I18nProvider><BlockEnvProvider value={{ language: 'en', mode: 'view', sourcesAtTop: true, sourceById: () => image }}>
      <StepSlide block={{ ...block, sequence_confirmed: true }} step={step} index={0} total={2} phase="explain" inDeck />
    </BlockEnvProvider></I18nProvider>)
    expect(container.querySelector('.step-slide-notice')).toBeNull()
  })

  it('keeps the "temporary" note beside the button on a shared slide and still describes the field with it', () => {
    view({ phase: 'combined', inDeck: true }, { aiAvailable: true, ask: vi.fn() })
    const answer = screen.getByRole('textbox', { name: 'Your answer' })
    const note = document.getElementById(answer.getAttribute('aria-describedby'))
    expect(note.textContent).toBe('Your answer is temporary.')
    expect(note.closest('.steps-check-actions')).not.toBeNull()
  })

  it('does not invent a figure when no usable source or known topic exists', () => {
    const { container } = view({ step: { ...step, highlight: null, source_refs: [] } }, { sources: [], shareCode: null })
    expect(container.querySelector('.step-slide-visual')).toBeNull()
    expect(screen.getByText('Read the explanation first.')).toBeTruthy()
  })

  it('retains source details and a citation action when sources are not consolidated', () => {
    const openSource = vi.fn()
    const { container } = view({ step: { ...step, source_refs: [highlight] } }, { sourcesAtTop: false, openSource })
    expect(container.querySelector('.steps-figure-where').textContent).toContain('Original illustration')
    const chip = container.querySelector('.src-refs button')
    expect(chip).not.toBeNull()
    fireEvent.click(chip)
    expect(openSource).toHaveBeenCalledWith(highlight)
  })
})

describe('coverRegion (a region that fills its well)', () => {
  const page = { width: 1240, height: 1754 }
  const inside = (crop, box) => crop[0] <= box[0] && crop[1] <= box[1] && crop[2] >= box[2] && crop[3] >= box[3]
  const pixelAspect = (crop, size) => ((crop[2] - crop[0]) * size.width) / ((crop[3] - crop[1]) * size.height)

  it('takes the shape of the box and keeps the highlight in view', () => {
    const lines = [0.0831, 0.2156, 0.6209, 0.2799] // three lines of a textbook page
    const crop = coverRegion(lines, { natural: page, boxAspect: 1.35, boxWidth: 700 })
    expect(pixelAspect(crop, page)).toBeCloseTo(1.35, 2)
    expect(inside(crop, lines)).toBe(true)
    crop.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    })
  })

  it('never magnifies a small photo region beyond the zoom limit', () => {
    const photo = { width: 1200, height: 900 }
    const ball = [0.565, 0.5856, 0.6433, 0.6878]
    const crop = coverRegion(ball, { natural: photo, boxAspect: 1.4, boxWidth: 840, maxZoom: 1.6 })
    expect((crop[2] - crop[0]) * photo.width).toBeGreaterThanOrEqual(840 / 1.6 - 1)
    expect(inside(crop, ball)).toBe(true)
    expect(pixelAspect(crop, photo)).toBeCloseTo(1.4, 2)
  })

  it('zooms in rather than leave a band when the box is wider than the picture allows', () => {
    const crop = coverRegion([0.1, 0.1, 0.9, 0.9], { natural: page, boxAspect: 3 })
    expect(crop[2] - crop[0]).toBeCloseTo(1, 4)
    expect(pixelAspect(crop, page)).toBeCloseTo(3, 2)
  })

  it('falls back to the region with its margin when the sizes are not known yet', () => {
    expect(coverRegion([0.2, 0.2, 0.7, 0.8], { natural: null, boxAspect: 1.3 })).toEqual(marginRegion([0.2, 0.2, 0.7, 0.8]))
    expect(coverRegion([0.2, 0.2, 0.7, 0.8], { natural: page, boxAspect: 0 })).toEqual([0.17, 0.17, 0.73, 0.83])
    // a wide box keeps a narrow frame (legible), unlike the zoom that grows with the box
    const lines = marginRegion([0.08, 0.45, 0.63, 0.53])
    expect(lines[2] - lines[0]).toBeCloseTo(0.61, 4)
    expect(cropRegion([0.08, 0.45, 0.63, 0.53])[2] - cropRegion([0.08, 0.45, 0.63, 0.53])[0]).toBeGreaterThan(0.9)
    // no highlight: the picture's centre covers the box, like object-fit: cover
    const centred = coverRegion(null, { natural: page, boxAspect: 1.3 })
    expect(centred[0]).toBe(0)
    expect(centred[2]).toBe(1)
    expect(centred[1] + centred[3]).toBeCloseTo(1, 3)
  })
})

describe('OrderActivity on a lesson slide', () => {
  const ordered = { id: 'order1', type: 'steps', sequence_confirmed: true,
    steps: ['Prepare', 'Release', 'Measure'].map((title, i) => ({ id: `o${i}`, title, body: '', highlight: { source_id: image.id, bbox: [0.1, 0.1, 0.5, 0.5] } })) }
  const show = (env = {}) => render(<I18nProvider><BlockEnvProvider value={{ language: 'en', mode: 'view', sourceById: () => image, ...env }}>
    <OrderActivity block={ordered} />
  </BlockEnvProvider></I18nProvider>)

  it('shows no crop of the printed page in the deck and says each verdict in words', () => {
    const { container } = show({ presentation: 'slides' })
    expect(container.querySelector('.steps-order').classList.contains('is-deck')).toBe(true)
    expect(container.querySelector('.steps-order-thumb')).toBeNull()
    expect(container.querySelectorAll('img')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Check the order' }))
    const verdicts = [...container.querySelectorAll('.steps-order-verdict')].map((el) => el.textContent)
    expect(verdicts).toHaveLength(3)
    expect(verdicts.every((text) => ['In the right place', 'Not in the right place yet'].includes(text))).toBe(true)
    expect(container.querySelector('.steps-order-result').textContent).toMatch(/of 3 steps are in the right place/)
    fireEvent.click(screen.getByRole('button', { name: 'Show the answer' }))
    expect(container.querySelector('.steps-order-verdict.lk-bad').textContent).toMatch(/^Belongs at position \d$/)
  })

  it('keeps the crops beside the steps outside the deck', () => {
    const { container } = show({ presentation: 'reading' })
    expect(container.querySelectorAll('.steps-order-thumb')).toHaveLength(3)
    expect(container.querySelector('.steps-order').classList.contains('is-deck')).toBe(false)
  })
})
