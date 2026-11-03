/**
 * Shared parts for the procedural 3D models (img2threejs method): the tokens as sRGB, the studio
 * materials by role, a seeded PRNG, generated canvas textures (wood, grain), labels and chips that
 * face the camera, an arrow, a picture card for the SAM cut-out, and a bin that disposes everything
 * a model made. Only the 3D scenes import this, and only after the 3D view was asked for.
 */
import * as THREE from 'three'
import { oklchToHex } from './simMath.js'

/** The tokens' colours in sRGB (tokens.css, converted with simMath.oklchToHex). */
export const SIM_PALETTE = {
  paper: '#f7f5ec',
  paper2: '#f0ede0',
  paper3: '#e6e1d1',
  card: '#fcfbf6',
  edge: '#d2c6aa',
  ink: '#12161c',
  ink2: '#272c32',
  muted: '#565b63',
  subtle: '#646970',
  control: '#6c727a',
  rule: '#d7d4c9',
  rule2: '#c2beb0',
  // not a token: a light steel that reads as metal with or without the studio's room light
  steel: '#7c838c',
  pear: '#f7d21a',
  pearDeep: '#c9a000',
  pearSoft: '#faefc2',
  blue: '#0064be',
  blueDeep: '#0051a6',
  blueSoft: '#d7edff',
  coral: '#ff5e63',
  coralDeep: '#a8372a',
  coralSoft: '#ffe3df',
  mint: '#70e093',
  mintDeep: '#00713e',
  mintInk: '#005e31',
  mintSoft: '#cbf4d5',
  kraft: '#ae7d52',
  kraftDeep: '#854f15',
  kraftInk: '#78440f',
  sand: '#d9ac69',
  sandSoft: '#fbe9ca',
  sugar: '#c6dfef',
  hill1: '#ebf0da',
  hill2: '#d6eacc',
  leaf: '#36a558',
  plum: '#643b9a',
  plumSoft: '#f0e9ff',
}

export const LABEL_FONT = '"Lexend Variable", "Lexend", ui-rounded, "Segoe UI", sans-serif'

const TOKEN_NAMES = {
  paper: '--color-paper',
  paper2: '--color-paper-2',
  paper3: '--color-paper-3',
  card: '--color-card',
  edge: '--color-edge',
  ink: '--color-ink',
  ink2: '--color-ink-2',
  muted: '--color-muted',
  subtle: '--color-subtle',
  control: '--color-control',
  rule: '--color-rule',
  rule2: '--color-rule-2',
  pear: '--color-accent',
  pearDeep: '--color-accent-deep',
  pearSoft: '--color-accent-soft',
  blue: '--color-accent-2',
  blueDeep: '--color-accent-2-deep',
  blueSoft: '--color-accent-2-soft',
  coral: '--color-accent-3',
  coralDeep: '--color-accent-3-deep',
  coralSoft: '--color-accent-3-soft',
  mint: '--color-mint',
  mintDeep: '--color-mint-deep',
  mintInk: '--color-mint-ink',
  mintSoft: '--color-mint-soft',
  kraft: '--color-kraft',
  kraftDeep: '--color-kraft-deep',
  kraftInk: '--color-kraft-ink',
  sand: '--color-sand',
  sandSoft: '--color-sand-soft',
  sugar: '--color-sugar',
  hill1: '--color-hill-1',
  hill2: '--color-hill-2',
  leaf: '--color-leaf',
  plum: '--color-plum',
  plumSoft: '--color-plum-soft',
}

/**
 * The palette as the page's tokens define it right now (tokens.css is the source of truth),
 * read from the element's computed style; any token missing or not OKLCH keeps its sRGB copy.
 */
export function tokenPalette(el, toHex = oklchToHex) {
  const out = { ...SIM_PALETTE }
  if (typeof window === 'undefined' || !el) return out
  const cs = window.getComputedStyle(el)
  for (const [key, name] of Object.entries(TOKEN_NAMES)) {
    const hex = toHex(cs.getPropertyValue(name))
    if (hex) out[key] = hex
  }
  return out
}

/** The palette read from the page (the element, or the document root when there is none). */
export function scenePalette(el) {
  const host = el || (typeof document !== 'undefined' ? document.documentElement : null)
  return tokenPalette(host, oklchToHex)
}

