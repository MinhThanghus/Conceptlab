/**
 * Procedural Three.js model of a Vietnamese school physics room corner (img2threejs method:
 * primitives, bevelled boxes, generated canvas textures, seeded noise, every mesh named).
 *
 *   createClassroom({ seed, board }) → { group, benchTop, parts, dispose }
 *
 * A two-tone painted back wall, a green chalkboard with an aluminium frame, a chalk tray with
 * chalk and a felt eraser, a long varnished wooden lab bench, a tiled floor and a wall clock.
 * Units are metres; the bench top's centre is `benchTop` so a model can be stood on it. Pure
 * factory: Three.js only, no app imports. Canvas textures need a DOM (document.createElement).
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

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

function canvasTexture(width, height, draw, { srgb = true, repeat = null } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d'), width, height)
  const tex = new THREE.CanvasTexture(canvas)
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(repeat[0], repeat[1])
  }
  return tex
}

/** Soft speckle: many faint dots, the grain every painted or rolled surface has. */
function speckle(ctx, w, h, rand, count, light, dark, size = 1.4) {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = rand() > 0.5 ? light : dark
    const r = size * (0.4 + rand())
    ctx.fillRect(rand() * w, rand() * h, r, r)
  }
}

export const ROOM_PALETTE = {
  wallTop: '#ece2bf', // pale school yellow
  wallBottom: '#9fb39a', // sage dado
  stripe: '#7e9479',
  board: '#2e4b3e',
  boardEdge: '#c9ccd0',
  wood: '#a66d3e',
  woodDark: '#6e4223',
  tile: '#d9d0c0',
  grout: '#b9ae9b',
  chalk: '#f4f1e8',
}

function wallTexture(p, rand) {
  // 8 m wide, 3.6 m tall: dado up to 1.0 m, a stripe, then the upper paint
  return canvasTexture(2048, 922, (ctx, w, h) => {
    const yDado = h * (1 - 1.0 / 3.6)
    ctx.fillStyle = p.wallTop
    ctx.fillRect(0, 0, w, yDado)
    ctx.fillStyle = p.wallBottom
    ctx.fillRect(0, yDado, w, h - yDado)
    ctx.fillStyle = p.stripe
    ctx.fillRect(0, yDado - 6, w, 7)
    // roller marks and the slow drift of old paint
    for (let i = 0; i < 90; i += 1) {
      const x = rand() * w
      const g = ctx.createLinearGradient(x, 0, x + 60, 0)
      g.addColorStop(0, 'rgba(255,255,255,0)')
      g.addColorStop(0.5, rand() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(80,70,40,0.04)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(x, 0, 60, h)
    }
    speckle(ctx, w, h, rand, 26000, 'rgba(255,255,255,0.10)', 'rgba(60,50,30,0.08)')
    // scuffs along the dado where chairs touch the wall
    for (let i = 0; i < 40; i += 1) {
      ctx.strokeStyle = 'rgba(60,60,50,0.12)'
      ctx.lineWidth = 1 + rand() * 2
      const x = rand() * w
      const y = h - 30 - rand() * 120
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + 10 + rand() * 30, y + (rand() - 0.5) * 6)
      ctx.stroke()
    }
  })
}

