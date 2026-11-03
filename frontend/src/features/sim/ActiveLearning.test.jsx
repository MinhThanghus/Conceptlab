import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../i18n/index.jsx'
import { BlockEnvProvider } from '../blocks/BlockEnv.jsx'
import { ActiveLearningPanel } from './ActiveLearning.jsx'

const config = {
  question: 'If L goes from 1 m to 0.5 m, what happens to the period?',
  param: 'L',
  from_value: 1,
  to_value: 0.5,
  observe: 'period',
  options: ['It goes up', 'It goes down', 'It stays the same'],
  correct_option: 1,
  explanation: '',
}

function renderPanel(cfg = config, observed = { before: 2.01, after: 1.42 }) {
  return render(
    <I18nProvider>
      <BlockEnvProvider value={{ labId: 'lab1' }}>
        <ActiveLearningPanel
          blockId="b1"
          config={cfg}
          paramText="String length (L)"
          formatParam={(v) => `${v} m`}
          observeText="Period T"
          observed={observed}
          formatObserved={(v) => `${v} s`}
          onApply={vi.fn()}
        />
      </BlockEnvProvider>
    </I18nProvider>,
  )
}

const predictAndCompare = (option) => {
  fireEvent.click(screen.getByRole('radio', { name: option }))
  fireEvent.click(screen.getByRole('button', { name: 'Lock in my prediction' }))
  fireEvent.click(screen.getByRole('button', { name: 'Apply the change' }))
  fireEvent.click(screen.getByRole('button', { name: 'Compare with my prediction' }))
}

beforeEach(() => window.localStorage.setItem('cl.lang', 'en'))
afterEach(() => cleanup())

describe('ActiveLearningPanel compare step', () => {
  it('says why a wrong prediction differs, with what the model shows', () => {
    renderPanel()
    predictAndCompare('It goes up')
    expect(screen.getByText('Not quite, and that’s fine.')).toBeTruthy()
    expect(screen.getByText('The right answer: It goes down')).toBeTruthy()
    const why = document.querySelector('.ix-verdict-why')
    expect(why.textContent).toBe('The model shows: Period T went down from 2.01 s to 1.42 s.')
  })

  it('uses the teacher’s line for the chosen option when there is one', () => {
    renderPanel({ ...config, option_feedback: ['A shorter string swings faster, so the period drops.', '', ''] })
    predictAndCompare('It goes up')
    expect(document.querySelector('.ix-verdict-why').textContent).toBe('A shorter string swings faster, so the period drops.')
  })

  it('adds nothing when there is no data to explain the difference, or the prediction was right', () => {
    renderPanel(config, { before: null, after: null })
    predictAndCompare('It stays the same')
    expect(document.querySelector('.ix-verdict-why')).toBeNull()
    cleanup()
    renderPanel()
    predictAndCompare('It goes down')
    expect(screen.getByText('Correct!')).toBeTruthy()
    expect(document.querySelector('.ix-verdict-why')).toBeNull()
  })
})