/**
 * The studio's materials by role, one recipe each so every scene reads as the same object world:
 * matte paper and card, ink structure, one loud coral part, blue data, mint growth, pear-deep
 * small parts, kraft wood, light metal (metalness at most 0.35, so it never renders black without
 * the room light) and sugar glass. Neighbouring parts take roles that differ in lightness.
 */
export const STUDIO_MATERIALS = {
  base: { color: 'paper3', roughness: 0.92 },
  paper: { color: 'paper', roughness: 0.9 },
  card: { color: 'card', roughness: 0.88 },
  edge: { color: 'edge', roughness: 0.85 },
  rule: { color: 'rule2', roughness: 0.8 },
  structure: { color: 'ink2', roughness: 0.55, metalness: 0.1 },
  ink: { color: 'ink', roughness: 0.6 },
  muted: { color: 'muted', roughness: 0.62 },
  moving: { color: 'coral', roughness: 0.4, clearcoat: 0.4 },
  coralDeep: { color: 'coralDeep', roughness: 0.5 },
  coralSoft: { color: 'coralSoft', roughness: 0.75 },
  blue: { color: 'blue', roughness: 0.48 },
  blueDeep: { color: 'blueDeep', roughness: 0.5 },
  blueSoft: { color: 'blueSoft', roughness: 0.7 },
  sugar: { color: 'sugar', roughness: 0.62 },
  mint: { color: 'mint', roughness: 0.6 },
  mintDeep: { color: 'mintDeep', roughness: 0.55 },
  mintSoft: { color: 'mintSoft', roughness: 0.75 },
  pear: { color: 'pear', roughness: 0.5 },
  pearSoft: { color: 'pearSoft', roughness: 0.75 },
  small: { color: 'pearDeep', roughness: 0.5 },
  wood: { color: 'kraft', roughness: 0.78 },
  kraftDeep: { color: 'kraftDeep', roughness: 0.8 },
  sand: { color: 'sand', roughness: 0.8 },
  leaf: { color: 'leaf', roughness: 0.7 },
  hill: { color: 'hill2', roughness: 0.85 },
  plum: { color: 'plum', roughness: 0.5 },
  plumSoft: { color: 'plumSoft', roughness: 0.75 },
  metal: { color: 'rule2', roughness: 0.34, metalness: 0.32 },
  steel: { color: 'steel', roughness: 0.3, metalness: 0.35 },
  glass: { color: 'sugar', roughness: 0.12, metalness: 0, transparent: true, opacity: 0.38, depthWrite: false },
}

/**
 * A new material for `role` (STUDIO_MATERIALS) in `palette`'s colours; `overrides` adjust it
 * (`color` may name a palette key or be a colour). Clearcoated roles are physical materials.
 */
export function studioMaterial(role, palette = SIM_PALETTE, overrides = {}) {
  const { color, clearcoat, ...rest } = { ...(STUDIO_MATERIALS[role] || STUDIO_MATERIALS.base), ...overrides }
  const value = palette[color] || SIM_PALETTE[color] || color
  if (clearcoat) return new THREE.MeshPhysicalMaterial({ color: value, metalness: 0, clearcoat, clearcoatRoughness: 0.35, ...rest })
  return new THREE.MeshStandardMaterial({ color: value, metalness: 0, ...rest })
}

/** Small deterministic PRNG: the same wood and the same field every time the model is built. */
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Collects geometries, materials and textures so dispose() frees all of them. */
export function createBin() {
  const items = new Set()
  return {
    keep(thing) {
      if (thing) items.add(thing)
      return thing
    },
    drop(thing) {
      if (!thing) return
      thing.dispose?.()
      items.delete(thing)
    },
    dispose() {
      items.forEach((d) => d.dispose?.())
      items.clear()
    },
  }
}

export function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  draw(ctx, width, height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/** Long-grain wood for boards and bases: lighter and darker streaks over kraft, seeded. */
export function woodTexture(palette = SIM_PALETTE, seed = 41) {
  const rand = mulberry32(seed)
  return canvasTexture(512, 160, (ctx, w, h) => {
    ctx.fillStyle = palette.kraft
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 70; i += 1) {
      const y = rand() * h
      const amp = 2 + rand() * 6
      ctx.strokeStyle = rand() > 0.5 ? 'rgba(255, 236, 205, 0.16)' : 'rgba(92, 52, 18, 0.18)'
      ctx.lineWidth = 0.6 + rand() * 1.8
      ctx.beginPath()
      const wave = 60 + rand() * 40
      for (let x = 0; x <= w; x += 16) {
        const yy = y + Math.sin(x / wave + i) * amp
        if (x === 0) ctx.moveTo(x, yy)
        else ctx.lineTo(x, yy)
      }
      ctx.stroke()
    }
  })
}

