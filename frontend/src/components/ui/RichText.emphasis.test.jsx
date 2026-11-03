import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { RichText } from './RichText.jsx'

afterEach(cleanup)

describe('emphasis that holds other inline text', () => {
  it('typesets inline math inside a bold run', async () => {
    const { container } = render(<RichText text="Chu kỳ chỉ phụ thuộc **chiều dài dây $L$** và gia tốc $g$." />)
    const strong = container.querySelector('strong')
    expect(strong.textContent).toContain('chiều dài dây')
    await waitFor(() => expect(strong.querySelector('.formula .katex')).not.toBeNull())
    expect(container.textContent).not.toContain('$L$')
    expect(container.textContent).not.toContain('$')
    // the formula after the bold run still renders on its own
    expect(container.querySelectorAll('.formula .katex')).toHaveLength(2)
  })

  it('typesets inline math inside an italic run and keeps the words around it', async () => {
    const { container } = render(<RichText text="Ta có *góc lệch $\theta$ nhỏ* nên dao động điều hòa." />)
    const em = container.querySelector('em')
    expect(em.textContent).toContain('góc lệch')
    expect(em.textContent).toContain('nhỏ')
    await waitFor(() => expect(em.querySelector('.formula .katex')).not.toBeNull())
    expect(container.textContent).not.toContain('$')
  })

  it('keeps code, citations and links working inside bold text', () => {
    const { container } = render(
      <RichText text="**Đọc `T = 2π√(L/g)` ở [1], xem https://example.org/a.**" citations={[{ n: 1, title: 'Sách' }]} onCite={() => {}} />,
    )
    const strong = container.querySelector('strong')
    expect(strong.querySelector('code').textContent).toBe('T = 2π√(L/g)')
    expect(screen.getByRole('button', { name: '[1] Sách' }).closest('strong')).toBe(strong)
    expect(screen.getByRole('link').getAttribute('href')).toBe('https://example.org/a')
    expect(screen.getByRole('link').closest('strong')).toBe(strong)
  })

  it('leaves plain bold and italic text unchanged', () => {
    const { container } = render(<RichText text="Một **vật nhỏ** treo vào *sợi dây*." />)
    expect(container.querySelector('strong').textContent).toBe('vật nhỏ')
    expect(container.querySelector('em').textContent).toBe('sợi dây')
    expect(container.querySelector('p').textContent).toBe('Một vật nhỏ treo vào sợi dây.')
  })
})
