import { describe, expect, it } from 'vitest'
import vi from '../../i18n/locales/vi/index.js'
import en from '../../i18n/locales/en/index.js'
import { translate } from '../../i18n/index.jsx'
import { BLOCK_TYPES, KNOWN_FEATURES, asUtc, latencyParts, parseFeature, prepTimeParts } from './adminUtils.js'

const lookup = (dict, key) => key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), dict)
const DICTS = { vi, en }

// Every feature id the backend writes to the AI call log (CallContext.feature in backend/app/services).
const LOGGED_FEATURE_IDS = [
  'analyze',
  'paper-structure',
  'explore-equation',
  'generate:steps',
  'generate:flow',
  'generate:graph',
  'generate:simulation',
  'generate:algorithm',
  'generate:text',
  'generate:lesson_meta',
  'quiz',
  'video-markers',
  'diagram',
  'diagram-sam',
  'segment',
  'segment-frame',
  'sam-phrase',
  'sam-phrase-visual',
  'track',
  'widget',
  'widget-repair',
  'translate',
  'cover',
  'field-scenario',
  'explain-change',
  'prediction-feedback',
  'transcribe',
  'chat',
  'board-read',
  'board-visual',
  'board-proof',
]

describe('parseFeature', () => {
  it('maps logged ids to dictionary keys and block types', () => {
    expect(parseFeature('generate:graph')).toEqual({ key: 'generate', kind: 'graph' })
    expect(parseFeature('board-read')).toEqual({ key: 'board_read', kind: null })
    expect(BLOCK_TYPES).toContain('board')
    expect(parseFeature('video-markers')).toEqual({ key: 'video_markers', kind: null })
    expect(parseFeature('generate:lesson_meta')).toEqual({ key: 'lesson_meta', kind: null })
    expect(parseFeature('generate:unknown_kind')).toEqual({ key: 'generate', kind: null })
  })

  it('returns null for unknown or empty ids so the raw id is shown instead', () => {
    expect(parseFeature('something-new')).toBeNull()
    expect(parseFeature('')).toBeNull()
    expect(parseFeature(null)).toBeNull()
    expect(parseFeature(undefined)).toBeNull()
  })

  it('recognises every feature id the backend logs', () => {
    for (const id of LOGGED_FEATURE_IDS) expect(parseFeature(id), id).not.toBeNull()
  })
})

describe('admin dictionary coverage for dynamic keys', () => {
  it('labels every known AI feature and block type in both languages', () => {
    for (const lang of ['vi', 'en']) {
      for (const key of KNOWN_FEATURES) expect(lookup(DICTS[lang], `admin.features.${key}`), `${lang} ${key}`).toEqual(expect.any(String))
      for (const type of BLOCK_TYPES) expect(lookup(DICTS[lang], `blocks.types.${type}`), `${lang} ${type}`).toEqual(expect.any(String))
    }
  })

  it('has every confirm dialog text used on the users page', () => {
    for (const lang of ['vi', 'en'])
      for (const kind of ['promote', 'demote', 'deactivate'])
        for (const part of ['title', 'body', 'action']) expect(lookup(DICTS[lang], `admin.users.confirm.${kind}.${part}`), `${lang} ${kind}.${part}`).toEqual(expect.any(String))
  })

  it('pluralises counts correctly in English and keeps Vietnamese invariant', () => {
    expect(translate('en', 'admin.users.count', { count: 1, n: '1' })).toBe('1 user')
    expect(translate('en', 'admin.users.count', { count: 3, n: '3' })).toBe('3 users')
    expect(translate('en', 'admin.roleShort.teacher', { count: 1, n: '1' })).toBe('1 teacher')
    expect(translate('en', 'admin.roleShort.admin', { count: 0, n: '0' })).toBe('0 admins')
    expect(translate('vi', 'admin.users.count', { count: 3, n: '3' })).toBe('3 người dùng')
    for (const role of ['teacher', 'student', 'researcher', 'admin'])
      for (const lang of ['vi', 'en']) expect(translate(lang, `admin.roleShort.${role}`, { count: 2, n: '2' })).toMatch(/^2 /)
  })
})

describe('prepTimeParts', () => {
  it('picks minutes, hours or days', () => {
    expect(prepTimeParts(null)).toBeNull()
    expect(prepTimeParts(undefined)).toBeNull()
    expect(prepTimeParts('abc')).toBeNull()
    expect(prepTimeParts(0)).toEqual({ unit: 'minutes', value: 0, digits: 0 })
    expect(prepTimeParts(89)).toMatchObject({ unit: 'minutes', value: 89 })
    expect(prepTimeParts(90)).toMatchObject({ unit: 'hours', value: 1.5 })
    expect(prepTimeParts(2879).unit).toBe('hours')
    expect(prepTimeParts(2880)).toMatchObject({ unit: 'days', value: 2 })
  })
})

describe('latencyParts', () => {
  it('uses milliseconds below one second and seconds above', () => {
    expect(latencyParts(null)).toBeNull()
    expect(latencyParts(850)).toEqual({ unit: 'ms', value: 850, digits: 0 })
    expect(latencyParts(1000)).toEqual({ unit: 's', value: 1, digits: 1 })
    expect(latencyParts(12345)).toMatchObject({ unit: 's', value: 12.345 })
  })
})

describe('asUtc', () => {
  it('marks offset-less API timestamps as UTC', () => {
    expect(asUtc('2026-10-27T23:43:10.582187')).toBe('2026-10-27T23:43:10.582187Z')
    expect(asUtc('2026-10-27T23:43')).toBe('2026-10-27T23:43Z')
    expect(asUtc('2026-10-27 23:43:10')).toBe('2026-10-27T23:43:10Z')
    expect(new Date(asUtc('2026-10-27T23:43:10')).toISOString()).toBe('2026-10-27T23:43:10.000Z')
  })

  it('leaves values with an offset, dates only and non-strings untouched', () => {
    expect(asUtc('2026-10-27T23:43:54.216146Z')).toBe('2026-10-27T23:43:54.216146Z')
    expect(asUtc('2026-10-28T06:43:54+07:00')).toBe('2026-10-28T06:43:54+07:00')
    expect(asUtc('2026-10-27')).toBe('2026-10-27')
    expect(asUtc(null)).toBeNull()
    expect(asUtc(undefined)).toBeUndefined()
  })
})
