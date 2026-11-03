/**
 * Procedural Three.js model of a throw on a school field (img2threejs method: bevelled boxes,
 * a lathe tee, a tube trail, instanced dots, generated canvas textures, a seeded speckle).
 *
 *   createProjectileField({ lanes, colors, dashed, images, palette, formatMetres, onChange })
 *     → { group, frame, update(state), dispose() }
 *
 *   state = { layout: projectileLayout(…), lanes: [{ path, x, y, vx, vy, progress, range,
 *             maxHeight, apexX, h0, angle, rangeText, heightText, landed }] }  (metres, degrees)
 *
 * One scale for both axes (simMath.projectileLayout), so the path keeps its true shape and
 * the distance board reads true metres. The field mows its stripes on the same marks. The ball
 * and the tee are not to scale; that is the stylised part. Scenario A runs in the back lane
 * with a dashed trail, B in the front lane with a solid one, the 2D scene's convention.
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { arcAt, arcFractions, niceCeil } from './simMath.js'
import { canvasTexture, createArrow, createBin, createLabel, createPictureCard, mulberry32, shadowOnlyMaterial, SIM_PALETTE, woodTexture } from './kit.js'

const FIELD = { from: -1.05, to: 5.75, length: 5.2 } // scene units; the launch point is x = 0
const GROUND = 0.07 // the field slab's top: the model's y = 0
const BALL = 0.075
const TRAIL_SEGMENTS = 180
const TRAIL_RADIAL = 8
const DOT_GAP = 0.13

export const PROJECTILE_FRAME = {
  width: 7.1,
  height: 3.3,
  target: { x: 2.3, y: 1.15, z: 0 },
  view: { azimuth: -0.38, elevation: 0.36 },
  // a phone's squarer frame: look down the field so it recedes instead of shrinking to a strip
  narrowView: { azimuth: -0.72, elevation: 0.34, below: 1.5 },
}

function laneZ(index, lanes) {
  return lanes === 2 ? (index === 0 ? -0.42 : 0.42) : 0
}

/** Mown stripes on the distance marks, a painted line at each mark and the launch line. */
function drawField(ctx, w, h, { layout, palette, seed = 5 }) {
  const rand = mulberry32(seed)
  const toPx = (sx) => ((sx - FIELD.from) / (FIELD.to - FIELD.from)) * w
  ctx.fillStyle = palette.hill1
  ctx.fillRect(0, 0, w, h)
  if (layout) {
    const s = layout.scale
    layout.ticks.forEach((m, i) => {
      const x0 = toPx(m * s)
      const x1 = toPx(Math.min(m + layout.step, layout.metres) * s)
      if (i % 2 === 0) {
        ctx.fillStyle = palette.hill2
        ctx.fillRect(x0, 0, x1 - x0, h)
        ctx.globalAlpha = 0.16
        ctx.fillStyle = palette.leaf
        ctx.fillRect(x0, 0, x1 - x0, h)
        ctx.globalAlpha = 1
      }
    })
    ctx.fillStyle = 'rgba(255, 253, 245, 0.9)'
    for (const m of layout.ticks) ctx.fillRect(toPx(m * s) - 1.5, 0, 3, h)
  }
  // grass speckle: light and dark, seeded, never over 0.08
  for (let i = 0; i < 2600; i += 1) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255, 255, 240, 0.08)' : 'rgba(40, 70, 30, 0.07)'
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 3)
  }
}

/** The distance board along the front edge: a tick every fifth of a mark; the numbers are labels. */
function drawBoard(ctx, w, h, { layout, palette, boardFrom, boardTo }) {
  ctx.fillStyle = palette.card
  ctx.fillRect(0, 0, w, h)
  if (!layout) return
  const toPx = (sx) => ((sx - boardFrom) / (boardTo - boardFrom)) * w
  const s = layout.scale
  ctx.strokeStyle = palette.ink
  ctx.fillStyle = palette.ink
  ctx.textBaseline = 'middle'
  const minor = layout.step / 5
  for (let m = 0; m <= layout.metres + 1e-9; m += minor) {
    const x = toPx(m * s)
    const major = Math.abs(m / layout.step - Math.round(m / layout.step)) < 1e-6
    ctx.lineWidth = major ? 5 : 2.5
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, major ? h * 0.62 : h * 0.3)
    ctx.stroke()
  }
}

