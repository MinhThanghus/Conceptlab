import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEMO_COVER_CODES, coverSources } from './LabCover.jsx'
import { VISUAL_CATALOG } from '../visuals/catalog.js'

// The pictures in public/ come from scripts/capture_shots.py (covers) and
// scripts/capture_visual_previews.py (model previews); the lists in the code must name exactly them.
// (a path string: jsdom's URL is not the one node:url reads)
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'public')
const names = (folder, ext) => readdirSync(join(PUBLIC, folder))
  .filter((file) => file.endsWith(ext))
  .map((file) => file.slice(0, -ext.length))
  .sort()

describe('captured cover and preview files', () => {
  it('has one cover capture per demo cover code, and no capture without a code', () => {
    expect(names('covers', '.webp')).toEqual([...DEMO_COVER_CODES].sort())
  })

  it('has a library preview for every 3D model of the catalog, and no other', () => {
    expect(names('visual-previews', '.png')).toEqual(VISUAL_CATALOG.map((item) => item.id).sort())
  })

  it('shows each paper preview as the cover of its paper-study lab', () => {
    const codes = names('paper-previews', '.png')
    expect(codes).toHaveLength(10)
    for (const code of codes) {
      expect(coverSources({ is_demo: true, share_code: code })).toContain(`/paper-previews/${code}.png`)
    }
  })
})
