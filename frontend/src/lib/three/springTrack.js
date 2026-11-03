/**
 * Procedural Three.js model of a mass on a spring on a low-friction track (img2threejs method:
 * bevelled boxes, a helix tube rebuilt in place, a generated ruler and wood, seeded noise).
 *
 *   createSpringTrack({ lanes, colors, maxAmp, images, palette, formatMetres, labels, onChange })
 *     → { group, frame, update({ lanes: [{ x, massText }] }), dispose() }
 *
 * The spring is a round wire wound along a helix (simMath.fillHelixTube): when the mass moves,
 * the same coils stretch or squeeze, only the pitch changes. Displacement is magnified so a swing
 * of a few centimetres is still seen, and the ruler under the mass reads true metres from the
 * rest position (simMath.springLayout). The spring's own length and the block's size are not a
 * model quantity; that is the stylised part. Scenario A runs in the back lane, B in front.
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { fillHelixTube, helixTubeIndex, helixTubeSize, springLayout, springLength } from './simMath.js'
import { canvasTexture, createBin, createLabel, createPictureCard, shadowOnlyMaterial, SIM_PALETTE, speckleTexture, woodTexture } from './kit.js'

const WALL_X = -0.95
const REST = 1.0 // spring length at the rest position, scene units
const BLOCK = 0.24
const RAIL_Y = 0.13 // top of the rail
const GAP = 0.012 // the hook between the spring's end and the block
const COILS = 13
const SEGMENTS = COILS * 18
const RADIAL = 7

export const SPRING_FRAME = {
  width: 2.85,
  height: 1.25,
  target: { x: 0.28, y: 0.26, z: 0 },
  view: { azimuth: 0.36, elevation: 0.34 },
  // a phone's squarer frame: look along the track so it fills the box
  narrowView: { azimuth: 0.78, elevation: 0.4, below: 1.5 },
}

function laneZ(index, lanes) {
  return lanes === 2 ? (index === 0 ? -0.26 : 0.26) : 0
}

export function createSpringTrack({ lanes = 1, colors, maxAmp = 0.1, images = null, tags = null, palette = SIM_PALETTE, formatMetres = (m) => `${m} m`, labels = {}, onChange } = {}) {
  const bin = createBin()
  const keep = bin.keep
  const group = new THREE.Group()
  group.name = 'spring-track'
  const count = lanes === 2 ? 2 : 1
  const laneColors = colors || (count === 2 ? [palette.coralDeep, palette.blue] : [palette.blue])
  const layout = springLayout(maxAmp)
  const eqX = WALL_X + REST + GAP + BLOCK / 2 // centre of the block at rest
  const depth = count === 2 ? 0.98 : 0.58
  const endX = eqX + layout.half * layout.scale + BLOCK / 2 + 0.22

  // ------------------------------------------------------------------ base board and the wall it is screwed to
  const woodMat = keep(new THREE.MeshStandardMaterial({ color: '#ffffff', map: keep(woodTexture(palette, 17)), roughness: 0.8 }))
  const baseLen = endX - (WALL_X - 0.2)
  const base = new THREE.Mesh(keep(new RoundedBoxGeometry(baseLen, 0.06, depth, 3, 0.02)), woodMat)
  base.position.set(WALL_X - 0.2 + baseLen / 2, 0.03, 0)
  base.castShadow = true
  base.receiveShadow = true
  group.add(base)
  const wall = new THREE.Mesh(keep(new RoundedBoxGeometry(0.16, 0.5, depth - 0.04, 3, 0.025)), woodMat)
  wall.position.set(WALL_X - 0.1, 0.06 + 0.25, 0)
  wall.castShadow = true
  wall.receiveShadow = true
  group.add(wall)
  const clampMat = keep(new THREE.MeshStandardMaterial({ color: palette.pear, roughness: 0.62 }))
  const steelMat = keep(new THREE.MeshStandardMaterial({ color: palette.steel, roughness: 0.32, metalness: 0.35 }))
  const railMat = keep(new THREE.MeshStandardMaterial({ color: '#ffffff', map: keep(speckleTexture(palette.paper3, 9)), roughness: 0.42, metalness: 0.25 }))

  // ------------------------------------------------------------------ the ruler: on each rail's front face, zero at the rest position,
  // right under the block so it reads without parallax; numbers under the front rail
  const rulerFrom = eqX - layout.half * layout.scale - 0.06
  const rulerTo = eqX + layout.half * layout.scale + 0.06
  const rulerLen = rulerTo - rulerFrom
  const rulerTex = keep(
    canvasTexture(1024, 64, (ctx, w, h) => {
      ctx.fillStyle = palette.card
      ctx.fillRect(0, 0, w, h)
      const toPx = (m) => ((eqX + m * layout.scale - rulerFrom) / rulerLen) * w
      ctx.strokeStyle = palette.ink
      const minor = layout.step / 5
      for (let m = -layout.half; m <= layout.half + 1e-9; m += minor) {
        const major = Math.abs(m / layout.step - Math.round(m / layout.step)) < 1e-6
        const zero = Math.abs(m) < 1e-9
        ctx.lineWidth = zero ? 7 : major ? 4 : 2
        ctx.beginPath()
        ctx.moveTo(toPx(m), 0)
        ctx.lineTo(toPx(m), zero ? h : major ? h * 0.7 : h * 0.38)
        ctx.stroke()
      }
    }),
  )
  const rulerGeo = keep(new THREE.PlaneGeometry(rulerLen, RAIL_Y - 0.06 - 0.026))
  const rulerMat = keep(new THREE.MeshStandardMaterial({ color: '#ffffff', map: rulerTex, roughness: 0.85 }))
  const frontZ = laneZ(count - 1, count)
  const marks = layout.ticks.map((m, i) => {
    const label = createLabel(i === layout.ticks.length - 1 ? formatMetres(m) : formatMetres(m, true), { height: 0.05, minPx: 12, color: palette.ink })
    label.sprite.position.set(eqX + m * layout.scale, 0.075, frontZ + 0.13)
    group.add(label.sprite)
    return label
  })

  // ------------------------------------------------------------------ the rest position: a line across the board, a post and its name
  const eqMat = keep(new THREE.MeshStandardMaterial({ color: palette.ink, roughness: 0.6 }))
  const eqLine = new THREE.Mesh(keep(new THREE.BoxGeometry(0.008, 0.004, depth - 0.1)), eqMat)
  eqLine.position.set(eqX, 0.062, 0)
  group.add(eqLine)
  const postZ = laneZ(0, count) - 0.1
  const eqPost = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.006, 0.006, 0.44, 8)), eqMat)
  eqPost.position.set(eqX, 0.06 + 0.22, postZ)
  eqPost.castShadow = true
  group.add(eqPost)
  const eqLabel = createLabel(labels.equilibrium || '', { height: 0.06, color: palette.ink })
  eqLabel.sprite.position.set(eqX, 0.06 + 0.5, postZ)
  group.add(eqLabel.sprite)

  // ------------------------------------------------------------------ lanes: rail, spring, block
  const index = new THREE.BufferAttribute(helixTubeIndex(SEGMENTS, RADIAL), 1)
  const blockGeo = keep(new RoundedBoxGeometry(BLOCK, BLOCK * 0.82, BLOCK * 0.9, 4, 0.03))
  const plateGeo = keep(new THREE.CylinderGeometry(0.07, 0.07, 0.016, 24))
  plateGeo.rotateZ(Math.PI / 2)
  const hidden = keep(shadowOnlyMaterial())
  const springMat = keep(new THREE.MeshStandardMaterial({ color: palette.steel, roughness: 0.28, metalness: 0.35 }))

  const parts = Array.from({ length: count }, (_, i) => {
    const z = laneZ(i, count)
    const root = new THREE.Group()
    root.position.z = z
    group.add(root)
    const railLen = endX - WALL_X - 0.06
    const rail = new THREE.Mesh(keep(new RoundedBoxGeometry(railLen, RAIL_Y - 0.06, 0.12, 2, 0.012)), railMat)
    rail.position.set(WALL_X + railLen / 2, 0.06 + (RAIL_Y - 0.06) / 2, 0)
    rail.castShadow = true
    rail.receiveShadow = true
    root.add(rail)
    const ruler = new THREE.Mesh(rulerGeo, rulerMat)
    ruler.position.set(rulerFrom + rulerLen / 2, 0.06 + (RAIL_Y - 0.06) / 2, 0.0605)
    ruler.receiveShadow = true
    root.add(ruler)
    const axisY = RAIL_Y + (BLOCK * 0.82) / 2
    const wallPlate = new THREE.Mesh(plateGeo, clampMat)
    wallPlate.position.set(WALL_X - 0.01, axisY, 0)
    wallPlate.castShadow = true
    root.add(wallPlate)

    // the spring: a helix tube whose vertices are rewritten when the mass moves
    const size = helixTubeSize(SEGMENTS, RADIAL)
    const geometry = new THREE.BufferGeometry()
    const positions = new THREE.BufferAttribute(new Float32Array(size * 3), 3)
    const normals = new THREE.BufferAttribute(new Float32Array(size * 3), 3)
    positions.setUsage(THREE.DynamicDrawUsage)
    normals.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', positions)
    geometry.setAttribute('normal', normals)
    geometry.setIndex(index)
    keep(geometry)
    const spring = new THREE.Mesh(geometry, springMat)
    spring.castShadow = true
    spring.position.set(WALL_X, axisY, 0)
    root.add(spring)

    const color = laneColors[i % laneColors.length]
    const blockMat = keep(new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.06 }))
    const block = new THREE.Mesh(blockGeo, blockMat)
    block.castShadow = true
    block.receiveShadow = true
    root.add(block)
    const hook = new THREE.Mesh(plateGeo, steelMat)
    hook.scale.set(1, 0.55, 0.55)
    root.add(hook)
    // the mass, written over the block it names
    const massLabel = createLabel('', { height: 0.05, minPx: 11, color: palette.ink, halo: palette.paper })
    root.add(massLabel.sprite)
    // which scenario runs on this rail, on top of the wall
    const tag = tags?.[i] ? createLabel(tags[i], { height: 0.06, weight: 700, pill: { fill: palette.card, stroke: color, line: 9 } }) : null
    if (tag) {
      tag.sprite.position.set(WALL_X - 0.1, 0.06 + 0.5 + 0.07, 0)
      root.add(tag.sprite)
    }
    return { root, spring, positions, normals, geometry, block, blockMat, hook, massLabel, tag, axisY, length: -1, card: null }
  })

  function setSpring(part, length) {
    if (Math.abs(length - part.length) < 1e-5) return
    part.length = length
    fillHelixTube(part.positions.array, part.normals.array, { length, radius: 0.052, coils: COILS, wire: 0.0075, segments: SEGMENTS, radial: RADIAL })
    part.positions.needsUpdate = true
    part.normals.needsUpdate = true
    part.geometry.computeBoundingSphere()
  }

  function setImages(urls) {
    parts.forEach((part, i) => {
      part.card?.dispose()
      part.card?.sprite.removeFromParent()
      part.card = null
      part.block.material = part.blockMat
      const url = Array.isArray(urls) ? urls[i] : urls
      if (!url) return
      part.card = createPictureCard(url, {
        size: BLOCK * 1.35,
        onLoad: () => {
          part.block.material = hidden
          onChange?.()
        },
        onError: () => {
          part.block.material = part.blockMat
          onChange?.()
        },
      })
      part.root.add(part.card.sprite)
    })
  }
  if (images) setImages(images)

  function update(state) {
    const data = state?.lanes || []
    parts.forEach((part, i) => {
      const lane = data[i]
      part.root.visible = Boolean(lane)
      if (!lane) return
      const length = springLength(lane.x, layout, REST)
      setSpring(part, length)
      const cx = WALL_X + length + GAP + BLOCK / 2
      part.block.position.set(cx, part.axisY, 0)
      part.hook.position.set(cx - BLOCK / 2 - 0.004, part.axisY, 0)
      if (part.card) part.card.sprite.position.set(cx, part.axisY + 0.02, 0.03)
      part.massLabel.setText(lane.massText || '')
      part.massLabel.sprite.position.set(cx, part.axisY + (BLOCK * 0.82) / 2 + 0.06, 0)
    })
  }

  /** What the camera must show: the whole board, the wall and the rest-position label. */
  const frameBox = { min: [WALL_X - 0.22, 0, -depth / 2], max: [endX, 0.64, depth / 2 + 0.06], margin: { top: 0.14 } }

  function setPixelUnit(u) {
    marks.forEach((label) => label.setPixelUnit(u))
    eqLabel.setPixelUnit(u)
    parts.forEach((part) => {
      part.massLabel.setPixelUnit(u)
      part.tag?.setPixelUnit(u)
    })
  }

  return {
    group,
    frame: SPRING_FRAME,
    layout,
    box: () => frameBox,
    update,
    setImages,
    setPixelUnit,
    dispose() {
      marks.forEach((label) => label.dispose())
      parts.forEach((part) => {
        part.massLabel.dispose()
        part.tag?.dispose()
        part.card?.dispose()
      })
      eqLabel.dispose()
      bin.dispose()
    },
  }
}