/** A soft speckle over a flat colour (paper, painted metal): roughness the eye reads as material. */
export function speckleTexture(color, seed = 7, { size = 256, dots = 900, alpha = 0.06 } = {}) {
  const rand = mulberry32(seed)
  return canvasTexture(size, size, (ctx, w, h) => {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < dots; i += 1) {
      ctx.fillStyle = rand() > 0.5 ? `rgba(255, 255, 255, ${alpha * 1.4})` : `rgba(40, 30, 10, ${alpha})`
      ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 1.5, 1 + rand() * 1.5)
    }
  })
}

/**
 * A text label drawn on a canvas and shown as a sprite, so it always faces the camera and
 * stays readable (ink on a paper halo, the 2D scenes' label style). `height` is the font size
 * in scene units, never drawn smaller than `minPx` screen pixels: `setPixelUnit(u)` gives the
 * scene units one pixel spans at the target (the stage reports it on every resize), so a small
 * phone stage gets larger labels instead of illegible ones. `setText` redraws only on change.
 */
export function createLabel(text, { height = 0.12, minPx = 12, color = SIM_PALETTE.ink, halo = SIM_PALETTE.paper, weight = 600, pill = null, align = 'center', depthTest = false } = {}) {
  const px = 64
  let pixelUnit = 0
  let size = [px, px * 1.5]
  const rescale = () => {
    const scale = Math.max(height, minPx * pixelUnit) / px
    sprite.scale.set(size[0] * scale, size[1] * scale, 1)
  }
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const material = new THREE.SpriteMaterial({ transparent: true, depthTest, depthWrite: false })
  const sprite = new THREE.Sprite(material)
  sprite.renderOrder = depthTest ? 4 : 10
  let texture = null
  let current = null
  const draw = (value) => {
    const str = String(value ?? '')
    if (str === current) return
    current = str
    const font = `${weight} ${px}px ${LABEL_FONT}`
    ctx.font = font
    const padX = pill ? px * 0.42 : px * 0.18
    const w = Math.max(px, Math.ceil(ctx.measureText(str).width + padX * 2))
    const h = Math.ceil(px * 1.5)
    // a texture keeps the size it was first uploaded at: a new size gets a new texture
    if (!texture || canvas.width !== w || canvas.height !== h) {
      texture?.dispose()
      canvas.width = w
      canvas.height = h
      texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 4
      material.map = texture
      material.needsUpdate = true
    }
    ctx.clearRect(0, 0, w, h)
    ctx.font = font
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    if (pill) {
      const r = h / 2 - 4
      ctx.fillStyle = pill.fill || SIM_PALETTE.card
      ctx.strokeStyle = pill.stroke || SIM_PALETTE.rule2
      ctx.lineWidth = pill.line || 6
      ctx.beginPath()
      // older Safari and Android WebViews have no roundRect: a square pill still reads fine
      if (typeof ctx.roundRect === 'function') ctx.roundRect(4, 4, w - 8, h - 8, r)
      else ctx.rect(4, 4, w - 8, h - 8)
      ctx.fill()
      ctx.stroke()
    } else {
      ctx.lineJoin = 'round'
      ctx.lineWidth = px * 0.22
      ctx.strokeStyle = halo
      ctx.strokeText(str, w / 2, h / 2 + px * 0.04)
    }
    ctx.fillStyle = color
    ctx.fillText(str, w / 2, h / 2 + px * 0.04)
    texture.needsUpdate = true
    size = [w, h]
    rescale()
    sprite.center.set(align === 'left' ? 0 : align === 'right' ? 1 : 0.5, 0.5)
  }
  draw(text)
  return {
    sprite,
    setText: draw,
    setPixelUnit(u) {
      pixelUnit = Number.isFinite(u) && u > 0 ? u : 0
      rescale()
    },
    dispose() {
      texture?.dispose()
      material.dispose()
    },
  }
}