function boardTexture(p, rand, lines) {
  // 3.4 m × 1.2 m slate: chalk dust, erased arcs, ghost writing, and the lesson written today
  return canvasTexture(3400, 1200, (ctx, w, h) => {
    ctx.fillStyle = p.board
    ctx.fillRect(0, 0, w, h)
    // uneven slate tone
    for (let i = 0; i < 60; i += 1) {
      const x = rand() * w
      const y = rand() * h
      const r = 150 + rand() * 400
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, rand() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }
    // eraser sweeps: wide, soft horizontal bands of chalk dust, a few zig-zags
    for (let i = 0; i < 34; i += 1) {
      const y = rand() * h
      const x = rand() * w * 0.8
      const len = 300 + rand() * 1200
      const band = 50 + rand() * 60
      const g = ctx.createLinearGradient(0, y - band / 2, 0, y + band / 2)
      const a = 0.025 + rand() * 0.035
      g.addColorStop(0, 'rgba(235,240,232,0)')
      g.addColorStop(0.5, `rgba(235,240,232,${a})`)
      g.addColorStop(1, 'rgba(235,240,232,0)')
      ctx.fillStyle = g
      ctx.fillRect(x, y - band / 2, len, band)
    }
    // ghost of yesterday's writing
    ctx.fillStyle = 'rgba(235,240,232,0.03)'
    ctx.font = '86px "Segoe Print", "Be Vietnam Pro", sans-serif'
    for (let i = 0; i < 9; i += 1) ctx.fillText('a² + b² = c²   x₁ + x₂', 120 + rand() * 1800, 160 + rand() * 900)
    // today's writing, chalk-textured: draw, then knock holes in it
    const write = (text, x, y, size, alpha = 0.9, rot = 0) => {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rot)
      ctx.font = `${size}px "Segoe Print", "Be Vietnam Pro", sans-serif`
      ctx.fillStyle = `rgba(244,241,232,${alpha})`
      ctx.fillText(text, 0, 0)
      ctx.restore()
    }
    for (const l of lines) write(l.text, l.x, l.y, l.size, l.alpha, l.rot || 0)
    const img = ctx.getImageData(0, 0, w, h)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      // chalk never covers fully: thin it where it is bright
      if (d[i] > 120 && rand() < 0.4) {
        d[i] = d[i] * 0.55 + 46 * 0.45
        d[i + 1] = d[i + 1] * 0.55 + 75 * 0.45
        d[i + 2] = d[i + 2] * 0.55 + 62 * 0.45
      }
    }
    ctx.putImageData(img, 0, 0)
    // a dusty band along the bottom where the tray collects chalk
    const g = ctx.createLinearGradient(0, h - 120, 0, h)
    g.addColorStop(0, 'rgba(240,240,232,0)')
    g.addColorStop(1, 'rgba(240,240,232,0.16)')
    ctx.fillStyle = g
    ctx.fillRect(0, h - 120, w, 120)
  })
}

function woodTexture(p, rand) {
  return canvasTexture(2048, 512, (ctx, w, h) => {
    ctx.fillStyle = p.wood
    ctx.fillRect(0, 0, w, h)
    // planks along the bench, each its own tone
    const planks = 4
    for (let k = 0; k < planks; k += 1) {
      const y0 = (k * h) / planks
      ctx.fillStyle = `rgba(${rand() > 0.5 ? '255,220,170' : '70,35,10'},${0.04 + rand() * 0.07})`
      ctx.fillRect(0, y0, w, h / planks)
      ctx.fillStyle = 'rgba(40,20,5,0.35)'
      ctx.fillRect(0, y0, w, 2)
    }
    // grain: long wavy lines, darker latewood
    for (let i = 0; i < 260; i += 1) {
      const y = rand() * h
      const amp = 1 + rand() * 4
      const freq = 200 + rand() * 500
      const phase = rand() * 10
      ctx.strokeStyle = rand() > 0.35 ? `rgba(80,40,12,${0.06 + rand() * 0.12})` : `rgba(255,225,180,${0.05 + rand() * 0.08})`
      ctx.lineWidth = 0.6 + rand() * 2.2
      ctx.beginPath()
      for (let x = 0; x <= w; x += 12) {
        const yy = y + Math.sin(x / freq + phase) * amp + Math.sin(x / (freq * 0.31) + phase) * amp * 0.3
        if (x === 0) ctx.moveTo(x, yy)
        else ctx.lineTo(x, yy)
      }
      ctx.stroke()
    }
    // knots
    for (let i = 0; i < 5; i += 1) {
      const x = rand() * w
      const y = rand() * h
      for (let r = 18; r > 2; r -= 3) {
        ctx.strokeStyle = `rgba(70,35,10,${0.12 + (18 - r) * 0.01})`
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.ellipse(x, y, r * 2.4, r, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    // wear: lighter, matte patches where hands and books rest
    for (let i = 0; i < 30; i += 1) {
      const x = rand() * w
      const y = rand() * h
      const r = 40 + rand() * 120
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, 'rgba(255,235,200,0.07)')
      g.addColorStop(1, 'rgba(255,235,200,0)')
      ctx.fillStyle = g
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }
    speckle(ctx, w, h, rand, 9000, 'rgba(255,230,190,0.06)', 'rgba(40,20,5,0.07)', 1.2)
  })
}

function woodRoughness(rand) {
  return canvasTexture(1024, 256, (ctx, w, h) => {
    ctx.fillStyle = '#6b6b6b'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 40; i += 1) {
      const x = rand() * w
      const y = rand() * h
      const r = 20 + rand() * 70
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, rand() > 0.5 ? 'rgba(170,170,170,0.5)' : 'rgba(60,60,60,0.5)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }
  }, { srgb: false })
}

function tileTexture(p, rand) {
  // 40 cm ceramic tiles, 8 × 8 per texture
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    const n = 8
    const s = w / n
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const v = Math.round((rand() - 0.5) * 14)
        ctx.fillStyle = `rgb(${217 + v},${208 + v},${192 + v})`
        ctx.fillRect(i * s, j * s, s, s)
        for (let k = 0; k < 160; k += 1) {
          ctx.fillStyle = rand() > 0.5 ? 'rgba(120,100,80,0.10)' : 'rgba(255,255,255,0.12)'
          ctx.fillRect(i * s + rand() * s, j * s + rand() * s, 2, 2)
        }
      }
    }
    ctx.strokeStyle = p.grout
    ctx.lineWidth = 3
    for (let i = 0; i <= n; i += 1) {
      ctx.beginPath()
      ctx.moveTo(i * s, 0)
      ctx.lineTo(i * s, h)
      ctx.moveTo(0, i * s)
      ctx.lineTo(w, i * s)
      ctx.stroke()
    }
  }, { repeat: [2, 2] })
}

