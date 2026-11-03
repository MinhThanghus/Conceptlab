import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { I18nProvider } from '../../i18n/index.jsx'
import LabCover, { DEMO_COVER_CODES, coverSources } from './LabCover.jsx'
import { SUBJECT_PATTERNS, bookletPattern, coverLetter, titleScale } from './BookletCover.jsx'
import { ALL_SUBJECTS } from './labOptions.js'
import { hashString, mulberry32 } from '../../lib/random.js'

beforeEach(() => window.localStorage.setItem('cl.lang', 'vi'))
afterEach(() => { cleanup(); window.localStorage.clear() })

const show = (ui) => render(<I18nProvider>{ui}</I18nProvider>)
const lab = (fields = {}) => ({ id: 'lab1', title: 'Định luật Ôm', subject: 'physics', grade: '10', language: 'vi', share_code: 'OHM123', ...fields })

describe('coverSources', () => {
  it('tries the cover picture, then the paper preview, then the learner-view capture', () => {
    expect(coverSources(lab({ cover_url: '/api/assets/a/file' }))).toEqual(['/api/assets/a/file'])
    expect(coverSources(lab({ is_demo: true, share_code: 'tpend6' }))).toEqual(['/covers/TPEND6.webp'])
    expect(coverSources(lab({ is_demo: true, share_code: 'CHNWRE', cover_url: '/c.jpg' }))).toEqual(['/c.jpg', '/paper-previews/CHNWRE.png'])
    expect(coverSources(lab({ is_demo: false, share_code: 'TPEND6' }))).toEqual([])
    expect(DEMO_COVER_CODES).toContain('WATER6')
  })

  it('skips the whole-screen capture on a thumbnail', () => {
    expect(coverSources(lab({ is_demo: true, share_code: 'TPEND6', cover_url: '/c.jpg' }), true)).toEqual(['/c.jpg'])
    expect(coverSources(null)).toEqual([])
  })
})

describe('LabCover', () => {
  it('frames a cover picture above its centre and a capture from its top, with 16:9 size hints', () => {
    const { container } = show(<LabCover lab={lab({ is_demo: true, share_code: 'TPEND6', cover_url: '/api/assets/a/file' })} eager />)
    const img = container.querySelector('.lab-cover img')
    expect(img.getAttribute('src')).toBe('/api/assets/a/file')
    expect(img.className).toBe('cv-photo')
    expect([img.getAttribute('width'), img.getAttribute('height')]).toEqual(['960', '540'])
    expect(img.getAttribute('alt')).toBe('')
    expect(img.getAttribute('loading')).toBe('eager')

    fireEvent.error(img)
    const next = container.querySelector('.lab-cover img')
    expect(next.getAttribute('src')).toBe('/covers/TPEND6.webp')
    expect(next.className).toBe('cv-capture')
  })

  it('falls back to the booklet cover once every picture failed', () => {
    const { container } = show(<LabCover lab={lab({ cover_url: '/broken.jpg' })} />)
    fireEvent.error(container.querySelector('img'))
    expect(container.querySelector('img')).toBeNull()
    const root = container.querySelector('.lab-cover')
    expect(root.getAttribute('aria-hidden')).toBe('true')
    expect(root.querySelector('.cv-booklet')).not.toBeNull()
  })

  it('sets a lab without a picture as a booklet: subject field, pattern, series line and title', () => {
    const { container } = show(<LabCover lab={lab({ language: 'en', title: 'Ohm’s law' })} />)
    const root = container.querySelector('.lab-cover')
    expect(root.classList.contains('cv')).toBe(true)
    expect(root.getAttribute('aria-hidden')).toBe('true')
    const booklet = root.querySelector('.cv-booklet')
    expect(booklet.dataset.subject).toBe('physics')
    expect(booklet.dataset.pattern).toBe('rings')
    expect(booklet.querySelectorAll('svg circle').length).toBeGreaterThan(3)
    expect(booklet.querySelector('.cv-booklet-series').textContent).toBe('Vật lýLớp 10')
    const title = booklet.querySelector('.cv-booklet-title')
    expect(title.textContent).toBe('Ohm’s law')
    expect(title.getAttribute('lang')).toBe('en')
    expect(booklet.style.getPropertyValue('--cv-scale')).toBe('1')
    expect(booklet.querySelector('.cv-booklet-letter')).toBeNull()
  })

  it('shows the title’s first letter on a thumbnail, never the whole title', () => {
    const { container } = show(<LabCover lab={lab({ title: '  “định luật” Ôm' })} compact />)
    const root = container.querySelector('.lab-cover')
    expect(root.classList.contains('cv-compact')).toBe(true)
    expect(root.querySelector('.cv-booklet').classList.contains('is-compact')).toBe(true)
    expect(root.querySelector('.cv-booklet-letter').textContent).toBe('Đ')
    expect(root.querySelector('.cv-booklet-title')).toBeNull()
  })

  it('gives a thumbnail picture square size hints', () => {
    const { container } = show(<LabCover lab={lab({ cover_url: '/c.jpg' })} compact />)
    const img = container.querySelector('img')
    expect([img.getAttribute('width'), img.getAttribute('height')]).toEqual(['120', '120'])
  })

  it('treats an unknown subject as other and omits a missing grade', () => {
    const { container } = show(<LabCover lab={lab({ subject: 'astrology', grade: undefined })} />)
    const booklet = container.querySelector('.cv-booklet')
    expect(booklet.dataset.subject).toBe('other')
    expect(booklet.querySelector('.cv-booklet-grade')).toBeNull()
  })

  it('draws the same pattern for the same lab and a different one for another lab', () => {
    const markup = (code) => {
      const { container, unmount } = show(<LabCover lab={lab({ share_code: code, subject: 'math' })} />)
      const svg = container.querySelector('.cv-booklet svg').innerHTML
      unmount()
      return svg
    }
    expect(markup('AAA111')).toBe(markup('AAA111'))
    expect(markup('AAA111')).not.toBe(markup('BBB222'))
  })
})

