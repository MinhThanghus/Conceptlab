import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { Segmented, radioKeyTarget } from './Field.jsx'

afterEach(cleanup)

describe('radioKeyTarget', () => {
  it('wraps with arrow keys and jumps with Home/End', () => {
    expect(radioKeyTarget('ArrowRight', 0, 3)).toBe(1)
    expect(radioKeyTarget('ArrowDown', 2, 3)).toBe(0)
    expect(radioKeyTarget('ArrowLeft', 0, 3)).toBe(2)
    expect(radioKeyTarget('ArrowUp', 1, 3)).toBe(0)
    expect(radioKeyTarget('Home', 2, 3)).toBe(0)
    expect(radioKeyTarget('End', 0, 3)).toBe(2)
    expect(radioKeyTarget('Enter', 0, 3)).toBe(-1)
    expect(radioKeyTarget('ArrowRight', 0, 0)).toBe(-1)
  })
})

function Picker() {
  const [value, setValue] = useState('b')
  return (
    <Segmented
      label="Space"
      value={value}
      onChange={setValue}
      options={[
        { value: 'a', label: 'All' },
        { value: 'b', label: 'School' },
        { value: 'c', label: 'Paper' },
      ]}
    />
  )
}

describe('Segmented', () => {
  it('moves focus together with the selection (roving tabindex)', () => {
    render(<Picker />)
    const school = screen.getByRole('radio', { name: 'School' })
    expect(school.getAttribute('aria-checked')).toBe('true')
    expect(school.tabIndex).toBe(0)
    school.focus()
    fireEvent.keyDown(school, { key: 'ArrowRight' })
    const paper = screen.getByRole('radio', { name: 'Paper' })
    expect(paper.getAttribute('aria-checked')).toBe('true')
    expect(paper.tabIndex).toBe(0)
    expect(document.activeElement).toBe(paper)
    fireEvent.keyDown(paper, { key: 'Home' })
    const all = screen.getByRole('radio', { name: 'All' })
    expect(all.getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(all)
  })
})