function clockFace() {
  return canvasTexture(512, 512, (ctx, w) => {
    const c = w / 2
    ctx.fillStyle = '#f7f5ee'
    ctx.beginPath()
    ctx.arc(c, c, c, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#222'
    for (let i = 0; i < 60; i += 1) {
      const a = (i / 60) * Math.PI * 2
      const r0 = i % 5 === 0 ? c * 0.78 : c * 0.86
      ctx.lineWidth = i % 5 === 0 ? 7 : 2.5
      ctx.beginPath()
      ctx.moveTo(c + Math.sin(a) * r0, c - Math.cos(a) * r0)
      ctx.lineTo(c + Math.sin(a) * c * 0.92, c - Math.cos(a) * c * 0.92)
      ctx.stroke()
    }
    ctx.fillStyle = '#222'
    ctx.font = '600 64px "Be Vietnam Pro", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let n = 1; n <= 12; n += 1) {
      const a = (n / 12) * Math.PI * 2
      ctx.fillText(String(n), c + Math.sin(a) * c * 0.62, c - Math.cos(a) * c * 0.62)
    }
    const hand = (a, len, wid, col) => {
      ctx.strokeStyle = col
      ctx.lineWidth = wid
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(c - Math.sin(a) * 30, c + Math.cos(a) * 30)
      ctx.lineTo(c + Math.sin(a) * len, c - Math.cos(a) * len)
      ctx.stroke()
    }
    hand(((9 + 42 / 60) / 12) * Math.PI * 2, c * 0.45, 14, '#1d1d1d') // 9:42, second period
    hand((42 / 60) * Math.PI * 2, c * 0.7, 9, '#1d1d1d')
    hand((17 / 60) * Math.PI * 2, c * 0.78, 3, '#b3261e')
  })
}

/**
 * @param {object} o
 * @param {number} [o.seed]
 * @param {Array<{text:string,x:number,y:number,size:number,alpha?:number,rot?:number}>} [o.board] chalk lines in board pixels (3400 × 1200)
 */
