/**
 * Whether a 3D lab should load at all. Kept apart from the Three.js code so screens can ask
 * without downloading it: on a 2G link, with data saver on, or without WebGL, the 2D lab shows.
 */
export function lowPowerDevice() {
  if (typeof navigator === 'undefined') return false
  const mem = Number(navigator.deviceMemory || 8)
  const cores = Number(navigator.hardwareConcurrency || 8)
  return mem <= 4 || cores <= 4
}

let cached = null

/**
 * True when WebGL can run and the reader has not asked to save data. Asked once per page load:
 * the check opens a WebGL context, so screens that mount several labs reuse the first answer.
 */
export function canRender3D() {
  if (cached === null) cached = detect3D()
  return cached
}

/** Forget the cached answer (tests). */
export function resetRender3DCache() {
  cached = null
}

function detect3D() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  if (typeof window.WebGLRenderingContext === 'undefined') return false
  const conn = navigator.connection
  if (conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''))) return false
  if (window.matchMedia?.('(prefers-reduced-data: reduce)').matches) return false
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!gl) return false
    // Give the probe's context back at once: browsers cap how many a page may hold.
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}
