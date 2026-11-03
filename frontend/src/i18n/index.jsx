/**
 * Bilingual UI (Tiếng Việt / English).
 *
 *   const { t, lang, setLang, bilingual, fmt } = useT()
 *   t('common.actions.save')            → string in the current language
 *   t(key, { count: 3 })                → plural via `<key>_one` / `<key>_other`
 *   t(key, { name: 'Lan' })             → "{name}" interpolation
 *   tr({ vi, en })                      → pick a value for the current language
 *
 * Dictionaries: src/i18n/locales/{vi,en}/<namespace>.js, merged in locales/{vi,en}/index.js.
 * Every key must exist in BOTH languages (scripts/check-i18n.mjs verifies parity).
 * Missing keys render as ⟦key⟧ in dev and are collected in window.__CL_I18N_MISSING__.
 *
 * Each language is its own lazy chunk: a phone on a slow school network downloads only the
 * language it reads. main.jsx loads the reader's language before the first render
 * (`ensureDict(initialLang())`); switching languages loads the other one, then switches.
 * Tests register both dictionaries up front (src/test/setup-i18n.js).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export const DICTS = {}
const LOADERS = {
  vi: () => import('./locales/vi/index.js'),
  en: () => import('./locales/en/index.js'),
}

/** Make a dictionary available synchronously (tests, or after a lazy load). */
export function registerDict(lang, dict) {
  DICTS[lang] = dict
}

/** Load a language's dictionary once; resolves when `t()` can use it. */
export async function ensureDict(lang) {
  const code = LOADERS[lang] ? lang : 'vi'
  if (!DICTS[code]) DICTS[code] = (await LOADERS[code]()).default
  return DICTS[code]
}
export const LANGS = [
  { code: 'vi', label: 'Tiếng Việt', short: 'VI' },
  { code: 'en', label: 'English', short: 'EN' },
]
const LANG_KEY = 'cl.lang'
const BILINGUAL_KEY = 'cl.bilingual'

function lookup(dict, key) {
  return key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), dict)
}

function interpolate(text, vars) {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (match, name) => (vars[name] !== undefined && vars[name] !== null ? String(vars[name]) : match))
}

const missing = new Set()
function reportMissing(lang, key) {
  const id = `${lang}:${key}`
  if (missing.has(id)) return
  missing.add(id)
  if (typeof window !== 'undefined') window.__CL_I18N_MISSING__ = [...missing]
  if (import.meta.env.DEV) console.warn(`[i18n] missing ${id}`)
}

export function translate(lang, key, vars) {
  const dict = DICTS[lang] || DICTS.vi || DICTS.en || {}
  let value
  if (vars && typeof vars.count === 'number') {
    const form = lang === 'en' && vars.count === 1 ? 'one' : 'other'
    value = lookup(dict, `${key}_${form}`) ?? lookup(dict, `${key}_other`)
  }
  value = value ?? lookup(dict, key)
  if (typeof value !== 'string') {
    reportMissing(lang, key)
    const other = lookup(DICTS[lang === 'vi' ? 'en' : 'vi'] || {}, key)
    if (typeof other === 'string' && !import.meta.env.DEV) return interpolate(other, vars)
    return import.meta.env.DEV ? `⟦${key}⟧` : key.split('.').pop()
  }
  return interpolate(value, vars)
}

function readStored(key, fallback) {
  try {
    const value = window.localStorage.getItem(key)
    return value ?? fallback
  } catch {
    return fallback
  }
}

function writeStored(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* storage unavailable (private mode): the preference just won't persist */
  }
}

export function initialLang() {
  const stored = readStored(LANG_KEY, null)
  if (stored === 'vi' || stored === 'en') return stored
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : ''
  return nav.toLowerCase().startsWith('en') ? 'en' : 'vi'
}

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(initialLang)
  const [bilingual, setBilingualState] = useState(() => readStored(BILINGUAL_KEY, '0') === '1')

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((next) => {
    if (next !== 'vi' && next !== 'en') return
    writeStored(LANG_KEY, next)
    if (DICTS[next]) {
      setLangState(next)
      return
    }
    // The other language is a separate chunk: switch once it has arrived (the page keeps the
    // current language meanwhile instead of showing keys).
    ensureDict(next)
      .then(() => setLangState(next))
      .catch(() => {})
  }, [])

  const setBilingual = useCallback((on) => {
    setBilingualState(Boolean(on))
    writeStored(BILINGUAL_KEY, on ? '1' : '0')
  }, [])

  const value = useMemo(() => {
    const locale = lang === 'vi' ? 'vi-VN' : 'en-US'
    const t = (key, vars) => translate(lang, key, vars)
    const tr = (pair) => (pair && typeof pair === 'object' ? pair[lang] ?? pair.vi ?? pair.en ?? '' : pair ?? '')
    // A missing value is said in words ("Chưa có" / "None"), never drawn as a dash.
    const none = translate(lang, 'common.states.none')
    // An unreadable timestamp is said as missing instead of throwing a RangeError mid-render.
    const toDate = (value) => {
      if (!value) return null
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? null : date
    }
    const fmt = {
      number: (value, digits = 2) => {
        if (value === null || value === undefined || Number.isNaN(Number(value))) return none
        if (!Number.isFinite(Number(value))) return Number(value) > 0 ? '∞' : '−∞'
        return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(Number(value))
      },
      percent: (value, digits = 0) =>
        value === null || value === undefined ? none : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: digits }).format(value),
      date: (value) => {
        const date = toDate(value)
        return date ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date) : none
      },
      dateTime: (value) => {
        const date = toDate(value)
        return date ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date) : none
      },
      relative: (value) => {
        const date = toDate(value)
        if (!date) return none
        const diff = (date.getTime() - Date.now()) / 1000
        const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
        const abs = Math.abs(diff)
        if (abs < 60) return rtf.format(Math.round(diff), 'second')
        if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
        if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
        if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day')
        return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
      },
      bytes: (n) => {
        if (!n && n !== 0) return none
        const units = ['B', 'KB', 'MB', 'GB']
        let size = n
        let i = 0
        while (size >= 1024 && i < units.length - 1) {
          size /= 1024
          i += 1
        }
        return `${new Intl.NumberFormat(locale, { maximumFractionDigits: i ? 1 : 0 }).format(size)} ${units[i]}`
      },
      duration: (ms) => {
        if (ms === null || ms === undefined) return none
        const s = Math.round(ms / 1000)
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
      },
    }
    return { lang, setLang, locale, t, tr, fmt, bilingual, setBilingual }
  }, [lang, setLang, bilingual, setBilingual])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useT() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useT must be used inside <I18nProvider>')
  return ctx
}