export function createProjectileField({ lanes = 1, colors, dashed, images = null, tags = null, palette = SIM_PALETTE, formatMetres = (m, bare) => (bare ? String(m) : `${m} m`), onChange } = {}) {
  const bin = createBin()
  const keep = bin.keep
  const group = new THREE.Group()
  group.name = 'projectile-field'
  const count = lanes === 2 ? 2 : 1
  const laneColors = colors || (count === 2 ? [palette.coralDeep, palette.blue] : [palette.blue])
  const laneDashed = dashed || (count === 2 ? [true, false] : [false])
  const depth = count === 2 ? 1.9 : 1.4

  // ------------------------------------------------------------------ the field: a sod slab, grass on top
  const slab = new THREE.Mesh(
    keep(new RoundedBoxGeometry(FIELD.to - FIELD.from, GROUND, depth, 3, 0.025)),
    keep(new THREE.MeshStandardMaterial({ color: palette.kraftDeep, roughness: 0.95 })),
  )
  slab.position.set((FIELD.from + FIELD.to) / 2, GROUND / 2, 0)
  slab.receiveShadow = true
  slab.castShadow = true
  group.add(slab)
  const grassCanvasW = 2048
  const grassCanvasH = 256
  let grassTex = null
  const grassMat = keep(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92 }))
  const grass = new THREE.Mesh(keep(new THREE.PlaneGeometry(FIELD.to - FIELD.from - 0.04, depth - 0.04)), grassMat)
  grass.rotation.x = -Math.PI / 2
  grass.position.set((FIELD.from + FIELD.to) / 2, GROUND + 0.0015, 0)
  grass.receiveShadow = true
  group.add(grass)

  // ------------------------------------------------------------------ the distance board along the front edge
  const boardFrom = -0.12
  const boardTo = FIELD.length + 0.32
  const boardLen = boardTo - boardFrom
  const board = new THREE.Group()
  const boardBody = new THREE.Mesh(keep(new RoundedBoxGeometry(boardLen + 0.06, 0.2, 0.05, 2, 0.012)), keep(new THREE.MeshStandardMaterial({ color: '#ffffff', map: keep(woodTexture(palette, 23)), roughness: 0.8 })))
  boardBody.castShadow = true
  boardBody.receiveShadow = true
  board.add(boardBody)
  let boardTex = null
  const boardMat = keep(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }))
  const boardFace = new THREE.Mesh(keep(new THREE.PlaneGeometry(boardLen, 0.16)), boardMat)
  boardFace.position.z = 0.0262
  board.add(boardFace)
  board.position.set(boardFrom + boardLen / 2, GROUND + 0.1, depth / 2 + 0.05)
  board.rotation.x = -0.32
  group.add(board)

  // ------------------------------------------------------------------ per lane: stand, tee, protractor, aim, ball, trail, dots, landing
  const woodMat = keep(new THREE.MeshStandardMaterial({ color: '#ffffff', map: keep(woodTexture(palette, 61)), roughness: 0.78 }))
  const inkMat = keep(new THREE.MeshStandardMaterial({ color: palette.ink2, roughness: 0.55 }))
  const teeGeo = keep(
    new THREE.LatheGeometry(
      [
        [0.0, 0],
        [0.034, 0],
        [0.03, 0.008],
        [0.012, 0.02],
        [0.011, 0.045],
        [0.03, 0.062],
        [0.032, 0.066],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      24,
    ),
  )
  const protractorTex = keep(
    canvasTexture(512, 256, (ctx, w, h) => {
      ctx.fillStyle = palette.card
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = palette.ink
      ctx.fillStyle = palette.ink
      const cx = w / 2
      const cy = h - 2
      const R = h - 6
      for (let d = 0; d <= 180; d += 5) {
        const a = (d * Math.PI) / 180
        const long = d % 30 === 0
        ctx.lineWidth = long ? 4 : 2
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * R, cy - Math.sin(a) * R)
        ctx.lineTo(cx + Math.cos(a) * (R - (long ? 34 : 16)), cy - Math.sin(a) * (R - (long ? 34 : 16)))
        ctx.stroke()
      }
      ctx.font = '600 30px "Lexend Variable", "Lexend", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (const d of [0, 30, 60, 90]) {
        const a = (d * Math.PI) / 180
        ctx.fillText(`${d}°`, cx + Math.cos(a) * (R - 62), cy - Math.sin(a) * (R - 62) - (d === 0 ? 14 : 0))
      }
    }),
  )
  const protractorGeo = keep(new THREE.CircleGeometry(0.4, 48, 0, Math.PI))
  // map the half disc onto the half-canvas texture
  {
    const pos = protractorGeo.attributes.position
    const uv = protractorGeo.attributes.uv
    for (let i = 0; i < pos.count; i += 1) uv.setXY(i, 0.5 + pos.getX(i) / 0.8, pos.getY(i) / 0.4)
  }
  const protractorMat = keep(new THREE.MeshStandardMaterial({ color: '#ffffff', map: protractorTex, roughness: 0.6, transparent: true, opacity: 0.92, side: THREE.DoubleSide }))
  const ballGeo = keep(new THREE.SphereGeometry(BALL, 32, 22))
  const dotGeo = keep(new THREE.SphereGeometry(0.02, 10, 8))
  const ringGeo = keep(new THREE.RingGeometry(0.075, 0.115, 40))
  ringGeo.rotateX(-Math.PI / 2)
  const dashTex = keep(
    canvasTexture(64, 4, (ctx, w, h) => {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w * 0.58, h)
      ctx.fillStyle = '#000000'
      ctx.fillRect(w * 0.58, 0, w * 0.42, h)
    }),
  )
  dashTex.wrapS = THREE.RepeatWrapping
  dashTex.colorSpace = THREE.NoColorSpace
  const guideMat = keep(new THREE.LineDashedMaterial({ color: palette.ink, dashSize: 0.04, gapSize: 0.05, transparent: true, opacity: 0.5 }))
  const hidden = keep(shadowOnlyMaterial())

  const laneParts = Array.from({ length: count }, (_, i) => {
    const z = laneZ(i, count)
    const color = laneColors[i % laneColors.length]
    const root = new THREE.Group()
    root.position.z = z
    group.add(root)

    const stand = new THREE.Mesh(keep(new RoundedBoxGeometry(0.34, 1, 0.3, 2, 0.02)), woodMat)
    stand.castShadow = true
    stand.receiveShadow = true
    stand.visible = false
    root.add(stand)
    const tee = new THREE.Mesh(teeGeo, inkMat)
    tee.castShadow = true
    root.add(tee)
    const protractor = new THREE.Mesh(protractorGeo, protractorMat)
    protractor.position.z = -0.07
    protractor.receiveShadow = true
    // two lanes: one protractor (the front lane's) is enough, the back one would only cover it
    protractor.visible = !(count === 2 && i === 0)
    root.add(protractor)
    const tag = tags?.[i] ? createLabel(tags[i], { height: 0.085, weight: 700, pill: { fill: palette.card, stroke: color, line: 9 } }) : null
    if (tag) root.add(tag.sprite)
    const aim = createArrow({ color: palette.ink, radius: 0.01, head: 0.07, bin })
    root.add(aim.group)
    aim.setLength(0.52)

    const ballMat = keep(new THREE.MeshStandardMaterial({ color, roughness: 0.36, metalness: 0.04 }))
    const ball = new THREE.Mesh(ballGeo, ballMat)
    ball.castShadow = true
    root.add(ball)
    const velocity = createArrow({ color: palette.ink, radius: 0.008, head: 0.055, bin })
    root.add(velocity.group)

    const trailMat = keep(
      new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...(laneDashed[i] ? { alphaMap: dashTex.clone(), alphaTest: 0.5 } : {}) }),
    )
    if (trailMat.alphaMap) {
      keep(trailMat.alphaMap)
      trailMat.alphaMap.wrapS = THREE.RepeatWrapping
    }
    const trail = new THREE.Mesh(new THREE.BufferGeometry(), trailMat)
    trail.castShadow = true
    root.add(trail)
    const dotMat = keep(new THREE.MeshStandardMaterial({ color, roughness: 0.6, transparent: true, opacity: 0.7 }))
    const dots = new THREE.InstancedMesh(dotGeo, dotMat, 160)
    dots.count = 0
    root.add(dots)
    const ring = new THREE.Mesh(ringGeo, keep(new THREE.MeshStandardMaterial({ color, roughness: 0.6 })))
    ring.receiveShadow = true
    root.add(ring)
    const rangeLabel = createLabel('', { height: 0.1, color: palette.ink })
    root.add(rangeLabel.sprite)
    const apexLine = new THREE.Line(new THREE.BufferGeometry(), guideMat)
    root.add(apexLine)
    const apexLabel = createLabel('', { height: 0.09, color: palette.ink, align: 'left' })
    root.add(apexLabel.sprite)
    return { root, z, stand, tee, protractor, tag, aim, ball, ballMat, velocity, trail, dots, ring, rangeLabel, apexLine, apexLabel, key: null, fractions: null, card: null }
  })

  // ------------------------------------------------------------------ the cut-out from the photo as the ball
  function setImages(urls) {
    laneParts.forEach((lane, i) => {
      lane.card?.dispose()
      lane.card?.sprite.removeFromParent()
      lane.card = null
      lane.ball.material = lane.ballMat
      const url = Array.isArray(urls) ? urls[i] : urls
      if (!url) return
      lane.card = createPictureCard(url, {
        size: BALL * 3.2,
        onLoad: () => {
          lane.ball.material = hidden
          onChange?.()
        },
        onError: () => {
          lane.ball.material = lane.ballMat
          onChange?.()
        },
      })
      lane.root.add(lane.card.sprite)
    })
  }
  if (images) setImages(images)

  // ------------------------------------------------------------------ layout: textures follow the marks
  let layoutKey = ''
  let marks = []
  let pixelUnit = 0
  function applyLayout(layout) {
    const key = `${layout.scale}|${layout.step}|${layout.metres}`
    if (key === layoutKey) return
    layoutKey = key
    if (grassTex) bin.drop(grassTex)
    grassTex = keep(canvasTexture(grassCanvasW, grassCanvasH, (ctx, w, h) => drawField(ctx, w, h, { layout, palette })))
    grassMat.map = grassTex
    grassMat.needsUpdate = true
    if (boardTex) bin.drop(boardTex)
    boardTex = keep(canvasTexture(2048, 96, (ctx, w, h) => drawBoard(ctx, w, h, { layout, palette, boardFrom, boardTo })))
    boardMat.map = boardTex
    boardMat.needsUpdate = true
    // a number under every mark, the last one with its unit
    marks.forEach((label) => {
      label.sprite.removeFromParent()
      label.dispose()
    })
    marks = layout.ticks.map((m, i) => {
      const label = createLabel(i === layout.ticks.length - 1 ? formatMetres(m) : formatMetres(m, true), { height: 0.11, minPx: 12, color: palette.ink })
      label.sprite.position.set(m * layout.scale, GROUND + 0.035, depth / 2 + 0.16)
      label.setPixelUnit(pixelUnit)
      group.add(label.sprite)
      return label
    })
    laneParts.forEach((lane) => {
      lane.key = null
    })
  }

  function buildPath(lane, data, s) {
    const lift = BALL
    const pts = (data.path || []).map(([x, y]) => new THREE.Vector3(x * s, GROUND + lift + y * s, 0))
    lane.trail.geometry.dispose()
    if (pts.length < 2) {
      lane.trail.geometry = new THREE.BufferGeometry()
      lane.dots.count = 0
      lane.fractions = null
      return
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
    lane.trail.geometry = new THREE.TubeGeometry(curve, TRAIL_SEGMENTS, 0.017, TRAIL_RADIAL, false)
    lane.fractions = arcFractions(data.path.map(([x, y]) => [x * s, y * s]))
    const total = curve.getLength()
    if (lane.trail.material.alphaMap) lane.trail.material.alphaMap.repeat.set(Math.max(1, Math.round(total / 0.13)), 1)
    // the whole path ahead, dotted
    const n = Math.min(160, Math.max(2, Math.floor(total / DOT_GAP)))
    const m = new THREE.Matrix4()
    for (let k = 0; k <= n && k < 160; k += 1) {
      const p = curve.getPointAt(k / n)
      m.makeTranslation(p.x, p.y, p.z)
      lane.dots.setMatrixAt(k, m)
    }
    lane.dots.count = Math.min(160, n + 1)
    lane.dots.instanceMatrix.needsUpdate = true
    // the stand under a raised launch, the tee on top, the protractor and the aim at the angle
    const h = Math.max(0, data.h0 || 0) * s
    lane.stand.visible = h > 0.01
    lane.stand.scale.y = Math.max(0.01, h)
    lane.stand.position.set(-0.02, GROUND + h / 2, 0)
    lane.tee.position.set(0, GROUND + h, 0)
    const a = ((data.angle || 0) * Math.PI) / 180
    lane.protractor.position.set(0, GROUND + h + BALL, -0.07)
    lane.aim.group.position.set(0, GROUND + h + BALL, 0)
    lane.aim.group.rotation.z = a - Math.PI / 2
    lane.tag?.sprite.position.set(-0.3, GROUND + h + BALL + 0.3, 0)
    // the landing ring and its distance, the apex guide
    const rx = (data.range || 0) * s
    lane.ring.position.set(rx, GROUND + 0.004, 0)
    lane.rangeLabel.setText(data.rangeText || '')
    lane.rangeLabel.sprite.position.set(rx, GROUND + 0.2, 0.12)
    const top = (data.maxHeight || 0) * s
    const ax = (data.apexX || 0) * s
    const showApex = Boolean(data.heightText) && top > h + 0.02
    lane.apexLine.visible = showApex
    lane.apexLabel.sprite.visible = showApex
    if (showApex) {
      lane.apexLine.geometry.dispose()
      lane.apexLine.geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ax, GROUND + 0.004, 0), new THREE.Vector3(ax, GROUND + top + BALL, 0)])
      lane.apexLine.computeLineDistances()
      lane.apexLabel.setText(data.heightText)
      lane.apexLabel.sprite.position.set(ax + 0.08, GROUND + top + BALL + 0.16, 0)
    }
  }

  function update(state) {
    if (!state?.layout) return
    applyLayout(state.layout)
    const s = state.layout.scale
    const lanesData = state.lanes || []
    laneParts.forEach((lane, i) => {
      const data = lanesData[i]
      lane.root.visible = Boolean(data)
      if (!data) return
      const key = `${s}|${data.range}|${data.maxHeight}|${data.h0}|${data.angle}|${data.path?.length}|${data.rangeText}|${data.heightText}`
      if (key !== lane.key) {
        lane.key = key
        buildPath(lane, data, s)
      }
      // the moving part: the ball, its trail so far, its velocity
      const bx = (data.x || 0) * s
      const by = GROUND + BALL + (data.y || 0) * s
      lane.ball.position.set(bx, by, 0)
      if (lane.card) lane.card.sprite.position.set(bx, by, 0.02)
      const reached = lane.fractions ? arcAt(lane.fractions, data.progress || 0) : 0
      const segs = Math.round(reached * TRAIL_SEGMENTS)
      lane.trail.geometry.setDrawRange(0, segs * TRAIL_RADIAL * 6)
      lane.trail.visible = segs > 0
      const speed = Math.hypot(data.vx || 0, data.vy || 0)
      const flying = speed > 0 && !data.landed && (data.progress || 0) > 0
      lane.velocity.group.visible = flying
      if (flying) {
        lane.velocity.group.position.set(bx, by, 0)
        lane.velocity.group.rotation.z = Math.atan2(data.vy, data.vx) - Math.PI / 2
        lane.velocity.setLength(Math.min(0.62, 0.16 + speed * 0.018))
      }
    })
    // two landing marks too close to read: keep B's, like the 2D scene
    if (count === 2 && lanesData[0] && lanesData[1]) {
      const close = Math.abs((lanesData[0].range || 0) - (lanesData[1].range || 0)) * s < 0.55
      laneParts[0].rangeLabel.sprite.visible = !close
    }
  }

  /**
   * What the camera must show: the field, the board, and the highest throw with its label. The
   * height steps with round metres, so dragging a slider does not zoom the view on every move.
   */
  function box(state) {
    const s = state?.layout?.scale || 1
    let top = 0.7
    for (const lane of state?.lanes || []) {
      const peak = niceCeil(Math.max(0.1, lane.maxHeight || 0) * 1.05) * s
      top = Math.max(top, GROUND + BALL + peak + 0.24, GROUND + (lane.h0 || 0) * s + BALL + 0.46)
    }
    return { min: [-0.62, 0, -depth / 2], max: [FIELD.to, top, depth / 2 + 0.28], margin: { top: 0.14 } }
  }

  function setPixelUnit(u) {
    pixelUnit = u
    marks.forEach((label) => label.setPixelUnit(u))
    laneParts.forEach((lane) => {
      lane.rangeLabel.setPixelUnit(u)
      lane.apexLabel.setPixelUnit(u)
      lane.tag?.setPixelUnit(u)
    })
  }

  return {
    group,
    frame: PROJECTILE_FRAME,
    update,
    box,
    setImages,
    setPixelUnit,
    dispose() {
      marks.forEach((label) => label.dispose())
      laneParts.forEach((lane) => {
        lane.trail.geometry.dispose()
        lane.apexLine.geometry.dispose()
        lane.rangeLabel.dispose()
        lane.apexLabel.dispose()
        lane.tag?.dispose()
        lane.card?.dispose()
        lane.dots.dispose()
      })
      bin.dispose()
    },
  }
}
