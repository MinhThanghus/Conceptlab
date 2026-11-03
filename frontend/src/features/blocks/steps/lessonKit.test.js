import { describe, expect, it } from 'vitest'
import {
  boxFromPoints,
  boxInCrop,
  compactPath,
  cropRegion,
  cut,
  isIdentity,
  manualLocated,
  mediaUrl,
  moveBox,
  moveItem,
  normBox,
  parseClock,
  parseDecimal,
  pictureOptions,
  pictureValue,
  resizeBox,
  safeMaskPath,
  shuffledIndices,
  stripLeadingNumber,
  unionBox,
  uniqueId,
} from './lessonKit.js'

function seeded(seed = 7) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

describe('lists', () => {
  it('moves items immutably and ignores out-of-range moves', () => {
    const list = ['a', 'b', 'c', 'd']
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(list, 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(moveItem(list, 1, 9)).toEqual(list)
    expect(list).toEqual(['a', 'b', 'c', 'd'])
  })

  it('never returns an already-sorted shuffle when there is something to sort', () => {
    for (let n = 2; n <= 6; n += 1) {
      for (let seed = 1; seed < 40; seed += 1) {
        const order = shuffledIndices(n, seeded(seed))
        expect(order).toHaveLength(n)
        expect([...order].sort((a, b) => a - b)).toEqual([...Array(n).keys()])
        expect(isIdentity(order)).toBe(false)
      }
    }
    expect(shuffledIndices(1)).toEqual([0])
    // even a broken random source cannot produce the sorted order
    expect(isIdentity(shuffledIndices(3, () => 0.999999))).toBe(false)
  })

  it('creates ids that are not taken', () => {
    const taken = new Set(['q_1'])
    const id = uniqueId('q', taken)
    expect(id.startsWith('q_')).toBe(true)
    expect(taken.has(id)).toBe(false)
  })

  it('strips leading numbering from step titles', () => {
    expect(stripLeadingNumber('1. Tư thế chuẩn bị')).toBe('Tư thế chuẩn bị')
    expect(stripLeadingNumber('Bước 2: Tạo mặt đệm')).toBe('Tạo mặt đệm')
    expect(stripLeadingNumber('Step 3 - Contact the ball')).toBe('Contact the ball')
    expect(stripLeadingNumber('4) Kết thúc')).toBe('Kết thúc')
    expect(stripLeadingNumber('10 bước khởi động')).toBe('10 bước khởi động')
    expect(stripLeadingNumber('2.5 m/s là tốc độ')).toBe('2.5 m/s là tốc độ')
    expect(stripLeadingNumber('Bay hơi')).toBe('Bay hơi')
  })
})

describe('boxes', () => {
  it('normalizes, sorts and clamps boxes', () => {
    expect(normBox([0.5, 0.6, 0.1, -0.2])).toEqual([0.1, 0, 0.5, 0.6])
    expect(normBox([0, 0, 2, 1])).toEqual([0, 0, 1, 1])
    expect(normBox([0, 0, 1])).toBeNull()
    expect(normBox(['a', 0, 1, 1])).toBeNull()
    expect(boxFromPoints([0.8, 0.2], [0.3, 0.9])).toEqual([0.3, 0.2, 0.8, 0.9])
  })

  it('moves and resizes inside the image', () => {
    expect(moveBox([0.8, 0.8, 0.95, 0.95], 0.2, 0.2)).toEqual([0.85, 0.85, 1, 1])
    expect(moveBox([0.1, 0.1, 0.2, 0.2], -0.5, 0)).toEqual([0, 0.1, 0.1, 0.2])
    expect(resizeBox([0.1, 0.1, 0.2, 0.2], -0.5, 0.05)).toEqual([0.1, 0.1, 0.12, 0.25])
    expect(resizeBox([0.5, 0.5, 0.9, 0.9], 0.5, 0.5)).toEqual([0.5, 0.5, 1, 1])
  })

  it('unions the rects of a located quote', () => {
    expect(unionBox([[0.1, 0.2, 0.5, 0.25], [0.1, 0.25, 0.4, 0.3]])).toEqual([0.1, 0.2, 0.5, 0.3])
    expect(unionBox([])).toBeNull()
  })

  it('zooms around a highlight with context and stays inside the picture', () => {
    const crop = cropRegion([0.5, 0.65, 0.68, 0.87])
    expect(crop[0]).toBeLessThanOrEqual(0.5)
    expect(crop[2]).toBeGreaterThanOrEqual(0.68)
    expect(crop[1]).toBeLessThanOrEqual(0.65)
    expect(crop[3]).toBeGreaterThanOrEqual(0.87)
    crop.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    })
    // a tiny box still shows at least 30% of the picture
    const tiny = cropRegion([0.95, 0.95, 0.96, 0.96])
    expect(tiny[2] - tiny[0]).toBeCloseTo(0.3, 4)
    expect(tiny[2]).toBe(1)
    // a huge box shows the whole picture
    expect(cropRegion([0, 0, 0.9, 0.95])).toEqual([0, 0, 1, 1])
    expect(cropRegion(null)).toEqual([0, 0, 1, 1])
  })

  it('places the box inside the crop in percentages', () => {
    const pos = boxInCrop([0.25, 0.25, 0.5, 0.75], [0, 0, 0.5, 1])
    expect(pos).toEqual({ left: 50, top: 25, width: 50, height: 50 })
  })
})

