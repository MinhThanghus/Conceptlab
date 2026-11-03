import { useEffect, useState } from 'react'

/** Subscribe to a CSS media query (e.g. the 1200 px breakpoint where the side panel becomes an overlay). */
export function useMediaQuery(query) {
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false)
  const [matches, setMatches] = useState(get)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const list = window.matchMedia(query)
    const onChange = () => setMatches(list.matches)
    onChange()
    if (typeof list.addEventListener === 'function') list.addEventListener('change', onChange)
    else list.addListener(onChange)
    return () => {
      if (typeof list.removeEventListener === 'function') list.removeEventListener('change', onChange)
      else list.removeListener(onChange)
    }
  }, [query])
  return matches
}

// ------------------------------------------------------------------ per-browser learner progress
// Only a list of visited part ids and the last open part are kept, on this device, for
// convenience. Nothing identifies the learner and nothing is sent to the server.
function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable (private mode, quota) — progress just is not remembered */
  }
}

export function loadProgress(storeKey) {
  if (!storeKey) return { visited: [], index: 0 }
  const data = read(`cl.progress.${storeKey}`, null)
  if (!data || typeof data !== 'object') return { visited: [], index: 0 }
  return {
    visited: Array.isArray(data.visited) ? data.visited.filter((id) => typeof id === 'string').slice(0, 200) : [],
    index: Number.isInteger(data.index) && data.index >= 0 ? data.index : 0,
  }
}

export function saveProgress(storeKey, { visited, index }) {
  if (!storeKey) return
  write(`cl.progress.${storeKey}`, { visited: [...visited].slice(0, 200), index })
}

export function loadPref(name, fallback) {
  return read(`cl.explorer.${name}`, fallback)
}

export function savePref(name, value) {
  write(`cl.explorer.${name}`, value)
}

export function feedbackSent(code) {
  return Boolean(code && read(`cl.feedback.${code}`, false))
}

export function markFeedbackSent(code) {
  if (code) write(`cl.feedback.${code}`, true)
}

// ------------------------------------------------------------------ QR codes (lazy-loaded)
let qrPromise = null
function loadQr() {
  if (!qrPromise) qrPromise = import('qrcode').then((mod) => mod.default || mod)
  return qrPromise
}

/**
 * A colour token as #rrggbb. The QR library only reads hex, and the tokens are OKLCH (or aliases
 * of them), so the colour is painted on a 1 px canvas and read back. Falls back when there is no
 * canvas (tests, very old browsers).
 */
function cssColorHex(name, fallback) {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    if (!value) return fallback
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return fallback
    ctx.fillStyle = fallback
    ctx.fillStyle = value
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
  } catch {
    return fallback
  }
}

/** PNG data URL of a QR code for `text` (dark ink on a light card: what phone cameras read best). */
export async function qrDataUrl(text, size = 512) {
  const QR = await loadQr()
  return QR.toDataURL(text, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: cssColorHex('--color-ink', '#1b2430'), light: cssColorHex('--color-card', '#ffffff') },
  })
}

/** { url, error, loading } for a QR code; regenerated when text changes. */
export function useQrCode(text, size = 512) {
  const [state, setState] = useState({ url: null, error: null, loading: Boolean(text) })
  useEffect(() => {
    if (!text) {
      setState({ url: null, error: null, loading: false })
      return undefined
    }
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    qrDataUrl(text, size)
      .then((url) => alive && setState({ url, error: null, loading: false }))
      .catch((error) => alive && setState({ url: null, error, loading: false }))
    return () => {
      alive = false
    }
  }, [text, size])
  return state
}

/** Copy text to the clipboard, with a fallback for http:// pages where the Clipboard API is missing. */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

/** Public link a learner opens for a share code. */
export function shareUrlFor(code) {
  if (!code) return ''
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/s/${code}`
}

export function joinUrl() {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/join`
}

/**
 * Which lesson-wide learner options do something in this lab: the explanation level only
 * switches diagram descriptions, the "active learning" switch only opens the prediction
 * challenge of simulations and graphs. A control that changes nothing is hidden.
 */
export function learnerOptions(blocks = []) {
  const list = (blocks || []).filter(Boolean)
  return {
    level: list.some((b) => b.type === 'diagram'),
    active: list.some((b) => b.type === 'simulation' || b.type === 'graph'),
  }
}
