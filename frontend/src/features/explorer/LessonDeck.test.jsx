import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { I18nProvider } from '../../i18n/index.jsx'
import { BlockEnvProvider } from '../blocks/BlockEnv.jsx'
import LessonDeck from './LessonDeck.jsx'

vi.mock('../blocks/BlockRenderer.jsx', () => ({
  BlockRenderer: () => <div><input type="range" aria-label="Graph control" defaultValue="2" min="0" max="5" /></div>,
  BlockFrame: ({ children }) => <div>{children}</div>,
}))
vi.mock('../blocks/steps/lessonHooks.js', async (importOriginal) => ({
  ...(await importOriginal()), useElementSize: () => ({ width: 640, height: 300 }),
}))

const blocks = [
  { id: 'steps', type: 'steps', title: 'A guided step', steps: [{ id: 'step1', title: 'Explore motion', body: 'Observe the real result.', check_question: 'What do you predict?' }] },
  { id: 'flow', type: 'flow', title: 'A process', layout: 'linear',
    nodes: [{ id: 'a', label: 'Start here', description: 'Start description.' }, { id: 'b', label: 'Finish here', description: 'Finish description.' },
      { id: 'c', label: 'Review here', description: 'Review description.' }],
    edges: [{ id: 'edge1', source: 'a', target: 'b', label: '', description: '' }, { id: 'edge2', source: 'b', target: 'c', label: '', description: '' }] },
  { id: 'plot', type: 'graph', title: 'Plot activity' },
]
const lab = { id: 'lab1', title: 'Test lesson', language: 'en' }
function mount(props = {}) {
  return render(<I18nProvider><BlockEnvProvider value={{ sourcesAtTop: true }}>
    <LessonDeck lab={lab} blocks={blocks} intro={<p>Introduction content</p>} objectives={[]} assumptions={[]} {...props} />
  </BlockEnvProvider></I18nProvider>)
}
const kind = (container) => container.querySelector('.deck-paper').dataset.deckKind
async function choose(text) {
  fireEvent.click(screen.getByRole('button', { name: 'Contents' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: new RegExp(text) }))
}
beforeEach(() => { window.localStorage.clear(); window.localStorage.setItem('cl.lang', 'en'); Element.prototype.scrollIntoView = vi.fn() })
afterEach(() => { cleanup(); window.localStorage.clear() })

