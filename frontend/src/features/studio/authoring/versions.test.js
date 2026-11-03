import { describe, expect, it } from 'vitest'
import { restoreNote, versionNote } from './versions.js'

describe('versionNote', () => {
  it('maps the notes the server writes to i18n keys', () => {
    expect(versionNote('Published')).toEqual({ key: 'published', params: {} })
    expect(versionNote('AI analysis')).toEqual({ key: 'aiAnalysis', params: {} })
    expect(versionNote('AI blocks')).toEqual({ key: 'aiBlocks', params: {} })
    expect(versionNote('AI paper structure')).toEqual({ key: 'aiPaper', params: {} })
    expect(versionNote('Restored from v12')).toEqual({ key: 'restored', params: { n: 12 } })
  })
  it('understands its own restore note and empty (automatic) snapshots', () => {
    expect(versionNote(restoreNote(3))).toEqual({ key: 'beforeRestore', params: { n: 3 } })
    expect(versionNote(null)).toEqual({ key: 'auto', params: {} })
    expect(versionNote('  ')).toEqual({ key: 'auto', params: {} })
  })
  it('shows unknown notes as written', () => {
    expect(versionNote('Trước giờ dạy 10A')).toEqual({ key: null, text: 'Trước giờ dạy 10A' })
  })
})
