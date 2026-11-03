/**
 * Procedural Three.js diorama of the water cycle (img2threejs method, in the spirit of the
 * snowy-village demo): a cut-away block of land with a snow-capped mountain, a river, the sea,
 * clouds with rain, the sun and vapour rising off the water. The cut faces show the soil, the
 * water seeping down and the groundwater flowing back to the sea.
 *
 *   createWaterCycleDiorama({ seed }) → { group, parts, hits, sunDirection, dispose }
 *
 * `parts` maps each stage of the cycle to the meshes that show it (for picking and for masks);
 * `hits` are invisible helper meshes for stages that are a region rather than an object
 * (infiltration). Every mesh is named. Units are arbitrary (the block is 10 × 6). Pure factory:
 * Three.js only; canvas textures need a DOM.
 */
import * as THREE from 'three'

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

function valueNoise(seed) {
  const r = mulberry32(seed)
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
  const v = (x, y) => vals[perm[(x & 255) + perm[y & 255]]]
  const n = (x, y) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const u = fade(x - xi)
    const w = fade(y - yi)
    const a = v(xi, yi) + (v(xi + 1, yi) - v(xi, yi)) * u
    const b = v(xi, yi + 1) + (v(xi + 1, yi + 1) - v(xi, yi + 1)) * u
    return a + (b - a) * w
  }
  return (x, y, oct = 4) => {
    let amp = 1
    let f = 1
    let s = 0
    let norm = 0
    for (let o = 0; o < oct; o += 1) {
      s += amp * n(x * f + o * 31.7, y * f - o * 17.3)
      norm += amp
      amp *= 0.5
      f *= 2.03
    }
    return s / norm
  }
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export const WATER_PALETTE = {
  sea: '#2f86c4',
  seaDeep: '#1d5f97',
  river: '#4ea6dc',
  sand: '#e6d39c',
  grass: '#79ad55',
  grassDark: '#4f8a3c',
  rock: '#8d877c',
  rockDark: '#6c675f',
  snow: '#f5f7fa',
  soil: '#8a5a36',
  soilDark: '#6b4227',
  gravel: '#b39b74',
  bedrock: '#77736d',
  groundwater: '#4f95cf',
  cloud: '#ffffff',
  rainCloud: '#9aa5b3',
  rain: '#6fb3e6',
  sun: '#ffd24a',
  trunk: '#6b4a2f',
  leaf: '#3f7f3a',
  leafLight: '#5f9d43',
  wall: '#f3efe6',
  roof: '#d0623b',
}

// the block
const X0 = -5
const X1 = 5
const Z0 = -3
const Z1 = 3
const BOTTOM = -2.2
// where the cut face shows water seeping down (x from, x to), under the rain and the hills
const INF = [0.35, 3.35]
// the river, from below the snowline to the sea (x, z)
const RIVER = [
  [3.05, -0.55], [2.75, -0.2], [2.35, 0.12], [1.75, 0.55], [1.05, 0.42], [0.45, 0.95], [-0.25, 0.85], [-0.85, 1.35], [-1.55, 1.3], [-2.25, 1.55],
]

function distToRiver(x, z) {
  let best = Infinity
  let along = 0
  let acc = 0
  for (let i = 0; i < RIVER.length - 1; i += 1) {
    const [ax, az] = RIVER[i]
    const [bx, bz] = RIVER[i + 1]
    const dx = bx - ax
    const dz = bz - az
    const len2 = dx * dx + dz * dz
    const len = Math.sqrt(len2)
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2))
    const px = ax + dx * t
    const pz = az + dz * t
    const d = Math.hypot(x - px, z - pz)
    if (d < best) {
      best = d
      along = acc + t * len
    }
    acc += len
  }
  return { d: best, along }
}

