import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NoteContent } from './NoteContent.jsx'

describe('source note links', () => {
  it('links valid URLs and keeps punctuation outside the destination', () => {
    render(<NoteContent text="Paper: https://doi.org/10.1000/example. Read more." />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('https://doi.org/10.1000/example')
    expect(link.getAttribute('rel')).toContain('noopener')
  })
  it('does not execute HTML or create non-http links', () => {
    const { container } = render(<NoteContent text={'<script>alert(1)</script> javascript:alert(1) https://user:pass@example.com/'} />)
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
  })
})
