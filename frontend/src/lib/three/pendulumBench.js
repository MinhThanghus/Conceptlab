/**
 * Procedural Three.js model of a classroom pendulum stand (img2threejs method: primitives,
 * bevelled boxes, a lathe-free tube network, generated canvas textures, deterministic seeds).
 *
 *   createPendulumBench({ maxLength, count, palette, formatLength, images, tags, lengthText, onChange })
 *     → { group, setPendulum(i, L, thetaRad, amplitude), setImages(urls), setPixelUnit(u), bobs, pivot(i), dispose }
 *
 * Units are metres, so a 1 m string is drawn 1 m long next to a ruler in metres: the length a
 * learner reads on the ruler is the length the model uses. Stylised, not a measured object.
 * `images` (one URL per pendulum) hangs the SAM cut-out from the class photo on the string in
 * place of the ball, as a card that faces the camera; the ball stays as its shadow. `tags`
 * ('A', 'B') name the pendulums when two scenarios swing side by side; `lengthText(L, tag)` writes
 * each string's length beside its tab on the ruler.
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { createLabel, createPictureCard, shadowOnlyMaterial } from './kit.js'

export const BENCH_PALETTE = {
  paper: '#f7f5ec',
  card: '#fcfbf6',
  ink: '#12161c',
  ink2: '#272c32',
  // a light steel: reads as metal under the studio's room light and never turns black without it
  steel: '#7c838c',
  pear: '#f7d21a',
  pearDeep: '#c9a000',
  coral: '#ff5e63',
  blue: '#2f7fd6',
  kraft: '#ae7d52',
  kraftDeep: '#854f15',
  sand: '#d9ac69',
  sugar: '#c6dfef',
  rule: '#d7d4c9',
}

/** Small deterministic PRNG so every render of the stand has the same wood and the same wear. */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvasTexture(width, height, draw) {
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

function woodTexture(palette) {
  const rand = mulberry32(41)
  return canvasTexture(512, 160, (ctx, w, h) => {
    ctx.fillStyle = palette.kraft
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 70; i += 1) {
      const y = rand() * h
      const amp = 2 + rand() * 6
      const light = rand() > 0.5
      ctx.strokeStyle = light ? 'rgba(255, 236, 205, 0.16)' : 'rgba(92, 52, 18, 0.18)'
      ctx.lineWidth = 0.6 + rand() * 1.8
      ctx.beginPath()
      for (let x = 0; x <= w; x += 16) {
        const yy = y + Math.sin(x / (60 + rand() * 40) + i) * amp
        if (x === 0) ctx.moveTo(x, yy)
        else ctx.lineTo(x, yy)
      }
      ctx.stroke()
    }
  })
}

function rulerTexture(palette, maxLength, formatLength) {
  const pxPerM = 400
  const h = Math.ceil(maxLength * pxPerM) + 40
  return canvasTexture(136, h, (ctx, w, height) => {
    ctx.fillStyle = palette.card
    ctx.fillRect(0, 0, w, height)
    ctx.fillStyle = palette.ink
    ctx.strokeStyle = palette.ink
    ctx.font = '600 30px "Lexend Variable", "Lexend", sans-serif'
    ctx.textBaseline = 'middle'
    for (let cm = 0; cm <= maxLength * 100 + 0.5; cm += 5) {
      const y = 20 + (cm / 100) * pxPerM
      const major = cm % 50 === 0
      const mid = cm % 10 === 0
      ctx.lineWidth = major ? 3 : 1.5
      const len = major ? 52 : mid ? 32 : 16
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(len, y)
      ctx.stroke()
      if (major && cm > 0 && formatLength) ctx.fillText(formatLength(cm / 100), 60, y)
    }
  })
}

