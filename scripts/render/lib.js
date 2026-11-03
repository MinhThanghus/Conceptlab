/**
 * Shared helpers for the render pages: the job handshake with render.py, a renderer that can be
 * read back, seeded noise, canvas textures, screen projection and the part-mask pass.
 */
import * as THREE from 'three'

/** render.py waits for window.__job.state, then calls window.__job.run(opts). */
export function job(run) {
  window.__job = { state: 'loading' }
  Promise.resolve()
    .then(run)
    .then((fn) => {
      window.__job = { state: 'ready', run: fn }
    })
    .catch((err) => {
      console.error(err)
      window.__job = { state: 'error', error: String(err && err.stack ? err.stack : err) }
    })
}

export async function fontsReady(faces = []) {
  await Promise.all(faces.map((f) => document.fonts.load(f)))
  await document.fonts.ready
}

/** mulberry32: the same seed gives the same wood, the same clouds, every render. */
export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Smooth value noise in 2D (seeded lattice, quintic fade) and a few octaves of it. */
export function noise2(seed = 1) {
  const r = rng(seed)
  const perm = new Uint16Array(512)
  const vals = new Float32Array(256)
  for (let i = 0; i < 256; i += 1) {
    perm[i] = i
    vals[i] = r()
  }
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(r() * (i + 1))
    ;[perm[i], perm[j]] = [perm[j], perm[i]]
  }
  for (let i = 0; i < 256; i += 1) perm[i + 256] = perm[i]
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10)
  const lerp = (a, b, t) => a + (b - a) * t
  const v = (x, y) => vals[perm[(x & 255) + perm[y & 255]]]
  const n = (x, y) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const u = fade(xf)
    const w = fade(yf)
    return lerp(lerp(v(xi, yi), v(xi + 1, yi), u), lerp(v(xi, yi + 1), v(xi + 1, yi + 1), u), w)
  }
  n.fbm = (x, y, octaves = 4, lac = 2, gain = 0.5) => {
    let amp = 1
    let freq = 1
    let sum = 0
    let norm = 0
    for (let o = 0; o < octaves; o += 1) {
      sum += amp * n(x * freq + o * 17.3, y * freq - o * 9.1)
      norm += amp
      amp *= gain
      freq *= lac
    }
    return sum / norm
  }
  return n
}

export function canvasTexture(width, height, draw, { srgb = true, repeat = null, anisotropy = 8 } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  draw(ctx, width, height)
  const tex = new THREE.CanvasTexture(canvas)
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = anisotropy
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(repeat[0], repeat[1])
  }
  return tex
}

export function makeRenderer(width, height, { scale = 2, alpha = false, toneMapping = THREE.AgXToneMapping, exposure = 1, shadows = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(scale)
  renderer.setSize(width, height, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = toneMapping
  renderer.toneMappingExposure = exposure
  renderer.shadowMap.enabled = shadows
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.domElement.style.width = `${width}px`
  renderer.domElement.style.height = `${height}px`
  document.body.appendChild(renderer.domElement)
  return renderer
}

/** Pixel position (CSS px of a width × height frame) of a world point. */
export function project(point, camera, width, height) {
  const v = point.clone().project(camera)
  return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height, v.z]
}

/** Screen radius (px) of a sphere seen by a perspective camera. */
export function projectedRadius(center, radius, camera, height) {
  const d = center.distanceTo(camera.position)
  const fov = THREE.MathUtils.degToRad(camera.fov)
  return ((radius / Math.sqrt(Math.max(1e-9, d * d - radius * radius))) / Math.tan(fov / 2)) * (height / 2)
}

/**
 * Part masks: every drawable becomes black, the part's own meshes white, rendered with the
 * beauty camera at 1x. `maskOnly` helpers (hit volumes) show only in their own pass;
 * `noOcclude` decorations (vapour, rain) never hide another part.
 */
export function renderMasks(renderer, scene, camera, parts) {
  const black = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
  const lineBlack = new THREE.LineBasicMaterial({ color: 0x000000 })
  const lineWhite = new THREE.LineBasicMaterial({ color: 0xffffff })
  const spriteBlack = new THREE.SpriteMaterial({ color: 0x000000 })
  const spriteWhite = new THREE.SpriteMaterial({ color: 0xffffff })
  const saved = new Map()
  scene.traverse((o) => {
    if (o.isMesh || o.isLine || o.isPoints || o.isSprite) saved.set(o, { material: o.material, visible: o.visible })
  })
  const keep = { background: scene.background, fog: scene.fog, tone: renderer.toneMapping, ratio: renderer.getPixelRatio(), shadows: renderer.shadowMap.enabled }
  scene.background = new THREE.Color(0x000000)
  scene.fog = null
  renderer.toneMapping = THREE.NoToneMapping
  renderer.setPixelRatio(1)
  renderer.shadowMap.enabled = false
  const out = {}
  for (const [name, roots] of Object.entries(parts)) {
    const mine = new Set()
    roots.forEach((r) => r.traverse((o) => mine.add(o)))
    for (const [o, s] of saved) {
      const own = mine.has(o)
      if (o.userData.maskOnly) o.visible = own
      else if (o.userData.noOcclude || o.userData.maskSkip) o.visible = own && !o.userData.maskSkip
      else o.visible = s.visible
      if (o.userData.maskOnly && own) o.visible = true
      if (o.isSprite) o.material = own ? spriteWhite : spriteBlack
      else if (o.isLine) o.material = own ? lineWhite : lineBlack
      else o.material = own ? white : black
    }
    renderer.render(scene, camera)
    out[name] = renderer.domElement.toDataURL('image/png')
  }
  for (const [o, s] of saved) {
    o.material = s.material
    o.visible = s.visible
  }
  scene.background = keep.background
  scene.fog = keep.fog
  renderer.toneMapping = keep.tone
  renderer.setPixelRatio(keep.ratio)
  renderer.shadowMap.enabled = keep.shadows
  return out
}

export function grab(renderer) {
  return renderer.domElement.toDataURL('image/png')
}

/** Wait for every texture image / canvas upload and two frames, so the grab is complete. */
export function settle(renderer, scene, camera, frames = 2) {
  return new Promise((resolve) => {
    let n = 0
    const tick = () => {
      renderer.render(scene, camera)
      n += 1
      if (n >= frames) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}
