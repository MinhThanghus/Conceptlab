/**
 * Source helpers shared by the studio steps and the source viewer (contract: SourceOut in
 * backend/app/schemas/api.py — kinds pdf | image | video | data | note).
 */
import { FileText, Image, NotebookPen, Ruler, Video } from 'lucide-react'

export const SOURCE_KINDS = ['pdf', 'image', 'video', 'data', 'note']
export const SOURCE_ICONS = { pdf: FileText, image: Image, video: Video, data: Ruler, note: NotebookPen }

export function sourceIcon(kind) {
  return SOURCE_ICONS[kind] || FileText
}

/** File-picker accept list: what the backend sniffs and stores (HEIC may be converted or refused). */
export const ACCEPT_FILES =
  'application/pdf,.pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm'

/** Server default limits (backend/.env.example). Used for an early, friendly warning only. */
export const SOFT_LIMITS_MB = { pdf: 40, image: 15, video: 150 }

const EXT_KIND = {
  pdf: 'pdf',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  webp: 'image',
  heic: 'image',
  heif: 'image',
  mp4: 'video',
  mov: 'video',
  webm: 'video',
  m4v: 'video',
}

/** Kind of a picked File, from its MIME type or extension: pdf | image | video | unknown. */
export function fileKind(file) {
  const type = String(file?.type || '').toLowerCase()
  if (type === 'application/pdf') return 'pdf'
  if (/^image\/(jpeg|jpg|pjpeg|png|webp|heic|heif)$/.test(type)) return 'image'
  if (/^video\/(mp4|quicktime|webm|x-m4v)$/.test(type)) return 'video'
  const ext = String(file?.name || '').toLowerCase().split('.').pop()
  return EXT_KIND[ext] || 'unknown'
}

export function stripExtension(name) {
  const base = String(name || '').replace(/\.[^./\\]*$/, '')
  return base || String(name || '')
}

/** Readable default title from a file name: "trang_64-con-lac.jpg" → "trang 64 con lac". */
export function defaultTitle(file, fallback = 'Source') {
  const base = stripExtension(file?.name || '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (base || fallback).slice(0, 200)
}

export function overSoftLimit(kind, bytes) {
  const mb = SOFT_LIMITS_MB[kind]
  return Boolean(mb && bytes > mb * 1024 * 1024)
}

/** URL of a rendered PDF page (1-based) at a given scale (0.5–3), or null. */
export function pageImageUrl(source, page = 1, scale) {
  const template = source?.urls?.page
  if (!template) return null
  const url = template.replace('{n}', String(Math.max(1, Math.round(Number(page) || 1))))
  if (!scale) return url
  const s = Math.min(3, Math.max(0.5, Number(scale)))
  return `${url}${url.includes('?') ? '&' : '?'}scale=${s}`
}

/** Image a SAM selection or a thumbnail can use for a source (image file, PDF page, video poster). */
export function previewUrl(source, { page = 1, scale = 0.5 } = {}) {
  if (!source || source.status !== 'ready') return null
  if (source.kind === 'image') return source.urls?.file || null
  if (source.kind === 'pdf') return pageImageUrl(source, page, scale)
  if (source.kind === 'video') return source.urls?.poster || null
  return null
}

export function isReady(source) {
  return source?.status === 'ready'
}

/** True when a SourceRef points somewhere specific (a citation) rather than "open this source". */
export function isCitation(ref) {
  if (!ref) return false
  return Boolean(ref.quote || ref.page_label || (Array.isArray(ref.bbox) && ref.bbox.length === 4) || (ref.time !== null && ref.time !== undefined))
}

/** Does a lab's spec or analysis mention this source id (citations, images, videos)? */
export function sourceInUse(lab, sourceId) {
  if (!lab || !sourceId) return false
  try {
    const needle = `"${sourceId}"`
    return JSON.stringify(lab.spec || {}).includes(needle) || JSON.stringify(lab.analysis || {}).includes(needle)
  } catch {
    return false
  }
}