describe('booklet patterns', () => {
  // the shapes' left edges, for the shapes whose geometry is explicit
  const leftEdge = (s) => {
    if (s.kind === 'rect' || s.kind === 'frame') return s.x
    if (s.kind === 'dot' || s.kind === 'circle') return s.cx - s.r
    if (s.kind === 'line') return Math.min(s.x1, s.x2) - s.width / 2
    return null
  }

  it('gives every subject a pattern', () => {
    expect(Object.keys(SUBJECT_PATTERNS).sort()).toEqual([...ALL_SUBJECTS].sort())
    for (const subject of ALL_SUBJECTS) expect(bookletPattern(subject, 'X').shapes.length).toBeGreaterThan(1)
  })

  it('never cuts a shape in the middle of the cover and stays within the ink range', () => {
    for (const subject of ALL_SUBJECTS) {
      for (let seed = 0; seed < 40; seed += 1) {
        const { kind, shapes } = bookletPattern(subject, `S${seed}`)
        for (const shape of shapes) {
          expect(shape.opacity).toBeGreaterThanOrEqual(0.14)
          expect(shape.opacity).toBeLessThanOrEqual(0.24)
          const left = leftEdge(shape)
          // rings are centred beyond the right edge; their left reach is checked through their radius
          if (left !== null && kind !== 'rings') expect(left, `${kind} ${seed}`).toBeGreaterThanOrEqual(18)
          if (kind === 'rings' && shape.kind === 'circle') expect(shape.cx - shape.r - shape.stroke / 2).toBeGreaterThanOrEqual(18)
        }
      }
    }
  })

  it('keeps each pattern calm: a handful of main elements', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const count = (subject, kinds) => bookletPattern(subject, `C${seed}`).shapes.filter((s) => kinds.includes(s.kind)).length
      expect(count('math', ['dot', 'circle', 'rect', 'path'])).toBeGreaterThanOrEqual(6)
      expect(count('math', ['dot', 'circle', 'rect', 'path'])).toBeLessThanOrEqual(10)
      expect(count('physics', ['circle'])).toBeGreaterThanOrEqual(4)
      expect(count('physics', ['circle', 'dot'])).toBeLessThanOrEqual(8)
      expect(count('chemistry', ['dot'])).toBeGreaterThanOrEqual(9)
      expect(count('chemistry', ['dot'])).toBeLessThanOrEqual(12)
      expect(count('biology', ['circle']) + bookletPattern('biology', `C${seed}`).shapes.filter((s) => s.kind === 'dot' && s.opacity === 0.14).length).toBeLessThanOrEqual(14)
      expect(count('geography', ['path'])).toBeGreaterThanOrEqual(5)
      expect(count('geography', ['path'])).toBeLessThanOrEqual(7)
      expect(count('pe', ['line'])).toBe(5)
    }
  })
})

describe('booklet type', () => {
  it('scales a title down with its length so the block keeps its size', () => {
    expect(titleScale('Phương trình bậc 2')).toBe(1)
    expect(titleScale('Con lắc nhiều thanh và hỗn loạn')).toBeCloseTo(0.76, 2)
    expect(titleScale('x'.repeat(400))).toBe(0.42)
    expect(titleScale('')).toBe(1)
  })

  it('takes the first letter or digit, in capitals, in the lab’s language', () => {
    expect(coverLetter('  “ánh xạ” logistic', 'vi')).toBe('Á')
    expect(coverLetter('2D memristors', 'en')).toBe('2')
    expect(coverLetter('ịt', 'vi')).toBe('Ị')
    expect(coverLetter('', 'vi')).toBe('')
  })
})

describe('lib/random', () => {
  it('is deterministic and spread over [0, 1)', () => {
    const a = mulberry32(hashString('TPEND6'))
    const b = mulberry32(hashString('TPEND6'))
    const values = Array.from({ length: 200 }, () => a())
    expect(values).toEqual(Array.from({ length: 200 }, () => b()))
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...values)).toBeLessThan(1)
    expect(hashString('TPEND6')).not.toBe(hashString('TPEND7'))
  })
})