function bookTexture(palette) {
  const rand = mulberry32(7)
  return canvasTexture(1024, 640, (ctx, w, h) => {
    ctx.fillStyle = palette.card
    ctx.fillRect(0, 0, w, h)
    // gutter shade
    const gutter = ctx.createLinearGradient(w / 2 - 60, 0, w / 2 + 60, 0)
    gutter.addColorStop(0, 'rgba(0,0,0,0)')
    gutter.addColorStop(0.5, 'rgba(40,30,10,0.18)')
    gutter.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gutter
    ctx.fillRect(w / 2 - 60, 0, 120, h)
    // text lines, both pages
    ctx.fillStyle = 'rgba(39, 44, 50, 0.55)'
    for (const x0 of [64, w / 2 + 52]) {
      ctx.fillStyle = palette.ink
      ctx.fillRect(x0, 56, 180, 22)
      ctx.fillStyle = 'rgba(39, 44, 50, 0.5)'
      for (let line = 0; line < 13; line += 1) {
        const y = 110 + line * 34
        if (x0 < w / 2 && line > 3 && line < 10) continue
        const len = 300 + rand() * 90
        ctx.fillRect(x0, y, line % 5 === 4 ? len * 0.55 : len, 9)
      }
    }
    // the figure on the left page: a pendulum and its swing
    ctx.strokeStyle = palette.ink
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(120, 250)
    ctx.lineTo(300, 250)
    ctx.stroke()
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(210, 252)
    ctx.lineTo(262, 420)
    ctx.stroke()
    ctx.setLineDash([4, 10])
    ctx.beginPath()
    ctx.arc(210, 252, 176, Math.PI * 0.39, Math.PI * 0.61)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = palette.coral
    ctx.beginPath()
    ctx.arc(264, 428, 20, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    // the formula box on the right page
    ctx.strokeStyle = palette.pearDeep
    ctx.lineWidth = 4
    ctx.strokeRect(w / 2 + 52, 300, 330, 92)
    ctx.fillStyle = palette.ink
    ctx.font = 'italic 600 46px "Lexend Variable", "Lexend", serif'
    ctx.textBaseline = 'middle'
    ctx.fillText('T = 2π√(L/g)', w / 2 + 76, 348)
  })
}

/** The stand. `count` 1 or 2 pendulums share the arm (scenario A beside scenario B). */
export function createPendulumBench({ maxLength = 2.5, count = 1, palette = BENCH_PALETTE, colors, formatLength = (m) => String(m), images = null, tags = null, lengthText = null, rulerUnit = null, onChange } = {}) {
  const disposables = []
  const keep = (thing) => {
    disposables.push(thing)
    return thing
  }
  const group = new THREE.Group()
  group.name = 'pendulum-bench'

  const baseH = 0.09
  const pivotY = maxLength + 0.62
  const rodX = -0.62
  const armEnd = count === 2 ? 0.86 : 0.42
  const pivotXs = count === 2 ? [0.02, 0.62] : [0.2]
  const bobR = 0.11

  const wood = keep(woodTexture(palette))
  const woodMat = keep(new THREE.MeshStandardMaterial({ color: '#ffffff', map: wood, roughness: 0.78, metalness: 0 }))
  const steelMat = keep(new THREE.MeshStandardMaterial({ color: palette.steel, roughness: 0.32, metalness: 0.35 }))
  const pearMat = keep(new THREE.MeshStandardMaterial({ color: palette.pear, roughness: 0.62, metalness: 0 }))
  const inkMat = keep(new THREE.MeshStandardMaterial({ color: palette.ink2, roughness: 0.5, metalness: 0.1 }))

  // base board: bevelled, so its edges catch the key light
  const base = new THREE.Mesh(keep(new RoundedBoxGeometry(1.9, baseH, 0.95, 4, 0.03)), woodMat)
  base.position.set(0.05, baseH / 2, 0)
  base.castShadow = true
  base.receiveShadow = true
  group.add(base)

  // rod, foot collar, arm and clamps: a tube network, each member its own cylinder
  const rodH = pivotY + 0.06
  const rod = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.045, 0.045, rodH, 28)), steelMat)
  rod.position.set(rodX, baseH + rodH / 2, -0.18)
  rod.castShadow = true
  group.add(rod)
  const foot = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.1, 0.125, 0.08, 36)), inkMat)
  foot.position.set(rodX, baseH + 0.035, -0.18)
  foot.castShadow = true
  group.add(foot)
  const armLen = armEnd - rodX + 0.08
  const arm = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.032, 0.032, armLen, 24)), steelMat)
  arm.rotation.z = Math.PI / 2
  arm.position.set(rodX + armLen / 2 - 0.04, pivotY + 0.035, -0.18)
  arm.castShadow = true
  group.add(arm)
  const clampGeo = keep(new RoundedBoxGeometry(0.17, 0.14, 0.17, 3, 0.028))
  const clamp = new THREE.Mesh(clampGeo, pearMat)
  clamp.position.set(rodX, pivotY + 0.035, -0.18)
  clamp.castShadow = true
  group.add(clamp)
  const knob = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 18)), inkMat)
  knob.rotation.x = Math.PI / 2
  knob.position.set(rodX, pivotY + 0.035, -0.03)
  group.add(knob)

  // ruler in metres, standing behind the swing plane, its zero at the pivot
  const ruler = new THREE.Mesh(
    keep(new RoundedBoxGeometry(0.17, maxLength + 0.1, 0.014, 2, 0.005)),
    keep(new THREE.MeshStandardMaterial({ color: '#ffffff', map: keep(rulerTexture(palette, maxLength, rulerUnit ? null : formatLength)), roughness: 0.85 })),
  )
  ruler.position.set(rodX + 0.2, pivotY - (maxLength + 0.1) / 2 + 0.05, -0.05)
  ruler.castShadow = true
  // the texture keeps a 20px (5 cm) margin above its zero, the same margin the board keeps above the pivot
  group.add(ruler)

  // the open book on the board: the page the lab came from
  const book = new THREE.Group()
  const cover = new THREE.Mesh(keep(new RoundedBoxGeometry(0.8, 0.04, 0.56, 2, 0.014)), keep(new THREE.MeshStandardMaterial({ color: palette.blue, roughness: 0.7 })))
  cover.castShadow = true
  cover.receiveShadow = true
  book.add(cover)
  const pagesGeo = keep(new THREE.PlaneGeometry(0.77, 0.53, 24, 2))
  const pos = pagesGeo.attributes.position
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    // two gentle page curves meeting at the gutter
    pos.setZ(i, 0.028 * Math.sin((Math.abs(x) / 0.385) * Math.PI * 0.92) ** 0.8)
  }
  pagesGeo.computeVertexNormals()
  const pages = new THREE.Mesh(pagesGeo, keep(new THREE.MeshStandardMaterial({ color: '#ffffff', map: keep(bookTexture(palette)), roughness: 0.9 })))
  pages.rotation.x = -Math.PI / 2
  pages.position.y = 0.021
  pages.receiveShadow = true
  book.add(pages)
  book.position.set(0.42, baseH + 0.02, 0.18)
  book.rotation.y = -0.12
  group.add(book)

  // pendulums: each a pivot group that swings about z, holding its string and bob
  const bobColors = colors || (count === 2 ? [palette.coral, palette.blue] : [palette.coral])
  const stringGeo = keep(new THREE.CylinderGeometry(0.008, 0.008, 1, 8))
  stringGeo.translate(0, -0.5, 0) // hangs down from the pivot, scaled by length
  const stringMat = keep(new THREE.MeshStandardMaterial({ color: palette.ink, roughness: 0.6 }))
  const bobGeo = keep(new THREE.SphereGeometry(bobR, 40, 28))
  const hookGeo = keep(new THREE.TorusGeometry(0.024, 0.0075, 8, 20))
  const pendulums = pivotXs.map((x, i) => {
    const swing = new THREE.Group()
    swing.position.set(x, pivotY, 0)
    const string = new THREE.Mesh(stringGeo, stringMat)
    string.castShadow = true
    swing.add(string)
    const bobMat = keep(new THREE.MeshStandardMaterial({ color: bobColors[i % bobColors.length], roughness: 0.34, metalness: 0.05 }))
    const bob = new THREE.Mesh(bobGeo, bobMat)
    bob.castShadow = true
    bob.name = `bob-${i}`
    bob.userData.index = i
    swing.add(bob)
    const hook = new THREE.Mesh(hookGeo, steelMat)
    swing.add(hook)
    // pivot block on the arm
    const block = new THREE.Mesh(keep(new RoundedBoxGeometry(0.1, 0.085, 0.3, 2, 0.016)), pearMat)
    block.position.set(x, pivotY + 0.035, -0.08)
    block.castShadow = true
    group.add(block)
    // the dashed path of the swing, redrawn when the length or the amplitude changes
    const arcMat = keep(new THREE.LineDashedMaterial({ color: palette.ink, dashSize: 0.025, gapSize: 0.035, transparent: true, opacity: 0.45 }))
    const arc = new THREE.Line(new THREE.BufferGeometry(), arcMat)
    arc.position.set(x, pivotY, 0)
    group.add(arc)
    // a tab on the ruler, in the bob's colour, marks where its centre sits: the length L
    const tab = new THREE.Mesh(keep(new RoundedBoxGeometry(0.1, 0.04, 0.04, 2, 0.012)), count === 2 ? bobMat : pearMat)
    tab.castShadow = true
    group.add(tab)
    group.add(swing)
    return { swing, string, bob, bobMaterial: bobMat, hook, arc, tab, card: null, length: -1, amplitude: 0.21 }
  })

  // tags over the pivots: which pendulum is scenario A and which is B
  const labels = (tags || []).slice(0, count).map((text, i) => {
    if (!text) return null
    const label = createLabel(text, { height: 0.075, weight: 700, pill: { fill: palette.card, stroke: bobColors[i % bobColors.length], line: 9 } })
    label.sprite.position.set(pivotXs[i], pivotY + 0.2, -0.08)
    group.add(label.sprite)
    return label
  })

  // with `rulerUnit`, the ruler's numbers are labels that stay readable on a phone (the last one
  // carries the unit) instead of print on the ruler
  const rulerLabels = []
  if (rulerUnit) {
    const marks = []
    for (let cm = 50; cm <= maxLength * 100 + 0.5; cm += 50) marks.push(cm / 100)
    marks.forEach((m, i) => {
      const text = i === marks.length - 1 ? `${formatLength(m)} ${rulerUnit}` : formatLength(m)
      const label = createLabel(text, { height: 0.06, minPx: 11, color: palette.ink2, halo: palette.paper, weight: 500, align: 'left' })
      label.sprite.position.set(rodX + 0.2 + 0.1, pivotY - m, -0.04)
      group.add(label.sprite)
      rulerLabels.push(label)
    })
  }

  // each string's length, written level with its tab on the ruler, left of the rod
  const lengthLabels = lengthText ? pendulums.map(() => createLabel('', { height: 0.07, minPx: 12, color: palette.ink, halo: palette.paper, align: 'right' })) : []
  lengthLabels.forEach((label) => group.add(label.sprite))
  function placeLengthLabels() {
    if (!lengthLabels.length) return
    const x = rodX - 0.08
    pendulums.forEach((p, i) => {
      lengthLabels[i].setText(lengthText(p.length, tags?.[i] || ''))
      lengthLabels[i].sprite.position.set(x, pivotY - p.length, 0.02)
    })
    if (count === 2) {
      // two lengths close together: move the labels apart so both stay readable
      const gap = Math.abs(pendulums[0].length - pendulums[1].length)
      const need = 0.12
      if (gap < need) {
        const upper = pendulums[0].length <= pendulums[1].length ? 0 : 1
        lengthLabels[upper].sprite.position.y += (need - gap) / 2
        lengthLabels[1 - upper].sprite.position.y -= (need - gap) / 2
      }
    }
  }

  // the cut-out from the photo, hung where the ball would be; the ball keeps casting its shadow
  const hidden = shadowOnlyMaterial()
  const cards = []
  function setImages(urls) {
    pendulums.forEach((p, i) => {
      cards[i]?.dispose()
      cards[i]?.sprite.removeFromParent()
      cards[i] = null
      p.card = null
      p.bob.material = p.bobMaterial
      const url = Array.isArray(urls) ? urls[i] : urls
      if (!url) return
      const card = createPictureCard(url, {
        size: bobR * 2.5,
        onLoad: () => {
          p.bob.material = hidden
          onChange?.()
        },
        onError: () => {
          p.bob.material = p.bobMaterial
          onChange?.()
        },
      })
      card.sprite.position.y = -p.length
      p.card = card
      p.swing.add(card.sprite)
      cards[i] = card
    })
  }
  if (images) setImages(images)

  function drawArc(p) {
    const pts = []
    const a = Math.max(p.amplitude, 0.02)
    for (let k = 0; k <= 32; k += 1) {
      const th = -a + (2 * a * k) / 32
      pts.push(new THREE.Vector3(Math.sin(th) * p.length, -Math.cos(th) * p.length, 0))
    }
    p.arc.geometry.dispose()
    p.arc.geometry = new THREE.BufferGeometry().setFromPoints(pts)
    p.arc.computeLineDistances()
  }

  function setPendulum(index, length, theta, amplitude) {
    const p = pendulums[index]
    if (!p) return
    const L = Math.max(0.05, Math.min(maxLength, Number(length) || 0.05))
    const amp = Number.isFinite(amplitude) ? Math.abs(amplitude) : p.amplitude
    if (L !== p.length || amp !== p.amplitude) {
      p.length = L
      p.amplitude = amp
      p.string.scale.y = Math.max(0.001, L - bobR * 0.92)
      p.bob.position.y = -L
      if (p.card) p.card.sprite.position.y = -L
      p.hook.position.y = -L + bobR + 0.012
      p.hook.rotation.y = Math.PI / 2
      p.tab.position.set(rodX + 0.2 + (count === 2 ? (index === 0 ? -0.06 : 0.06) : 0.12), pivotY - L, -0.03)
      drawArc(p)
      placeLengthLabels()
    }
    p.swing.rotation.z = Number(theta) || 0
  }

  pendulums.forEach((_, i) => setPendulum(i, 1, 0, 0.21))

  return {
    group,
    pivotY,
    bobRadius: bobR,
    bobs: pendulums.map((p) => p.bob),
    pivot: (i) => new THREE.Vector3(pivotXs[i] ?? 0, pivotY, 0),
    setPendulum,
    setImages,
    setPixelUnit(u) {
      labels.forEach((l) => l?.setPixelUnit(u))
      lengthLabels.forEach((l) => l.setPixelUnit(u))
      rulerLabels.forEach((l) => l.setPixelUnit(u))
    },
    bounds: { minY: 0, maxY: pivotY + 0.16, minX: rodX - 0.25, maxX: Math.max(...pivotXs) + 0.5 },
    dispose() {
      pendulums.forEach((p) => p.arc.geometry.dispose())
      cards.forEach((c) => c?.dispose())
      labels.forEach((l) => l?.dispose())
      lengthLabels.forEach((l) => l.dispose())
      rulerLabels.forEach((l) => l.dispose())
      hidden.dispose()
      disposables.forEach((d) => d.dispose?.())
    },
  }
}