export function createWaterCycleDiorama({ seed = 5, palette = WATER_PALETTE } = {}) {
  const rand = mulberry32(seed)
  const noise = valueNoise(seed * 7 + 1)
  const disposables = []
  const keep = (x) => {
    disposables.push(x)
    return x
  }
  const group = new THREE.Group()
  group.name = 'water-cycle-diorama'
  const named = (mesh, name, parent = group) => {
    mesh.name = name
    parent.add(mesh)
    return mesh
  }

  // ---------------------------------------------------------------- terrain height
  const shoreX = (z) => -1.75 + 0.35 * Math.sin(z * 1.1 + 0.6) + 0.15 * Math.sin(z * 2.7)
  function landHeight(x, z) {
    const n = noise(x * 0.55 + 10, z * 0.55 + 4)
    let h = 0.22 + 0.32 * n
    h += 3.1 * Math.exp(-((x - 3.25) ** 2) / 1.5 - ((z + 0.85) ** 2) / 1.9) * (0.88 + 0.28 * noise(x * 1.6, z * 1.6, 3))
    h += 2.0 * Math.exp(-((x - 4.35) ** 2) / 0.75 - ((z - 1.05) ** 2) / 1.1) * (0.9 + 0.2 * noise(x * 2, z * 2 + 9, 3))
    h += 1.5 * Math.exp(-((x - 1.9) ** 2) / 0.6 - ((z + 2.0) ** 2) / 0.7)
    h += 0.5 * Math.exp(-((x - 0.1) ** 2) / 1.2 - ((z + 1.4) ** 2) / 0.8)
    // ridged rock detail where it is high
    const ridge = 1 - Math.abs(2 * noise(x * 2.4 + 3, z * 2.4 - 2, 3) - 1)
    h += smooth(1.0, 2.6, h) * 0.32 * ridge
    return h
  }
  function height(x, z) {
    const land = smooth(-0.25, 0.55, x - shoreX(z))
    const seabed = -0.95 + 0.62 * smooth(-5, shoreX(z), x) + 0.06 * noise(x * 1.3, z * 1.3)
    let h = seabed + (landHeight(x, z) - seabed) * land
    // the river's bed
    const { d } = distToRiver(x, z)
    const carve = 0.17 * (1 - smooth(0.07, 0.3, d)) * smooth(-0.6, 0.2, x - shoreX(z))
    h -= carve
    return h
  }

  // ---------------------------------------------------------------- terrain mesh
  const NX = 320
  const NZ = 192
  const geo = keep(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, NX, NZ))
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i += 1) pos.setY(i, height(pos.getX(i), pos.getZ(i)))
  geo.computeVertexNormals()
  const nrm = geo.attributes.normal
  const colors = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  const P = Object.fromEntries(Object.entries(palette).map(([k, v]) => [k, new THREE.Color(v)]))
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const slope = 1 - nrm.getY(i)
    const n = noise(x * 3.1, z * 3.1, 3)
    const { d } = distToRiver(x, z)
    if (y < 0.06) {
      c.copy(P.sand).lerp(P.soilDark, smooth(0, -0.8, y) * 0.35)
    } else if (y < 0.2 && x < shoreX(z) + 0.7) {
      c.copy(P.sand).lerp(P.grass, smooth(0.08, 0.2, y))
    } else {
      c.copy(P.grass).lerp(P.grassDark, n * 0.8)
      const rocky = Math.max(smooth(0.22, 0.42, slope), smooth(1.25, 1.9, y + n * 0.3))
      c.lerp(P.rock, rocky)
      c.lerp(P.rockDark, rocky * smooth(0.4, 0.7, slope) * 0.6)
      const snow = smooth(2.05, 2.35, y + n * 0.35) * (1 - smooth(0.45, 0.7, slope) * 0.6)
      c.lerp(P.snow, snow)
    }
    if (d < 0.2 && y > 0) c.lerp(P.soilDark, (1 - smooth(0.08, 0.2, d)) * 0.5)
    colors.set([c.r, c.g, c.b], i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const terrain = named(new THREE.Mesh(geo, keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }))), 'terrain')
  terrain.castShadow = true
  terrain.receiveShadow = true

  // ---------------------------------------------------------------- cut faces (soil, groundwater)
  // the water table meets the sea at the shore and rises under the land; the aquifer sits on bedrock
  const waterTable = (x) => -0.06 + 0.1 * smooth(-1.6, 1.4, x) + 0.12 * smooth(1.4, 4.2, x)
  const aquiferBottom = (x) => -0.95 + 0.12 * Math.sin(x * 0.9 + 1) - 0.15 * smooth(-1, -4, x)
  /** Cut-face texture: u runs along the face (point(u) → [x, z]), v from BOTTOM (0) to TOP (1). */
  function strataTexture(point, isFront) {
    const TOP = 3.4
    const W = 2048
    const H = 900
    const tops = new Float32Array(W)
    const xs = new Float32Array(W)
    for (let i = 0; i < W; i += 1) {
      const [x, z] = point(i / (W - 1))
      xs[i] = x
      tops[i] = height(x, z)
    }
    const toPx = (u, y) => [u * (W - 1), ((TOP - y) / (TOP - BOTTOM)) * H]
    const at = (u) => {
      const i = Math.max(0, Math.min(W - 1, Math.round(u * (W - 1))))
      return { x: xs[i], top: tops[i] }
    }
    return canvasTex(W, H, (ctx) => {
      const img = ctx.createImageData(W, H)
      const d = img.data
      for (let j = 0; j < H; j += 1) {
        const y = TOP - ((TOP - BOTTOM) * j) / H
        for (let i = 0; i < W; i += 1) {
          const x = xs[i]
          const top = tops[i]
          const depth = top - y
          const n = noise(i / 90 + 40, y * 4, 3)
          let col
          if (depth < 0) col = [0, 0, 0]
          else if (top < 0.02 && depth < 0.12) col = [205, 186, 140] // sea-bed sand
          else if (depth < 0.07) col = top > 2.1 ? [235, 238, 242] : [92, 140, 70] // turf, or snow on the peak
          else if (y > waterTable(x) && top > 0.02) col = [138 - n * 30, 92 - n * 22, 56 - n * 16] // soil
          else if (y > aquiferBottom(x)) {
            const wet = top > 0.02 ? 0.55 + 0.2 * n : 0.2 + 0.1 * n // saturated sand and gravel: the groundwater
            col = [170 * (1 - wet) + 84 * wet, 150 * (1 - wet) + 146 * wet, 112 * (1 - wet) + 205 * wet]
          } else col = [122 - n * 26, 117 - n * 24, 110 - n * 20] // bedrock
          const k = (j * W + i) * 4
          d[k] = col[0]
          d[k + 1] = col[1]
          d[k + 2] = col[2]
          d[k + 3] = 255
        }
      }
      ctx.putImageData(img, 0, 0)
      // pebbles in the gravel, cracks in the rock
      for (let k = 0; k < 900; k += 1) {
        const u = rand()
        const { x, top } = at(u)
        const y = aquiferBottom(x) + rand() * (waterTable(x) - aquiferBottom(x))
        if (top < y + 0.05) continue
        const [px, py] = toPx(u, y)
        ctx.fillStyle = rand() > 0.5 ? 'rgba(235,228,205,0.55)' : 'rgba(95,90,80,0.45)'
        ctx.beginPath()
        ctx.ellipse(px, py, 3 + rand() * 6, 2 + rand() * 4, rand() * 3, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.strokeStyle = 'rgba(60,56,52,0.35)'
      for (let k = 0; k < 40; k += 1) {
        let [px, py] = toPx(rand(), BOTTOM + 0.1 + rand() * 0.8)
        ctx.lineWidth = 1 + rand() * 2
        ctx.beginPath()
        ctx.moveTo(px, py)
        for (let m = 0; m < 4; m += 1) {
          px += (rand() - 0.3) * 40
          py += (rand() - 0.5) * 30
          ctx.lineTo(px, py)
        }
        ctx.stroke()
      }
      // the water table: a thin bright line where the soil turns wet
      ctx.strokeStyle = 'rgba(140,200,245,0.9)'
      ctx.lineWidth = 3
      ctx.beginPath()
      let started = false
      for (let i = 0; i <= 400; i += 1) {
        const u = i / 400
        const { x, top } = at(u)
        if (top < waterTable(x) + 0.05) {
          started = false
          continue
        }
        const [px, py] = toPx(u, waterTable(x))
        if (!started) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
        started = true
      }
      ctx.stroke()
      if (isFront) {
        // seeping water: drops running down through the soil under the rain, into the groundwater
        for (let k = 0; k < 170; k += 1) {
          const u = (INF[0] - X0) / (X1 - X0) + rand() * ((INF[1] - INF[0]) / (X1 - X0))
          const { x, top } = at(u)
          const room = top - waterTable(x) - 0.12
          if (room < 0.04) continue
          const y = waterTable(x) + 0.06 + rand() * room
          const [px, py] = toPx(u, y)
          ctx.fillStyle = `rgba(110,185,240,${0.75 + rand() * 0.25})`
          ctx.beginPath()
          ctx.moveTo(px, py - 13)
          ctx.quadraticCurveTo(px + 7, py + 1, px, py + 7)
          ctx.quadraticCurveTo(px - 7, py + 1, px, py - 13)
          ctx.fill()
        }
        // groundwater flow: soft streaks running toward the sea
        ctx.strokeStyle = 'rgba(205,234,252,0.6)'
        ctx.lineWidth = 2.5
        for (let k = 0; k < 30; k += 1) {
          const u0 = 0.32 + rand() * 0.5
          const { x } = at(u0)
          const yy = aquiferBottom(x) + 0.12 + rand() * Math.max(0.05, waterTable(x) - aquiferBottom(x) - 0.26)
          const [ax, ay] = toPx(u0, yy)
          const [bx, by] = toPx(u0 - 0.05, yy - 0.03)
          ctx.beginPath()
          ctx.moveTo(ax, ay)
          ctx.lineTo(bx, by)
          ctx.stroke()
        }
      }
    })
  }
  function canvasTex(w, h, draw) {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    draw(canvas.getContext('2d'), w, h)
    const t = keep(new THREE.CanvasTexture(canvas))
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }
  function face(name, n, point, isFront) {
    // a vertical wall under the terrain edge, from BOTTOM up to the surface, with the strata texture
    const TOP = 3.4
    const verts = []
    const uvs = []
    const idx = []
    for (let i = 0; i <= n; i += 1) {
      const u = i / n
      const [x, z] = point(u)
      const top = Math.max(height(x, z), -1.4)
      verts.push(x, BOTTOM, z, x, top, z)
      uvs.push(u, 0, u, (top - BOTTOM) / (TOP - BOTTOM))
      if (i < n) {
        const a = i * 2
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    }
    const g = keep(new THREE.BufferGeometry())
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    g.setIndex(idx)
    g.computeVertexNormals()
    const m = named(new THREE.Mesh(g, keep(new THREE.MeshStandardMaterial({ map: strataTexture(point, isFront), roughness: 0.95, side: THREE.DoubleSide }))), name)
    m.castShadow = true
    m.receiveShadow = true
    return m
  }
  const front = face('cut-front', 320, (u) => [X0 + (X1 - X0) * u, Z1], true)
  const left = face('cut-left', 200, (u) => [X0, Z1 - (Z1 - Z0) * u], false)
  const bottom = named(new THREE.Mesh(keep(new THREE.BoxGeometry(X1 - X0, 0.04, Z1 - Z0)), keep(new THREE.MeshStandardMaterial({ color: '#5f5a54', roughness: 1 }))), 'base')
  bottom.position.set(0, BOTTOM - 0.02, 0)
  bottom.castShadow = true

  // ---------------------------------------------------------------- the sea: surface and its cut face
  const seaGeo = keep(new THREE.PlaneGeometry(4.6, Z1 - Z0, 1, 1))
  seaGeo.rotateX(-Math.PI / 2)
  seaGeo.translate(X0 + 2.3, 0, 0)
  const waterNormal = canvasTex(512, 512, (ctx, w, h) => {
    ctx.fillStyle = 'rgb(128,128,255)'
    ctx.fillRect(0, 0, w, h)
    for (let k = 0; k < 900; k += 1) {
      const x = rand() * w
      const y = rand() * h
      const r = 6 + rand() * 18
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r)
      g.addColorStop(0, 'rgba(150,150,255,0.5)')
      g.addColorStop(1, 'rgba(110,110,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.ellipse(x, y, r * 1.8, r * 0.6, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  })
  waterNormal.colorSpace = THREE.NoColorSpace
  waterNormal.wrapS = waterNormal.wrapT = THREE.RepeatWrapping
  waterNormal.repeat.set(3, 4)
  const seaMat = keep(new THREE.MeshPhysicalMaterial({ color: palette.sea, roughness: 0.12, metalness: 0, normalMap: waterNormal, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.9, clearcoat: 0.6 }))
  const sea = named(new THREE.Mesh(seaGeo, seaMat), 'sea')
  sea.receiveShadow = true
  function waterFace(name, n, point) {
    const verts = []
    const cols = []
    const idx = []
    const top = new THREE.Color(palette.sea)
    const deep = new THREE.Color(palette.seaDeep)
    for (let i = 0; i <= n; i += 1) {
      const [x, z] = point(i / n)
      const b = Math.min(0, height(x, z))
      verts.push(x, b, z, x, 0, z)
      const cb = top.clone().lerp(deep, Math.min(1, -b / 0.9))
      cols.push(cb.r, cb.g, cb.b, top.r, top.g, top.b)
      if (i < n) {
        const a = i * 2
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    }
    const g = keep(new THREE.BufferGeometry())
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return named(new THREE.Mesh(g, keep(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.2, transparent: true, opacity: 0.82, side: THREE.DoubleSide }))), name)
  }
  const seaFront = waterFace('sea-cut-front', 120, (u) => [X0 + 4.6 * u, Z1 + 0.002])
  const seaLeft = waterFace('sea-cut-left', 120, (u) => [X0 - 0.002, Z1 - (Z1 - Z0) * u])

  // ---------------------------------------------------------------- the river (and the stream off the snow)
  function ribbon(points, width0, width1, name, color) {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)))
    const N = 260
    const verts = []
    const idx = []
    for (let i = 0; i <= N; i += 1) {
      const t = i / N
      const p = curve.getPoint(t)
      const tan = curve.getTangent(t)
      const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize()
      const w = width0 + (width1 - width0) * t
      for (const s of [-1, 1]) {
        const x = p.x + side.x * w * s
        const z = p.z + side.z * w * s
        verts.push(x, Math.max(height(x, z), height(p.x, p.z)) + 0.035, z)
      }
      if (i < N) {
        const a = i * 2
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    }
    const g = keep(new THREE.BufferGeometry())
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    const m = named(new THREE.Mesh(g, keep(new THREE.MeshPhysicalMaterial({ color, roughness: 0.15, clearcoat: 0.5, emissive: color, emissiveIntensity: 0.12, side: THREE.DoubleSide }))), name)
    m.receiveShadow = true
    return m
  }
  // the river from the foot of the mountain to the sea; above it, the stream off the snow
  const river = ribbon(RIVER.slice(2), 0.06, 0.12, 'river', palette.river)
  const stream = ribbon([[3.35, -1.05], [3.25, -0.85], [3.12, -0.66], ...RIVER.slice(0, 3)], 0.025, 0.06, 'snowmelt-stream', palette.river)

  // ---------------------------------------------------------------- trees and a small village
  const trunkGeo = keep(new THREE.CylinderGeometry(0.018, 0.026, 0.12, 6))
  trunkGeo.translate(0, 0.06, 0)
  const crownGeo = keep(new THREE.ConeGeometry(0.11, 0.3, 8))
  crownGeo.translate(0, 0.24, 0)
  const roundGeo = keep(new THREE.IcosahedronGeometry(0.11, 1))
  roundGeo.translate(0, 0.19, 0)
  const spots = []
  for (let k = 0; k < 2600 && spots.length < 230; k += 1) {
    const x = -1.2 + rand() * 5.9
    const z = Z0 + 0.2 + rand() * (Z1 - Z0 - 0.4)
    const y = height(x, z)
    if (y < 0.18 || y > 1.45) continue
    if (distToRiver(x, z).d < 0.28) continue
    const sl = Math.abs(height(x + 0.05, z) - height(x - 0.05, z)) + Math.abs(height(x, z + 0.05) - height(x, z - 0.05))
    if (sl > 0.07) continue
    if (noise(x * 1.2 + 50, z * 1.2) < 0.42) continue // trees grow in woods, not evenly
    if (x > -0.6 && x < 0.6 && z > 1.6) continue // the village clearing
    spots.push([x, y, z, 0.7 + rand() * 0.6, rand() > 0.35])
  }
  const leafMat = keep(new THREE.MeshStandardMaterial({ color: palette.leaf, roughness: 0.85 }))
  const leafLightMat = keep(new THREE.MeshStandardMaterial({ color: palette.leafLight, roughness: 0.85 }))
  const trunkMat = keep(new THREE.MeshStandardMaterial({ color: palette.trunk, roughness: 0.9 }))
  const cones = spots.filter((s) => s[4])
  const rounds = spots.filter((s) => !s[4])
  const trees = new THREE.Group()
  trees.name = 'trees'
  group.add(trees)
  const instance = (geoI, mat, list, name) => {
    const im = new THREE.InstancedMesh(geoI, mat, list.length)
    im.name = name
    const m = new THREE.Matrix4()
    list.forEach(([x, y, z, s], i) => {
      m.compose(new THREE.Vector3(x, y - 0.01, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6), new THREE.Vector3(s, s, s))
      im.setMatrixAt(i, m)
    })
    im.castShadow = true
    im.receiveShadow = true
    trees.add(im)
    return im
  }
  instance(trunkGeo, trunkMat, spots, 'tree-trunks')
  instance(crownGeo, leafMat, cones, 'tree-crowns-pine')
  instance(roundGeo, leafLightMat, rounds, 'tree-crowns-round')

  const village = new THREE.Group()
  village.name = 'village'
  const wallMat = keep(new THREE.MeshStandardMaterial({ color: palette.wall, roughness: 0.8 }))
  const roofMat = keep(new THREE.MeshStandardMaterial({ color: palette.roof, roughness: 0.7 }))
  const houseBody = keep(new THREE.BoxGeometry(0.2, 0.13, 0.15))
  const houseRoof = keep(new THREE.ConeGeometry(0.16, 0.11, 4))
  houseRoof.rotateY(Math.PI / 4)
  for (const [x, z, r] of [[-0.35, 2.05, 0.2], [0.05, 2.3, -0.3], [0.35, 1.95, 0.5], [-0.05, 1.75, 0.1]]) {
    const y = height(x, z)
    const body = named(new THREE.Mesh(houseBody, wallMat), 'house', village)
    body.position.set(x, y + 0.065, z)
    body.rotation.y = r
    body.castShadow = true
    body.receiveShadow = true
    const roof = named(new THREE.Mesh(houseRoof, roofMat), 'house-roof', village)
    roof.position.set(x, y + 0.185, z)
    roof.rotation.y = r
    roof.scale.set(1.05, 1, 0.82)
    roof.castShadow = true
  }
  group.add(village)

  // ---------------------------------------------------------------- clouds and rain
  function cloud(name, center, puffs, color, bottomColor, scale = 1) {
    const g = new THREE.Group()
    g.name = name
    const mat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }))
    const top = new THREE.Color(color)
    const bot = new THREE.Color(bottomColor)
    puffs.forEach(([x, y, z, r], i) => {
      const pg = keep(new THREE.SphereGeometry(r * scale, 48, 32))
      const p = pg.attributes.position
      const col = new Float32Array(p.count * 3)
      for (let k = 0; k < p.count; k += 1) {
        // gentle lumps, and a grey belly where the cloud is thick
        const v = new THREE.Vector3(p.getX(k), p.getY(k), p.getZ(k))
        v.multiplyScalar(1 + 0.05 * (noise(v.x * 6 + i, v.y * 6 + v.z * 3) - 0.5))
        p.setXYZ(k, v.x, v.y, v.z)
        const t = smooth(-r * scale, r * scale * 0.6, v.y + y * scale - 0.2)
        const cc = bot.clone().lerp(top, t)
        col.set([cc.r, cc.g, cc.b], k * 3)
      }
      pg.setAttribute('color', new THREE.BufferAttribute(col, 3))
      pg.computeVertexNormals()
      const m = named(new THREE.Mesh(pg, mat), `${name}-puff`, g)
      m.position.set(x * scale, y * scale, z * scale)
      m.castShadow = false
    })
    g.position.copy(center)
    group.add(g)
    return g
  }
  const fair = cloud('condensation-cloud', new THREE.Vector3(-1.15, 3.45, -0.55), [
    [0, 0, 0, 0.62], [0.62, -0.08, 0.1, 0.5], [-0.6, -0.12, 0.05, 0.48], [0.25, 0.32, -0.05, 0.5], [-0.28, 0.28, 0.12, 0.44],
    [1.05, -0.18, -0.05, 0.36], [-1.0, -0.2, -0.1, 0.34], [0.1, -0.2, 0.42, 0.4], [0.55, 0.1, -0.4, 0.42], [-0.45, 0.05, -0.38, 0.4],
  ], palette.cloud, '#dfe6ee')
  const grey = cloud('rain-cloud', new THREE.Vector3(2.75, 4.05, -0.35), [
    [0, 0, 0, 0.66], [0.66, -0.06, 0.12, 0.54], [-0.66, -0.1, 0.05, 0.5], [0.22, 0.34, -0.06, 0.52], [-0.32, 0.3, 0.1, 0.46],
    [1.12, -0.16, -0.06, 0.38], [-1.08, -0.18, -0.08, 0.36], [0.12, -0.2, 0.46, 0.42], [0.5, 0.1, -0.44, 0.44], [-0.48, 0.06, -0.4, 0.42],
  ], '#c7cfd9', '#7d8896')
  const rain = new THREE.Group()
  rain.name = 'rain'
  const dropGeo = keep(new THREE.CylinderGeometry(0.011, 0.011, 0.26, 6))
  const dropMat = keep(new THREE.MeshStandardMaterial({ color: '#4f9fe0', roughness: 0.3, transparent: true, opacity: 0.92, emissive: '#4f9fe0', emissiveIntensity: 0.25 }))
  const drops = []
  for (let k = 0; k < 2400 && drops.length < 420; k += 1) {
    const a = rand() * Math.PI * 2
    const r = Math.sqrt(rand()) * 1.0
    const x = 2.75 + Math.cos(a) * r * 1.25
    const z = -0.3 + Math.sin(a) * r * 0.75
    const ground = height(x, z)
    const y = ground + 0.12 + rand() * (3.55 - ground - 0.12)
    if (y > 3.6) continue
    drops.push([x, y, z])
  }
  const rainMesh = new THREE.InstancedMesh(dropGeo, dropMat, drops.length)
  rainMesh.name = 'rain-drops'
  const m4 = new THREE.Matrix4()
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.12))
  drops.forEach(([x, y, z], i) => {
    m4.compose(new THREE.Vector3(x, y, z), tilt, new THREE.Vector3(1, 0.8 + rand() * 0.5, 1))
    rainMesh.setMatrixAt(i, m4)
  })
  rainMesh.userData.noOcclude = true
  rain.add(rainMesh)
  group.add(rain)

  // ---------------------------------------------------------------- vapour rising off the sea
  const vapour = new THREE.Group()
  vapour.name = 'evaporation'
  const fade = canvasTex(256, 8, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.08, 'rgba(255,255,255,1)')
    g.addColorStop(0.65, 'rgba(255,255,255,0.75)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
  fade.colorSpace = THREE.NoColorSpace
  const vapMat = keep(new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#eaf4ff', emissiveIntensity: 0.35, roughness: 1, transparent: true, alphaMap: fade, depthWrite: false, opacity: 0.5 }))
  const wisps = [
    [-3.9, 1.6, 0.0], [-3.4, 0.6, 0.6], [-2.95, 1.9, 1.2], [-3.75, -0.4, 1.8], [-2.6, 0.9, 2.4], [-3.2, -1.1, 0.9],
  ]
  const puffGeo = keep(new THREE.SphereGeometry(1, 24, 16))
  wisps.forEach(([x, z, ph], i) => {
    const pts = []
    for (let k = 0; k <= 24; k += 1) {
      const t = k / 24
      pts.push(new THREE.Vector3(x + 0.85 * t * t + 0.13 * Math.sin(t * 9 + ph), 0.04 + t * 2.75, z - 0.6 * t + 0.1 * Math.cos(t * 7 + ph)))
    }
    const curve = new THREE.CatmullRomCurve3(pts)
    const tg = keep(new THREE.TubeGeometry(curve, 90, 0.02 + 0.004 * (i % 2), 8, false))
    const w = named(new THREE.Mesh(tg, vapMat), 'vapour-wisp', vapour)
    w.userData.noOcclude = true
    w.renderOrder = 2
    // steam: puffs that swell and thin out as they rise
    for (let k = 0; k < 16; k += 1) {
      const t = 0.04 + (k / 15) * 0.9
      const q = curve.getPoint(t)
      const r = 0.05 + 0.15 * t
      const mat = keep(new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#f2f8ff', emissiveIntensity: 0.4, roughness: 1, transparent: true, opacity: 0.32 * (1 - t) + 0.05, depthWrite: false }))
      const puff = named(new THREE.Mesh(puffGeo, mat), 'vapour-puff', vapour)
      puff.position.copy(q).add(new THREE.Vector3((rand() - 0.5) * 0.06, 0, (rand() - 0.5) * 0.06))
      puff.scale.setScalar(r)
      puff.userData.noOcclude = true
      puff.renderOrder = 3
    }
  })
  group.add(vapour)

  // ---------------------------------------------------------------- the sun
  const sunGroup = new THREE.Group()
  sunGroup.name = 'sun'
  const sun = named(new THREE.Mesh(keep(new THREE.SphereGeometry(0.52, 48, 32)), keep(new THREE.MeshBasicMaterial({ color: palette.sun }))), 'sun-disc', sunGroup)
  const glowTex = canvasTex(256, 256, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, w * 0.18, w / 2, w / 2, w / 2)
    g.addColorStop(0, 'rgba(255,224,120,0.75)')
    g.addColorStop(0.45, 'rgba(255,214,110,0.22)')
    g.addColorStop(1, 'rgba(255,214,110,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, w)
  })
  const glow = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false })))
  glow.name = 'sun-glow'
  glow.scale.set(2.6, 2.6, 1)
  glow.userData.maskSkip = true
  sunGroup.add(glow)
  sunGroup.position.set(-5.4, 5.6, -3.2)
  // the stage frames the diorama; the sun (and its glow) sits wherever there is sky
  sunGroup.userData.noFit = true
  group.add(sunGroup)

  // ---------------------------------------------------------------- hit regions (for picking and masks)
  // infiltration: the stretch of the cut face where the drops seep down to the groundwater
  const infGeo = keep(new THREE.PlaneGeometry(1, 1))
  const infiltration = named(new THREE.Mesh(infGeo, keep(new THREE.MeshBasicMaterial({ visible: false }))), 'hit-infiltration')
  const [ix0, ix1] = INF
  const iyTop = Math.min(height(1.2, Z1), 0.35)
  const iyBottom = -1.0
  infiltration.scale.set(ix1 - ix0, iyTop - iyBottom, 1)
  infiltration.position.set((ix0 + ix1) / 2, (iyTop + iyBottom) / 2, Z1 + 0.003)
  infiltration.userData.maskOnly = true

  const sunDirection = new THREE.Vector3().copy(sunGroup.position).normalize()
  return {
    group,
    height,
    parts: {
      sun: [sun],
      evaporation: [vapour],
      condensation: [fair],
      rain: [grey, rain],
      // the stream off the snow runs under the rain; the river is what a learner points at
      runoff: [river],
      snowmelt: [stream],
      infiltration: [infiltration],
      sea: [sea, seaFront, seaLeft],
      land: [terrain, front, left],
    },
    hits: { infiltration },
    sunDirection,
    dispose() {
      disposables.forEach((d) => d.dispose?.())
    },
  }
}