/** True in the preview capture mode (VisualLibrary ?capture=1): scenes show the object only. */
export const captureMode = () => {
  if (typeof document === 'undefined') return false
  if (document.documentElement?.dataset?.capture === 'stage') return true
  try {
    return new URLSearchParams(window.location?.search || '').get('capture') === '1'
  } catch {
    return false
  }
}

/**
 * The smallest on-screen size for a scene's type where `el` sits: 18px in the lesson deck and on a
 * projector (contract C1: nothing in the deck under --deck-small), `page` px elsewhere.
 */
export function labelFloor(el, page = 13) {
  const sheet = el?.closest?.('.deck-paper, .lesson-deck, .projector')
  if (!sheet) return page
  // a phone's sheet is narrow and its smallest deck type is 14px: 18px chips would crowd the model
  const width = sheet.classList?.contains('deck-paper') ? sheet.getBoundingClientRect?.().width || 0 : 0
  return width && width < 640 ? Math.max(14, page) : 18
}

/**
 * The scenes' one label: a chip that faces the camera. Lexend 600 ink on card with a hairline,
 * sentence case, drawn on a canvas at more than twice its on-screen size. `size` is the type's
 * height in scene units; it never renders under `minPx` screen pixels (13 on a page, 18 in the
 * deck or on a projector) nor, with `maxPx`, over it: feed `setPixelUnit` from `stage.onResize`.
 * `swatch` (a colour) adds a dot that ties the chip to its part; `plain` drops the card for type
 * on a paper halo; `fit` keeps the chip inside the stage's framing (stage.frame). Works without a
 * 2D context or `measureText` (tests, old browsers).
 */
export function createChip(text, { size = 0.09, minPx = 13, maxPx = 0, palette = SIM_PALETTE, color, fill, stroke, swatch = null, weight = 600, align = 'center', depthTest = false, plain = false, fit = true } = {}) {
  const px = 44
  const ink = color || palette.ink
  const card = fill || palette.card
  const line = stroke || palette.rule2
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
  const ctx = canvas?.getContext?.('2d') || null
  const can = (name) => Boolean(ctx) && typeof ctx[name] === 'function'
  const material = new THREE.SpriteMaterial({ transparent: true, depthTest, depthWrite: false })
  const sprite = new THREE.Sprite(material)
  sprite.renderOrder = depthTest ? 4 : 12
  if (fit) sprite.userData.fit = true
  else sprite.userData.noFit = true
  // the preview capture mode shows the object only (VisualLibrary ?capture=1)
  if (captureMode()) sprite.visible = false
  let texture = null
  let pixelUnit = 0
  let dims = [px * 3, px * 1.7]
  let current = null
  let disposed = false
  const font = () => `${weight} ${px}px ${LABEL_FONT}`
  const cap = maxPx > 0 ? Math.max(maxPx, minPx) : 0
  const rescale = () => {
    let world = Math.max(size, minPx * pixelUnit)
    if (cap > 0 && pixelUnit > 0) world = Math.min(world, Math.max(size * 0.2, cap * pixelUnit))
    const k = world / px
    sprite.scale.set(dims[0] * k, dims[1] * k, 1)
  }
  const draw = (value, force = false) => {
    const str = String(value ?? '')
    if (str === current && !force) return
    current = str
    const dot = swatch ? px * 0.46 : 0
    const padX = plain ? px * 0.2 : px * 0.62
    let w = Math.ceil(str.length * px * 0.58)
    if (can('measureText')) {
      ctx.font = font()
      const m = ctx.measureText(str)
      if (Number.isFinite(m?.width)) w = Math.ceil(m.width)
    }
    const width = Math.max(px, w + padX * 2 + (dot ? dot + px * 0.32 : 0))
    const height = Math.ceil(px * (plain ? 1.5 : 1.78))
    dims = [width, height]
    if (canvas && ctx) {
      // a texture keeps the size it was first uploaded at: a new size gets a new texture
      if (!texture || canvas.width !== width || canvas.height !== height) {
        texture?.dispose()
        canvas.width = width
        canvas.height = height
        texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = 4
        material.map = texture
        material.needsUpdate = true
      }
      if (can('clearRect')) ctx.clearRect(0, 0, width, height)
      const path = can('beginPath') && can('fill')
      const r = height / 2 - 3
      if (!plain && path) {
        ctx.beginPath()
        if (can('roundRect')) ctx.roundRect(2, 2, width - 4, height - 4, r)
        else if (can('rect')) ctx.rect(2, 2, width - 4, height - 4)
        ctx.fillStyle = card
        ctx.fill()
        if (can('stroke')) {
          ctx.lineWidth = Math.max(2, px * 0.06)
          ctx.strokeStyle = line
          ctx.stroke()
        }
      }
      let x = width / 2
      if (dot && path && can('arc')) {
        const cx = padX + dot / 2
        ctx.beginPath()
        ctx.arc(cx, height / 2, dot / 2, 0, Math.PI * 2)
        ctx.fillStyle = swatch
        ctx.fill()
        x = (padX + dot + px * 0.32 + width - padX) / 2
      }
      ctx.font = font()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      if (plain && can('strokeText')) {
        ctx.lineJoin = 'round'
        ctx.lineWidth = px * 0.24
        ctx.strokeStyle = card
        ctx.strokeText(str, x, height / 2 + px * 0.04)
      }
      ctx.fillStyle = ink
      if (can('fillText')) ctx.fillText(str, x, height / 2 + px * 0.04)
      if (texture) texture.needsUpdate = true
    }
    rescale()
    sprite.center.set(align === 'left' ? 0 : align === 'right' ? 1 : 0.5, 0.5)
  }
  draw(text)
  // Lexend may still be loading: draw again once it is there
  const fonts = typeof document !== 'undefined' ? document.fonts : null
  if (ctx && fonts?.load && fonts.check && !fonts.check(font())) {
    fonts.load(font()).then(() => { if (!disposed) draw(current, true) }, () => {})
  }
  return {
    sprite,
    setText: (value) => draw(value),
    setPixelUnit(u) {
      pixelUnit = Number.isFinite(u) && u > 0 ? u : 0
      rescale()
    },
    dispose() {
      disposed = true
      texture?.dispose()
      material.dispose()
    },
  }
}

