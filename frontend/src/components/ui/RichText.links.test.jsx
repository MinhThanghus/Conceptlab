import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RichText } from './RichText.jsx'

describe('research links in lesson text', () => {
  it('opens the original source while preserving citations', () => {
    render(<RichText text="Nguồn [1]: https://doi.org/10.1000/example." citations={[{ n: 1, title: 'Paper' }]} onCite={() => {}} />)
    expect(screen.getByRole('link').getAttribute('href')).toBe('https://doi.org/10.1000/example')
    expect(screen.getByRole('button', { name: '[1] Paper' })).toBeTruthy()
  })
})
