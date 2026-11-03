/**
 * Helpers for SAM 3.1 results returned by POST /api/labs/:id/ai/segment (SegmentOut):
 *   { width, height, phrase_used, objects: [{ id, box: [x1,y1,x2,y2] (inclusive px), mask: {encoding, payload, width, height} }] }
 * Masks are decoded with Meta's official @meta-sam/parser. A mask covers the box area
 * starting at (x1, y1); mask.width = x2 - x1 + 1, mask.height = y2 - y1 + 1.
 */
import { decodeMaskToRaster, decodeMaskToSVGPath } from '@meta-sam/parser'

/** Row-major Uint8Array (0/1) of length mask.width * mask.height, or null if undecodable. */
export function maskRaster(mask) {
  if (!mask) return null
  try {
    return decodeMaskToRaster(mask)
  } catch {
    return null
  }
}

/** SVG path (mask-local pixel coordinates). Empty string if undecodable. */
export function maskPath(mask) {
  if (!mask) return ''
  try {
    return decodeMaskToSVGPath(mask)
  } catch {
    return ''
  }
}

/**
 * Path in normalized units (default 0..1000) of the whole image — the format stored in
 * diagram hotspots (`mask_path`). Render with <svg viewBox="0 0 1000 1000" preserveAspectRatio="none">.
 */
export function normalizedMaskPath(obj, imageWidth, imageHeight, units = 1000) {
  const local = maskPath(obj?.mask)
  if (!local || !imageWidth || !imageHeight) return ''
  const [x1, y1] = obj.box
  const sx = units / imageWidth
  const sy = units / imageHeight
  return local.replace(/([ML])(-?[\d.]+) (-?[\d.]+)/g, (_m, cmd, x, y) => {
    const nx = ((x1 + Number(x) + 0.5) * sx).toFixed(1)
    const ny = ((y1 + Number(y) + 0.5) * sy).toFixed(1)
    return `${cmd}${nx} ${ny}`
  })
}

/** Normalized [x0,y0,x1,y1] (0..1) from an inclusive pixel box. */
export function normalizedBox(box, imageWidth, imageHeight) {
  const [x1, y1, x2, y2] = box
  return [x1 / imageWidth, y1 / imageHeight, (x2 + 1) / imageWidth, (y2 + 1) / imageHeight].map((v) => Math.max(0, Math.min(1, Number(v.toFixed(4)))))
}

/**
 * Paint a translucent mask overlay onto a canvas that displays the image at
 * (canvas.width, canvas.height). Falls back to the box outline when the mask is missing.
 */
export function drawMaskOverlay(ctx, obj, imageWidth, imageHeight, { color = [242, 183, 5], alpha = 0.45, stroke = '#b45309' } = {}) {
  const { width: cw, height: ch } = ctx.canvas
  const sx = cw / imageWidth
  const sy = ch / imageHeight
  const [x1, y1, x2, y2] = obj.box
  const raster = maskRaster(obj.mask)
  if (raster) {
    const mw = obj.mask.width
    const mh = obj.mask.height
    const off = document.createElement('canvas')
    off.width = mw
    off.height = mh
    const octx = off.getContext('2d')
    const img = octx.createImageData(mw, mh)
    for (let i = 0; i < raster.length; i += 1) {
      if (!raster[i]) continue
      img.data[i * 4] = color[0]
      img.data[i * 4 + 1] = color[1]
      img.data[i * 4 + 2] = color[2]
      img.data[i * 4 + 3] = Math.round(alpha * 255)
    }
    octx.putImageData(img, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(off, x1 * sx, y1 * sy, mw * sx, mh * sy)
  }
  ctx.lineWidth = 2
  ctx.strokeStyle = stroke
  ctx.strokeRect(x1 * sx, y1 * sy, (x2 - x1 + 1) * sx, (y2 - y1 + 1) * sy)
}

/**
 * Cut the object out of an image (HTMLImageElement / ImageBitmap at natural size) into a
 * transparent PNG Blob cropped to the box — e.g. the real pendulum bob used in a simulation.
 */
export async function cutoutBlob(image, obj, imageWidth, imageHeight) {
  const [x1, y1, x2, y2] = obj.box
  const w = x2 - x1 + 1
  const h = y2 - y1 + 1
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const scaleX = (image.naturalWidth || image.width) / imageWidth
  const scaleY = (image.naturalHeight || image.height) / imageHeight
  ctx.drawImage(image, x1 * scaleX, y1 * scaleY, w * scaleX, h * scaleY, 0, 0, w, h)
  const raster = maskRaster(obj.mask)
  if (raster && obj.mask.width === w && obj.mask.height === h) {
    const data = ctx.getImageData(0, 0, w, h)
    for (let i = 0; i < raster.length; i += 1) if (!raster[i]) data.data[i * 4 + 3] = 0
    ctx.putImageData(data, 0, 0)
  }
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}