describe('media', () => {
  const pdf = { id: 'p1', kind: 'pdf', status: 'ready', page_count: 3, urls: { page: '/api/sources/p1/pages/{n}.png' } }
  const img = { id: 'i1', kind: 'image', status: 'ready', width: 1100, height: 1500, urls: { file: '/api/sources/i1/file' } }
  it('resolves source images, PDF pages and assets', () => {
    expect(mediaUrl({ source: img })).toBe('/api/sources/i1/file')
    expect(mediaUrl({ source: pdf, page: 2 })).toBe('/api/sources/p1/pages/2.png')
    expect(mediaUrl({ source: pdf, page: 99 })).toBe('/api/sources/p1/pages/3.png')
    expect(mediaUrl({ source: pdf })).toBe('/api/sources/p1/pages/1.png')
    expect(mediaUrl({ asset: { url: '/api/assets/a/file' } })).toBe('/api/assets/a/file')
    expect(mediaUrl({ source: { kind: 'video', urls: { file: 'x' } } })).toBeNull()
    expect(mediaUrl({ source: { ...img, status: 'failed' } })).toBeNull()
    expect(mediaUrl({})).toBeNull()
  })

  it('lists pictures a teacher can use', () => {
    const options = pictureOptions(
      [img, pdf, { id: 'v', kind: 'video', status: 'ready' }, { id: 'n', kind: 'note', status: 'ready' }],
      [{ id: 'a1', kind: 'cutout' }, { id: 'a2', kind: 'cover' }],
    )
    expect(options.map((o) => o.value)).toEqual(['src:i1', 'src:p1', 'asset:a1'])
    expect(pictureValue({ source_id: 'p1', page: 2 })).toBe('src:p1')
    expect(pictureValue({ asset_id: 'a1' })).toBe('asset:a1')
    expect(pictureValue(null)).toBe('')
  })

  it('compacts mask paths and refuses ones that are too long', () => {
    expect(compactPath('M10.4 20.6 L30.5 40.49 Z')).toBe('M10 21 L31 40 Z')
    expect(safeMaskPath('')).toBeNull()
    expect(safeMaskPath(`M0 0${' L1 1'.repeat(20000)}`)).toBeNull()
    expect(safeMaskPath('M1.2 3.4 L5.6 7.8 Z')).toBe('M1 3 L6 8 Z')
  })

  it('marks teacher-picked references honestly', () => {
    expect(manualLocated({ source_id: 'p1', page: 2 }, pdf)).toBe('exact')
    expect(manualLocated({ source_id: 'p1' }, pdf)).toBe('none')
    expect(manualLocated({ source_id: 'i1' }, img)).toBe('exact')
    expect(manualLocated({ source_id: 'v1' }, { kind: 'video' })).toBe('none')
    expect(manualLocated({ source_id: 'v1', time: 12 }, { kind: 'video' })).toBe('exact')
    expect(manualLocated({ source_id: 'gone' }, null)).toBe('none')
  })
})

describe('parsing', () => {
  it('reads Vietnamese and English decimals', () => {
    expect(parseDecimal('2,01')).toBe(2.01)
    expect(parseDecimal('2.01')).toBe(2.01)
    expect(parseDecimal(' -3 ')).toBe(-3)
    expect(parseDecimal('−0,5')).toBe(-0.5)
    expect(parseDecimal('1 000,5')).toBe(1000.5)
    expect(parseDecimal('1.000,5')).toBe(1000.5)
    expect(parseDecimal('1,000.5')).toBe(1000.5)
    expect(parseDecimal('1,000,000')).toBe(1000000)
    expect(parseDecimal('4e2')).toBe(400)
    expect(parseDecimal('.5')).toBe(0.5)
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('abc')).toBeNull()
    expect(parseDecimal('2,0,1.')).toBeNull()
  })

  it('reads clock times', () => {
    expect(parseClock('1:23')).toBe(83)
    expect(parseClock('83')).toBe(83)
    expect(parseClock('2,5')).toBe(2.5)
    expect(parseClock('1:02:03')).toBe(3723)
    expect(parseClock('1:2:3:4')).toBeNull()
    expect(parseClock('')).toBeNull()
  })

  it('cuts text to schema limits', () => {
    expect(cut('abcdef', 3)).toBe('abc')
    expect(cut(null, 3)).toBe('')
  })
})