it('starts at the introduction and navigates with previous and next', async () => {
  const { container } = mount()
  expect(screen.getByText('Introduction content')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Previous' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(await screen.findByText('Observe the real result.')).toBeTruthy()
  expect(container.querySelector('.deck-paper').dataset.deckKind).toBe('step')
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
  expect(screen.getByText('Introduction content')).toBeTruthy()
})

it('preserves a question draft when leaving and revisiting the page', async () => {
  const { container } = mount()
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(await screen.findByText('Observe the real result.')).toBeTruthy()
  const answer = await screen.findByRole('textbox', { name: 'Your answer' })
  fireEvent.change(answer, { target: { value: 'My prediction' } })
  fireEvent.keyDown(answer, { key: 'ArrowRight' })
  expect(container.querySelector('.deck-paper').dataset.deckKind).toBe('step')
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
  expect(screen.getByText('Introduction content')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.getByRole('textbox', { name: 'Your answer' }).value).toBe('My prediction')
})

it('shows three short flow descriptions together and highlights diagram selections on the same page', async () => {
  const { container } = mount()
  await choose('Start here')
  const group = await waitFor(() => {
    const element = container.querySelector('.flow-group')
    expect(element).not.toBeNull()
    return element
  })
  // three stages fill a group sheet (lessonSlides.js FLOW_NODE_LIMIT)
  expect(group.querySelectorAll('.flow-group-nodes li')).toHaveLength(3)
  for (const text of ['Start description.', 'Finish description.', 'Review description.']) {
    expect(within(group.querySelector('.flow-group-copy')).getByText(text)).toBeTruthy()
  }
  expect(container.querySelector('.deck-paper').dataset.deckKind).toBe('flow-group')
  fireEvent.click(within(group.querySelector('.flow-wrap')).getByRole('button', { name: 'Finish here', exact: true }))
  expect(within(group.querySelector('.flow-group-nodes')).getByRole('button', { name: 'Finish here' }).getAttribute('aria-pressed')).toBe('true')
  expect(container.querySelector('.deck-paper').dataset.deckKind).toBe('flow-group')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(await screen.findByRole('slider', { name: 'Graph control' })).toBeTruthy()
})

it('heads a step slide with the step title, and keeps the part in the bar', async () => {
  const { container } = mount()
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(await screen.findByText('Observe the real result.')).toBeTruthy()
  const heading = container.querySelector('.deck-heading')
  expect(within(heading).getByRole('heading', { level: 2 }).textContent).toBe('Explore motion')
  expect(heading.querySelector('.deck-byline').textContent).toContain('Step 1 of 1')
  expect(container.querySelectorAll('.deck-heading h2')).toHaveLength(1)
  expect(container.querySelector('.deck-crumb-part').textContent).toBe('A guided step')
})

it('opens on the cover and starts the lesson from its own button', async () => {
  const { container } = mount()
  expect(kind(container)).toBe('intro')
  expect(container.querySelector('.deck-heading')).toBeNull()
  expect(container.querySelector('.deck-cover-media .lab-cover')).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Start the lesson' }))
  expect(await screen.findByText('Observe the real result.')).toBeTruthy()
  expect(kind(container)).toBe('step')
})

it('puts whole goals on cards, at most four a slide, without losing one', async () => {
  const objectives = ['Name the parts.', 'Use the formula.', 'Explain the period.', 'Measure a swing.', 'Compare two lengths.', 'Predict a result.']
  const { container } = mount({ objectives, assumptions: [{ id: 'a1', text: 'Small angles only.' }] })
  const shown = []
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(kind(container)).toBe('goals')
  expect(within(container.querySelector('.deck-heading')).getByRole('heading', { level: 2 }).textContent).toBe('Learning goals')
  for (const page of [0, 1]) {
    const cards = [...container.querySelectorAll('.deck-page:not([hidden]) .deck-goal')]
    expect(cards).toHaveLength(3)
    cards.forEach((card) => shown.push([card.querySelector('.deck-goal-n').textContent, card.querySelector('.deck-goal-text').textContent]))
    if (page === 0) fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  }
  expect(shown).toEqual(objectives.map((goal, i) => [String(i + 1), goal]))
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(kind(container)).toBe('assumptions')
  expect(container.querySelector('.deck-assumption').textContent).toContain('Small angles only.')
  fireEvent.click(screen.getByRole('button', { name: 'Contents' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByRole('button', { name: /Learning goals \(1 of 2\)/ })).toBeTruthy()
  expect(within(dialog).getByRole('button', { name: /Learning goals \(2 of 2\)/ })).toBeTruthy()
})

it('folds one or two assumptions into a goals sheet that holds every goal', async () => {
  const assumptions = [{ id: 'a1', text: 'Small angles only.' }, { id: 'a2', text: 'No air drag.' }]
  const { container } = mount({ objectives: ['Name the parts.', 'Use the formula.'], assumptions })
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(kind(container)).toBe('goals')
  const sheet = container.querySelector('.deck-page:not([hidden])')
  expect(sheet.querySelector('.deck-goals').dataset.count).toBe('2')
  // two notes tell the sheet to give up some card height (lessonDeck.css [data-notes='2'])
  expect(sheet.querySelector('.deck-goals').dataset.notes).toBe('2')
  const notes = sheet.querySelector('.deck-goal-notes')
  expect(notes.getAttribute('aria-label')).toBe('Model assumptions')
  expect([...notes.querySelectorAll('.deck-goal-note-text')].map((note) => note.textContent)).toEqual(['Small angles only.', 'No air drag.'])
  expect(notes.querySelectorAll('.prov-assumption')).toHaveLength(2)
  // no sheet of their own follows, and the contents list no row for them
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(kind(container)).toBe('step')
  fireEvent.click(screen.getByRole('button', { name: 'Contents' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByRole('button', { name: /Learning goals/ })).toBeTruthy()
  expect(within(dialog).queryByRole('button', { name: /Model assumptions/ })).toBeNull()
})

it('keeps three or more assumptions on a ruled sheet of their own', () => {
  const assumptions = ['Small angles only.', 'No air drag.', 'A light string.'].map((text, i) => ({ id: `a${i}`, text }))
  const { container } = mount({ objectives: ['Name the parts.'], assumptions })
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(kind(container)).toBe('goals')
  expect(container.querySelector('.deck-goal-notes')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(kind(container)).toBe('assumptions')
  expect(within(container.querySelector('.deck-heading')).getByRole('heading', { level: 2 }).textContent).toBe('Model assumptions')
  expect(container.querySelectorAll('.deck-page:not([hidden]) .deck-assumption')).toHaveLength(3)
})

it('keeps a lone assumption on its own sheet when the goals need two sheets', () => {
  const objectives = ['Name the parts.', 'Use the formula.', 'Explain the period.', 'Measure a swing.', 'Compare two lengths.']
  const { container } = mount({ objectives, assumptions: [{ id: 'a1', text: 'Small angles only.' }] })
  fireEvent.keyDown(container.querySelector('.deck-paper'), { key: 'End' })
  fireEvent.click(screen.getByRole('button', { name: 'Contents' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByRole('button', { name: /Model assumptions/ })).toBeTruthy()
  expect(container.querySelector('.deck-goal-notes')).toBeNull()
})

it('labels every slide of a part made with AI in the byline, and no other', async () => {
  const { container } = mount({ blocks: [{ ...blocks[0], ai_generated: true }, ...blocks.slice(1)] })
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(await screen.findByText('Observe the real result.')).toBeTruthy()
  const byline = container.querySelector('.deck-heading .deck-byline')
  expect(byline.textContent).toContain('Step 1 of 1')
  expect(byline.querySelector('.deck-byline-ai').textContent).toContain('AI-made')
  await choose('Start here')
  await waitFor(() => expect(kind(container)).toBe('flow-group'))
  expect(container.querySelector('.deck-byline-ai')).toBeNull()
})

it('never repeats the heading in the bar', async () => {
  const note = { id: 'note', type: 'text', title: 'A teacher note', body: 'A short note.' }
  const { container } = mount({ blocks: [note, ...blocks] })
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(kind(container)).toBe('text')
  expect(container.querySelector('.deck-heading h2').textContent).toBe('A teacher note')
  expect(container.querySelector('.deck-crumb-part')).toBeNull()
  expect(container.querySelector('.deck-crumb-lesson').textContent).toBe('Test lesson')
  // a step slide still names its part in the bar
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(await screen.findByText('Observe the real result.')).toBeTruthy()
  expect(container.querySelector('.deck-crumb-part').textContent).toBe('A guided step')
})

it('gives the flow overview the deck hint, not a description written for the reading view', async () => {
  const nodes = Array.from({ length: 5 }, (_, i) => ({ id: `n${i}`, label: `Stage ${i + 1}`, description: `About stage ${i + 1}.` }))
  const edges = nodes.slice(1).map((node, i) => ({ id: `e${i}`, source: nodes[i].id, target: node.id, label: '', description: '' }))
  const flow = { id: 'cycle', type: 'flow', title: 'The cycle', description: 'Press “Run the flow” to watch it move.', layout: 'linear', nodes, edges }
  const { container } = mount({ blocks: [flow] })
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(kind(container)).toBe('flow-overview')
  expect(container.querySelector('.deck-heading .deck-byline').textContent).toBe('Press a box or an arrow to see its explanation.')
  await waitFor(() => expect(container.querySelector('.flow-slide-overview')).not.toBeNull())
  expect(container.querySelector('.deck-paper').textContent).not.toContain('Run the flow')
  expect(container.querySelectorAll('.deck-paper .flow-hint')).toHaveLength(0)
  expect(container.querySelector('.deck-crumb-part')).toBeNull()
})

it('gives the flow overview the part description as its byline when it is content', async () => {
  const nodes = Array.from({ length: 5 }, (_, i) => ({ id: `n${i}`, label: `Stage ${i + 1}`, description: `About stage ${i + 1}.` }))
  const edges = nodes.slice(1).map((node, i) => ({ id: `e${i}`, source: nodes[i].id, target: node.id, label: '', description: '' }))
  const intro = 'Nước đi mãi một vòng: từ biển lên mây, rơi xuống đất rồi lại về biển.'
  const flow = { id: 'cycle', type: 'flow', title: 'Vòng tuần hoàn của nước', description: intro, layout: 'linear', nodes, edges }
  const { container } = mount({ blocks: [flow], lab: { ...lab, language: 'vi' } })
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(kind(container)).toBe('flow-overview')
  const byline = container.querySelector('.deck-heading .deck-byline')
  expect(byline.textContent).toBe(intro)
  // lesson words in an English interface keep their own language
  expect(byline.querySelector('.deck-byline-text').getAttribute('lang')).toBe('vi')
  expect(byline.textContent).not.toContain('Press a box')
})

it('opens the first step sheet with the part description when it is content, and only that sheet', async () => {
  const steps = [...blocks[0].steps, { id: 'step2', title: 'Measure it', body: 'Time ten swings.' }]
  const intro = 'Blood travels two connected circuits, one to the lungs and one around the body.'
  const { container, unmount } = mount({ blocks: [{ ...blocks[0], description: intro, steps }] })
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(await screen.findByText('Observe the real result.')).toBeTruthy()
  const byline = () => container.querySelector('.deck-heading .deck-byline')
  expect(byline().textContent).toContain('Step 1 of 2')
  expect(byline().querySelector('.deck-byline-text').textContent).toBe(intro)
  // the next step keeps the beads alone
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(await screen.findByText('Time ten swings.')).toBeTruthy()
  expect(byline().textContent).toContain('Step 2 of 2')
  expect(byline().textContent).not.toContain(intro)
  unmount()
  // a description that tells the learner what to press is not a lead
  const { container: other } = mount({ blocks: [{ ...blocks[0], description: 'Press Next to go through the steps.' }] })
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(await screen.findByText('Observe the real result.')).toBeTruthy()
  expect(other.querySelector('.deck-heading .deck-byline-text')).toBeNull()
})

it('counts the pages seen on the end slide and offers the finish actions', async () => {
  const onAsk = vi.fn()
  const onFeedback = vi.fn()
  const onReading = vi.fn()
  const { container } = mount({ objectives: ['Name the parts.'], finish: { onAsk, onFeedback }, onReading })
  await choose('Lesson wrap-up')
  expect(kind(container)).toBe('end')
  const end = container.querySelector('.deck-end')
  // the cover and the end, of cover + goals + step + flow group + graph + end
  expect(end.querySelector('.deck-end-count').textContent).toBe('2/6')
  expect(within(end).getByRole('heading', { level: 2 }).textContent).toBe('You finished the lesson')
  expect(within(end).getByText('Name the parts.')).toBeTruthy()
  fireEvent.click(within(end).getByRole('button', { name: 'Ask AI' }))
  fireEvent.click(within(end).getByRole('button', { name: 'Send feedback' }))
  fireEvent.click(within(end).getByRole('button', { name: 'Reading view' }))
  expect([onAsk, onFeedback, onReading].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1])
  expect(within(end).getByRole('button', { name: 'Ask AI' }).className).toContain('btn-primary')
  fireEvent.click(within(end).getByRole('button', { name: 'Back to the start' }))
  expect(kind(container)).toBe('intro')
  await choose('Lesson wrap-up')
  expect(container.querySelector('.deck-end-count').textContent).toBe('2/6')
})

it('makes Back to the start the primary action when the tutor is off', async () => {
  const { container } = mount()
  await choose('Lesson wrap-up')
  const end = container.querySelector('.deck-end')
  expect(within(end).queryByRole('button', { name: 'Ask AI' })).toBeNull()
  expect(within(end).queryByRole('button', { name: 'Send feedback' })).toBeNull()
  expect(within(end).getByRole('button', { name: 'Back to the start' }).className).toContain('btn-primary')
})

it('moves to the first and the last page with Home and End', () => {
  const { container } = mount()
  const paper = container.querySelector('.deck-paper')
  expect(document.activeElement).toBe(paper)
  fireEvent.keyDown(paper, { key: 'End' })
  expect(kind(container)).toBe('end')
  expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(true)
  fireEvent.keyDown(container.querySelector('.deck-paper'), { key: 'Home' })
  expect(kind(container)).toBe('intro')
  expect(screen.getByRole('button', { name: 'Previous' }).disabled).toBe(true)
})

it('groups a part with several slides under its title in the contents and marks the current row', async () => {
  const twoSteps = [{ ...blocks[0], steps: [...blocks[0].steps, { id: 'step2', title: 'Measure it', body: 'Time ten swings.' }] }, ...blocks.slice(1)]
  mount({ blocks: twoSteps })
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  fireEvent.click(screen.getByRole('button', { name: 'Contents' }))
  const dialog = screen.getByRole('dialog')
  const part = dialog.querySelector('.deck-contents-part')
  expect(part.querySelector('h3').textContent).toBe('A guided step')
  expect([...part.querySelectorAll('button')].map((b) => b.querySelector('.deck-contents-title').textContent)).toEqual(['Step 1: Explore motion', 'Step 2: Measure it'])
  expect(within(dialog).getByRole('button', { name: /Step 1: Explore motion/ }).getAttribute('aria-current')).toBe('page')
  expect(within(dialog).getByRole('button', { name: /Introduction/ }).textContent).toContain('viewed')
})

it('does not change slides when arrows are used in a graph control', async () => {
  const { container } = mount()
  await choose('Plot activity')
  const slider = await screen.findByRole('slider', { name: 'Graph control' })
  const before = container.querySelector('.deck-paper').dataset.slideId || container.querySelector('.deck-paper').dataset.blockId
  fireEvent.keyDown(slider, { key: 'ArrowRight' })
  expect(container.querySelector('.deck-paper').dataset.blockId).toBe(before)
  expect(screen.getByRole('slider', { name: 'Graph control' })).toBeTruthy()
})