/** An arrow along +y from the origin: a shaft and a cone. `setLength` keeps the head size. */
export function createArrow({ color = SIM_PALETTE.ink, radius = 0.012, head = 0.06, bin } = {}) {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 })
  const shaftGeo = new THREE.CylinderGeometry(radius, radius, 1, 10)
  shaftGeo.translate(0, 0.5, 0)
  const headGeo = new THREE.ConeGeometry(radius * 3, head, 16)
  headGeo.translate(0, -head / 2, 0)
  ;[mat, shaftGeo, headGeo].forEach((d) => bin?.keep(d))
  const shaft = new THREE.Mesh(shaftGeo, mat)
  const cone = new THREE.Mesh(headGeo, mat)
  shaft.castShadow = true
  cone.castShadow = true
  group.add(shaft, cone)
  const setLength = (len) => {
    const L = Math.max(head * 1.2, len)
    shaft.scale.y = L - head
    cone.position.y = L
  }
  setLength(0.4)
  return { group, setLength, material: mat }
}

/**
 * The cut-out from the class photo as a card that always faces the camera, sized to fit a
 * `size` square without stretching. The texture loads on its own; `onLoad` asks for a frame.
 */
export function createPictureCard(url, { size = 0.3, onLoad, onError } = {}) {
  const material = new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.04, depthWrite: false })
  const sprite = new THREE.Sprite(material)
  sprite.visible = false
  sprite.renderOrder = 5
  let texture = null
  let alive = true
  new THREE.TextureLoader().load(
    url,
    (tex) => {
      if (!alive) {
        tex.dispose()
        return
      }
      texture = tex
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 4
      material.map = tex
      material.needsUpdate = true
      const w = tex.image?.width || 1
      const h = tex.image?.height || 1
      const k = size / Math.max(w, h)
      sprite.scale.set(w * k, h * k, 1)
      sprite.visible = true
      onLoad?.()
    },
    undefined,
    () => {
      if (alive) onError?.()
    },
  )
  return {
    sprite,
    dispose() {
      alive = false
      texture?.dispose()
      material.dispose()
    },
  }
}

/** A material that writes no colour but still casts a shadow: the photo card's shadow. */
export function shadowOnlyMaterial() {
  return new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
}