export function createClassroom({ seed = 7, palette = ROOM_PALETTE, board = [] } = {}) {
  const rand = mulberry32(seed)
  const disposables = []
  const keep = (x) => {
    disposables.push(x)
    return x
  }
  const group = new THREE.Group()
  group.name = 'classroom'
  const add = (geo, mat, name, parent = group) => {
    const m = new THREE.Mesh(keep(geo), mat)
    m.name = name
    m.castShadow = true
    m.receiveShadow = true
    parent.add(m)
    return m
  }

  // room shell
  const floorMat = keep(new THREE.MeshStandardMaterial({ map: keep(tileTexture(palette, rand)), roughness: 0.42, metalness: 0 }))
  const floor = add(new THREE.PlaneGeometry(8, 8), floorMat, 'floor')
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, 0, 0.6)
  floor.castShadow = false
  const wallMat = keep(new THREE.MeshStandardMaterial({ map: keep(wallTexture(palette, rand)), roughness: 0.92, metalness: 0 }))
  const backWall = add(new THREE.PlaneGeometry(8, 3.6), wallMat, 'back-wall')
  backWall.position.set(0, 1.8, -1.65)
  backWall.castShadow = false
  const ceiling = add(new THREE.PlaneGeometry(8, 6), keep(new THREE.MeshStandardMaterial({ color: '#f1efe8', roughness: 0.95 })), 'ceiling')
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.set(0, 3.6, 1.35)
  ceiling.castShadow = false
  const skirting = add(new THREE.BoxGeometry(8, 0.1, 0.02), keep(new THREE.MeshStandardMaterial({ color: '#6f7f6c', roughness: 0.7 })), 'skirting')
  skirting.position.set(0, 0.05, -1.64)

  // chalkboard: slate, aluminium frame, tray with chalk and a felt eraser
  const boardGroup = new THREE.Group()
  boardGroup.name = 'chalkboard'
  boardGroup.position.set(-0.15, 1.55, -1.62)
  group.add(boardGroup)
  const slate = add(new THREE.BoxGeometry(3.4, 1.2, 0.02), keep(new THREE.MeshStandardMaterial({ map: keep(boardTexture(palette, rand, board)), roughness: 0.86, metalness: 0 })), 'slate', boardGroup)
  slate.position.z = 0.01
  const alu = keep(new THREE.MeshStandardMaterial({ color: palette.boardEdge, roughness: 0.32, metalness: 0.85 }))
  for (const [w, h, x, y, name] of [
    [3.5, 0.05, 0, 0.625, 'frame-top'],
    [3.5, 0.05, 0, -0.625, 'frame-bottom'],
    [0.05, 1.3, -1.725, 0, 'frame-left'],
    [0.05, 1.3, 1.725, 0, 'frame-right'],
  ]) {
    const bar = add(new RoundedBoxGeometry(w, h, 0.045, 2, 0.01), alu, name, boardGroup)
    bar.position.set(x, y, 0.022)
  }
  const tray = add(new RoundedBoxGeometry(3.42, 0.025, 0.09, 2, 0.008), alu, 'chalk-tray', boardGroup)
  tray.position.set(0, -0.66, 0.06)
  const lip = add(new THREE.BoxGeometry(3.42, 0.03, 0.008), alu, 'chalk-tray-lip', boardGroup)
  lip.position.set(0, -0.645, 0.103)
  const chalkMat = keep(new THREE.MeshStandardMaterial({ color: palette.chalk, roughness: 0.95 }))
  const chalkYellow = keep(new THREE.MeshStandardMaterial({ color: '#f1dc8a', roughness: 0.95 }))
  for (let i = 0; i < 4; i += 1) {
    const len = 0.04 + rand() * 0.05
    const stick = add(new THREE.CylinderGeometry(0.0055, 0.0055, len, 12), i === 2 ? chalkYellow : chalkMat, `chalk-${i}`, boardGroup)
    stick.rotation.z = Math.PI / 2
    stick.rotation.y = (rand() - 0.5) * 0.6
    stick.position.set(0.55 + i * 0.09 + rand() * 0.04, -0.642, 0.055)
  }
  const eraser = new THREE.Group()
  eraser.name = 'eraser'
  add(new RoundedBoxGeometry(0.15, 0.03, 0.055, 2, 0.006), keep(new THREE.MeshStandardMaterial({ color: '#8a5a33', roughness: 0.6 })), 'eraser-back', eraser)
  const felt = add(new RoundedBoxGeometry(0.15, 0.018, 0.055, 2, 0.004), keep(new THREE.MeshStandardMaterial({ color: '#cfcac0', roughness: 1 })), 'eraser-felt', eraser)
  felt.position.y = -0.022
  eraser.position.set(-0.9, -0.618, 0.058)
  eraser.rotation.y = 0.08
  boardGroup.add(eraser)

  // wall clock above the right end of the board
  const clock = new THREE.Group()
  clock.name = 'wall-clock'
  const rim = add(new THREE.TorusGeometry(0.15, 0.018, 16, 48), keep(new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: 0.4, metalness: 0.2 })), 'clock-rim', clock)
  rim.position.z = 0.02
  const face = add(new THREE.CircleGeometry(0.15, 48), keep(new THREE.MeshStandardMaterial({ map: keep(clockFace()), roughness: 0.3 })), 'clock-face', clock)
  face.position.z = 0.015
  clock.position.set(1.25, 2.55, -1.64)
  group.add(clock)

  // a cork notice board with the week's sheets pinned to it (no legible words: blocks of grey lines)
  const cork = canvasTexture(900, 600, (ctx, w, h) => {
    ctx.fillStyle = '#b98e5c'
    ctx.fillRect(0, 0, w, h)
    speckle(ctx, w, h, rand, 30000, 'rgba(255,230,190,0.18)', 'rgba(70,40,15,0.22)', 2.2)
    const sheets = [
      [60, 70, 230, 310, '#f7f5ef', -0.03],
      [330, 50, 250, 190, '#fdf3c4', 0.02],
      [330, 300, 250, 250, '#f7f5ef', -0.015],
      [630, 90, 220, 300, '#e3eef7', 0.03],
      [640, 430, 200, 130, '#f6dfe0', -0.02],
    ]
    for (const [x, y, sw, sh, col, rot] of sheets) {
      ctx.save()
      ctx.translate(x + sw / 2, y + sh / 2)
      ctx.rotate(rot)
      ctx.shadowColor = 'rgba(40,25,10,0.35)'
      ctx.shadowBlur = 8
      ctx.shadowOffsetY = 3
      ctx.fillStyle = col
      ctx.fillRect(-sw / 2, -sh / 2, sw, sh)
      ctx.shadowColor = 'transparent'
      ctx.fillStyle = 'rgba(60,64,72,0.55)'
      ctx.fillRect(-sw / 2 + 22, -sh / 2 + 24, sw * 0.55, 12)
      ctx.fillStyle = 'rgba(80,84,92,0.28)'
      for (let k = 0; k < Math.floor((sh - 70) / 22); k += 1) ctx.fillRect(-sw / 2 + 22, -sh / 2 + 56 + k * 22, (sw - 44) * (0.6 + rand() * 0.4), 6)
      ctx.fillStyle = ['#c0392b', '#2e6fb5', '#2f9e5a', '#e0a800'][Math.floor(rand() * 4)]
      ctx.beginPath()
      ctx.arc(0, -sh / 2 + 12, 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  })
  const notice = new THREE.Group()
  notice.name = 'notice-board'
  add(new THREE.BoxGeometry(0.9, 0.6, 0.02), keep(new THREE.MeshStandardMaterial({ map: keep(cork), roughness: 0.95 })), 'cork', notice)
  const noticeFrame = keep(new THREE.MeshStandardMaterial({ color: '#7a5532', roughness: 0.6 }))
  for (const [w, h, x, y] of [[0.94, 0.03, 0, 0.315], [0.94, 0.03, 0, -0.315], [0.03, 0.66, -0.455, 0], [0.03, 0.66, 0.455, 0]]) {
    const bar = add(new THREE.BoxGeometry(w, h, 0.035), noticeFrame, 'cork-frame', notice)
    bar.position.set(x, y, 0.008)
  }
  notice.position.set(-1.75, 2.55, -1.63)
  group.add(notice)

  // the lab bench: varnished top, apron, square legs, a stretcher
  const wood = keep(woodTexture(palette, rand))
  const topMat = keep(new THREE.MeshPhysicalMaterial({ map: wood, roughnessMap: keep(woodRoughness(rand)), roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.32, metalness: 0 }))
  const frameMat = keep(new THREE.MeshStandardMaterial({ color: palette.woodDark, map: wood, roughness: 0.6 }))
  const bench = new THREE.Group()
  bench.name = 'lab-bench'
  const H = 0.76
  const top = add(new RoundedBoxGeometry(2.6, 0.045, 0.72, 3, 0.012), topMat, 'bench-top', bench)
  top.position.set(0, H - 0.0225, 0)
  const apron = add(new THREE.BoxGeometry(2.48, 0.11, 0.62), frameMat, 'bench-apron', bench)
  apron.position.set(0, H - 0.1, 0)
  for (const [x, z] of [[-1.2, -0.3], [1.2, -0.3], [-1.2, 0.3], [1.2, 0.3]]) {
    const leg = add(new THREE.BoxGeometry(0.06, H - 0.045, 0.06), frameMat, `bench-leg-${x > 0 ? 'r' : 'l'}${z > 0 ? 'f' : 'b'}`, bench)
    leg.position.set(x, (H - 0.045) / 2, z)
  }
  const stretcher = add(new THREE.BoxGeometry(2.4, 0.04, 0.04), frameMat, 'bench-stretcher', bench)
  stretcher.position.set(0, 0.16, -0.28)
  bench.position.set(-0.1, 0, 0)
  group.add(bench)

  return {
    group,
    benchTop: new THREE.Vector3(-0.1, H, 0),
    benchSize: { width: 2.6, depth: 0.72 },
    parts: { floor, backWall, chalkboard: boardGroup, clock, notice, bench },
    dispose() {
      disposables.forEach((d) => d.dispose?.())
    },
  }
}
