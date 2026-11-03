/**
 * Client-side image compression before upload (low-bandwidth classrooms, low-end phones).
 *
 *   const file = await compressImage(input, { maxSide: 2000, quality: 0.85 })
 *
 * - Photos and scans become a JPEG (white background) no larger than `maxSide` px.
 * - PNGs with transparency are kept as they are when already small; large ones are resized
 *   but stay PNG so the transparency survives.
 * - Never throws: the original file is returned when the browser cannot decode it (HEIC on
 *   most browsers, animated GIF, SVG), when it is already small enough, or when re-encoding
 *   would not make it smaller.
 * EXIF orientation is applied while decoding (createImageBitmap 'from-image'); re-encoding
 * drops metadata such as GPS location (the server strips it as well).
 */

/** Types the canvas can re-encode safely (no animation, no vector). */
const DECODABLE = new Set(['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp', 'image/bmp'])

/** Below this size an image that already fits `maxSide` is uploaded untouched. */
export const SMALL_BYTES = 350 * 1024
/** Transparent PNGs up to this size are kept as they are. */
export const SMALL_PNG_BYTES = 1.5 * 1024 * 1024

/**
 * Scale (width, height) down so the longest side is at most `maxSide` (never up).
 * Returns integer dimensions (≥ 1) and the scale factor applied.
 */
export function fitWithin(width, height, maxSide) {
  const w = Number(width)
  const h = Number(height)
  const m = Number(maxSide)
  if (!(w > 0) || !(h > 0) || !Number.isFinite(w) || !Number.isFinite(h)) return { width: 0, height: 0, scale: 1 }
  if (!(m > 0) || Math.max(w, h) <= m) return { width: Math.round(w), height: Math.round(h), scale: 1 }
  const scale = m / Math.max(w, h)
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale }
}

/** "IMG_2041.HEIC" + image/jpeg → "IMG_2041.jpg" */
export function outputName(name, type) {
  const base = String(name || '').replace(/\.[^./\\]*$/, '').trim() || 'image'
  return `${base}.${type === 'image/png' ? 'png' : 'jpg'}`
}

/**
 * Decide what to do with a decoded image (pure; unit-tested).
 *   info: { type, size, width, height, hasAlpha }
 *   → { action: 'keep' } | { action: 'encode', type, width, height, scale }
 */
export function compressionPlan(info, { maxSide = 2000, smallBytes = SMALL_BYTES, smallPngBytes = SMALL_PNG_BYTES } = {}) {
  const { size = 0, width, height, hasAlpha = false } = info || {}
  const fit = fitWithin(width, height, maxSide)
  if (!fit.width || !fit.height) return { action: 'keep' }
  const resize = fit.scale < 1
  if (hasAlpha) {
    if (!resize && size <= smallPngBytes) return { action: 'keep' }
    return { action: 'encode', type: 'image/png', ...fit }
  }
  if (!resize && size <= smallBytes) return { action: 'keep' }
  return { action: 'encode', type: 'image/jpeg', ...fit }
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/** True when any sampled pixel is not fully opaque (sampled on a ≤ 256 px copy). */
function detectAlpha(bitmap) {
  const { width, height } = fitWithin(bitmap.width, bitmap.height, 256)
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false
  ctx.drawImage(bitmap, 0, 0, width, height)
  const { data } = ctx.getImageData(0, 0, width, height)
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true
  return false
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), type, quality)
    } catch {
      resolve(null)
    }
  })
}

/**
 * Compress an image File before upload. Resolves to a File (possibly the original).
 */
export async function compressImage(file, { maxSide = 2000, quality = 0.85 } = {}) {
  if (!file || typeof file !== 'object') return file
  const type = String(file.type || '').toLowerCase()
  if (!DECODABLE.has(type)) return file
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file
  let bitmap = null
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const canHaveAlpha = type === 'image/png' || type === 'image/webp'
    const plan = compressionPlan(
      { type, size: file.size, width: bitmap.width, height: bitmap.height, hasAlpha: canHaveAlpha ? detectAlpha(bitmap) : false },
      { maxSide },
    )
    if (plan.action === 'keep') return file
    const canvas = makeCanvas(plan.width, plan.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    if (plan.type === 'image/jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, plan.width, plan.height)
    }
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, plan.width, plan.height)
    const blob = await canvasToBlob(canvas, plan.type, plan.type === 'image/jpeg' ? quality : undefined)
    if (!blob || !blob.size) return file
    // Re-encoding an already well-compressed image can make it bigger: keep the original then.
    if (blob.size >= file.size && plan.scale === 1) return file
    return new File([blob], outputName(file.name, plan.type), { type: plan.type, lastModified: file.lastModified || Date.now() })
  } catch {
    return file
  } finally {
    try {
      bitmap?.close?.()
    } catch {
      /* ignore */
    }
  }
}
