// Offline copies are opt-in. Each lab has its own cache so it can be removed independently.
import { cacheKeyFor, collectImageUrls, LITE_META_KEY } from './liteUtils.js'

const SHELL_CACHE = 'conceptlab-lite-shell-v1'
const imageCache = (code) => `conceptlab-lite-images-${String(code).toUpperCase()}`

function readJson(key) {
  try { return JSON.parse(window.localStorage.getItem(key) || 'null') } catch { return null }
}

export function liteSavedAt(code) {
  const at = readJson(LITE_META_KEY)?.[String(code || '').toUpperCase()]
  return Number.isFinite(at) && loadCachedLab(code) ? at : null
}

export function loadCachedLab(code) {
  const data = readJson(cacheKeyFor(code))
  return data && typeof data === 'object' && data.spec && data.share_code === String(code).toUpperCase() ? data : null
}

export async function deleteCachedLab(code) {
  const normalized = String(code || '').toUpperCase()
  try {
    window.localStorage.removeItem(cacheKeyFor(normalized))
    const meta = readJson(LITE_META_KEY) || {}
    delete meta[normalized]
    window.localStorage.setItem(LITE_META_KEY, JSON.stringify(meta))
  } catch { /* storage may be unavailable */ }
  if (typeof caches !== 'undefined') await caches.delete(imageCache(normalized))
}

// Drop pictures the lesson no longer uses; a failure here never undoes a finished save.
async function pruneImages(images, wanted) {
  try {
    const keep = new Set(wanted.map((url) => new URL(url, location.href).href))
    for (const request of await images.keys()) {
      if (!keep.has(request.url)) await images.delete(request)
    }
  } catch { /* storage may be unavailable */ }
}

/**
 * Cache the active app shell and the lesson's images. A failed save is never reported as saved and
 * never removes a copy saved earlier. Images are best-effort: the text stays readable without them,
 * and `missing` lists the pictures that will not show offline.
 */
export async function saveLabForOffline(lab) {
  const code = String(lab?.share_code || '').toUpperCase()
  if (!code || !lab?.spec || !('serviceWorker' in navigator) || typeof caches === 'undefined') return { ok: false, missing: [] }
  const hadCopy = Boolean(liteSavedAt(code))
  try {
    await navigator.serviceWorker.register('/lite-sw.js')
    await navigator.serviceWorker.ready
    const shell = await caches.open(SHELL_CACHE)
    const urls = new Set(['/'])
    for (const entry of performance.getEntriesByType('resource')) {
      const url = new URL(entry.name, location.href)
      if (url.origin === location.origin && !url.pathname.startsWith('/api/') && /\.(?:js|css|woff2?|ttf)$/.test(url.pathname)) urls.add(url.href)
    }
    // Fetch the whole shell before writing any of it, so a half-fetched shell never replaces a working one.
    const fetched = await Promise.all([...urls].map(async (url) => {
      const response = await fetch(url, { cache: 'reload' })
      if (!response.ok) throw new Error('Shell resource unavailable')
      return [url, response]
    }))
    await Promise.all(fetched.map(([url, response]) => shell.put(url, response)))
    const images = await caches.open(imageCache(code))
    const wanted = collectImageUrls(lab)
    const results = await Promise.allSettled(wanted.map(async (url) => {
      const response = await fetch(url, { credentials: 'same-origin', cache: 'reload' })
      if (!response.ok) throw new Error('Image unavailable')
      await images.put(url, response)
    }))
    // A picture that failed now but was saved before keeps its earlier copy.
    const missing = []
    for (const [i, result] of results.entries()) {
      if (result.status === 'rejected' && !(await images.match(wanted[i]))) missing.push(wanted[i])
    }
    window.localStorage.setItem(cacheKeyFor(code), JSON.stringify(lab))
    const meta = readJson(LITE_META_KEY) || {}
    meta[code] = Date.now()
    window.localStorage.setItem(LITE_META_KEY, JSON.stringify(meta))
    if (!liteSavedAt(code)) throw new Error('Local storage unavailable')
    await pruneImages(images, wanted)
    return { ok: true, missing }
  } catch {
    // Only a first save leaves partial files to clean up; an earlier good copy stays readable.
    if (!hadCopy) await deleteCachedLab(code)
    return { ok: false, missing: [] }
  }
}

export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}
