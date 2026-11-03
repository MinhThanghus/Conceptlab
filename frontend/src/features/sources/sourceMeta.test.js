import { describe, expect, it } from 'vitest'
import { defaultTitle, fileKind, isCitation, overSoftLimit, pageImageUrl, previewUrl, sourceInUse, stripExtension } from './sourceMeta.js'

const file = (name, type = '') => ({ name, type })

describe('fileKind', () => {
  it('uses the MIME type first', () => {
    expect(fileKind(file('x', 'application/pdf'))).toBe('pdf')
    expect(fileKind(file('x', 'image/jpeg'))).toBe('image')
    expect(fileKind(file('x', 'image/heic'))).toBe('image')
    expect(fileKind(file('x', 'video/quicktime'))).toBe('video')
  })
  it('falls back to the extension (some phones send no MIME type)', () => {
    expect(fileKind(file('IMG_1.HEIC'))).toBe('image')
    expect(fileKind(file('bai-tap.MOV'))).toBe('video')
    expect(fileKind(file('paper.pdf'))).toBe('pdf')
  })
  it('rejects other files', () => {
    expect(fileKind(file('notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))).toBe('unknown')
    expect(fileKind(file('anim.gif', 'image/gif'))).toBe('unknown')
  })
})

describe('titles', () => {
  it('strips extensions and underscores', () => {
    expect(stripExtension('trang.64.pdf')).toBe('trang.64')
    expect(defaultTitle(file('trang_64__con_lac.jpg'))).toBe('trang 64 con lac')
    expect(defaultTitle(file(''), 'Nguồn')).toBe('Nguồn')
  })
})

describe('limits', () => {
  it('warns above the default server limits', () => {
    expect(overSoftLimit('video', 151 * 1024 * 1024)).toBe(true)
    expect(overSoftLimit('video', 20 * 1024 * 1024)).toBe(false)
    expect(overSoftLimit('note', 10 ** 9)).toBe(false)
  })
})

describe('urls', () => {
  const pdf = { kind: 'pdf', status: 'ready', urls: { page: '/api/sources/abc/pages/{n}.png', file: '/api/sources/abc/file' } }
  it('builds page image urls with an optional scale', () => {
    expect(pageImageUrl(pdf, 3)).toBe('/api/sources/abc/pages/3.png')
    expect(pageImageUrl(pdf, 1, 0.5)).toBe('/api/sources/abc/pages/1.png?scale=0.5')
    expect(pageImageUrl(pdf, 1, 9)).toBe('/api/sources/abc/pages/1.png?scale=3')
    expect(pageImageUrl({ urls: {} }, 1)).toBeNull()
  })
  it('chooses a preview per kind', () => {
    expect(previewUrl(pdf)).toBe('/api/sources/abc/pages/1.png?scale=0.5')
    expect(previewUrl({ kind: 'image', status: 'ready', urls: { file: '/f' } })).toBe('/f')
    expect(previewUrl({ kind: 'video', status: 'ready', urls: { poster: '/p' } })).toBe('/p')
    expect(previewUrl({ kind: 'video', status: 'processing', urls: {} })).toBeNull()
    expect(previewUrl({ kind: 'data', status: 'ready', urls: {} })).toBeNull()
  })
})

describe('isCitation', () => {
  it('distinguishes citations from simply opening a source', () => {
    expect(isCitation({ source_id: 's', page: 1, located: 'none' })).toBe(false)
    expect(isCitation({ source_id: 's', page: 3, quote: 'T = 2π√(l/g)', located: 'none' })).toBe(true)
    expect(isCitation({ source_id: 's', bbox: [0, 0, 1, 1], located: 'approximate' })).toBe(true)
    expect(isCitation({ source_id: 's', time: 0 })).toBe(true)
    expect(isCitation(null)).toBe(false)
  })
})

describe('sourceInUse', () => {
  it('finds references in the spec or the analysis', () => {
    const lab = { spec: { blocks: [{ source_refs: [{ source_id: 'abc' }] }] }, analysis: {} }
    expect(sourceInUse(lab, 'abc')).toBe(true)
    expect(sourceInUse(lab, 'ab')).toBe(false)
    expect(sourceInUse(null, 'abc')).toBe(false)
  })
})
