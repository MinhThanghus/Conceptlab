/**
 * The 3D labs' studio: one Three.js stage for every scene. Renderer, camera, a studio rig lit
 * from the top left (DESIGN.md), a soft environment for metal and glass, a shadow catcher and a
 * contact shadow at the model's base, render-on-demand, resize, and a gentle drag-to-turn on fine
 * pointers. The canvas is transparent: the page's paper (styles/stage3d.css) shows through it.
 *
 * Framing: by default `height` scene units stay in view vertically and `width` across (the
 * pendulum stand's 0.62 × height), aimed at `target`. `fit` ({ min, max } corners, `margin` in view
 * fractions { x, top, bottom }) or `setFit(box)` frames a box instead, and `frame(object)` frames
 * the model itself: it measures the visible meshes (skipping anything tagged `userData.noFit`:
 * labels, the sun, glows, markers), fills `fill` of the view's limiting dimension, centres the
 * silhouette in the frame, and moves the floor, the contact shadow and the key light's shadow box to
 * the model. `narrowView` ({ azimuth, elevation, below }) turns a long scene to recede into depth
 * when the frame's aspect drops under `below` (a phone). `catcher: 0` drops the floor shadow and
 * `contact: false` the contact shadow (a globe in space). Lights and floor live in `scene`, never in
 * `world`: the scenes index `world.children`.
 */
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { lowPowerDevice } from './capability.js'

export const clampStageZoom = (value) => Math.min(3.5, Math.max(.75, Number.isFinite(value) ? value : 1))

/**
 * The studio rig. Directions point from the subject to the light: the key from the top left and a
 * little in front, a cool fill from the right, a rim from behind so silhouettes never melt into the
 * paper. A warm, darker ground colour on the hemisphere gives forms an underside.
 */
export const STUDIO = {
  exposure: 1,
  // without the room light (low-power devices) the hemisphere carries the ambient alone
  hemi: { sky: '#fff8ec', ground: '#a3916f', intensity: 0.62, lowPower: 1.3 },
  key: { color: '#fff1d9', intensity: 2.8, dir: [-0.42, 0.88, 0.34] },
  fill: { color: '#e6eeff', intensity: 0.3, dir: [0.8, 0.3, 0.55] },
  rim: { color: '#fff6ea', intensity: 1.1, dir: [0.35, 0.55, -0.8] },
  env: 0.38,
  catcher: { color: '#3a2e14', opacity: 0.14 },
  contact: { color: '#2b2416', opacity: 0.3 },
}

const KEY = new THREE.Vector3(...STUDIO.key.dir).normalize()
const FILL = new THREE.Vector3(...STUDIO.fill.dir).normalize()
const RIM = new THREE.Vector3(...STUDIO.rim.dir).normalize()

/** A soft round falloff (white middle, black edge) for the contact shadow's alpha. */
function blobTexture() {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx?.createRadialGradient) return null
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, 128, 128)
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.3, '#c4c4c4')
  g.addColorStop(0.58, '#5a5a5a')
  g.addColorStop(0.82, '#171717')
  g.addColorStop(1, '#000000')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.NoColorSpace
  return texture
}

const UNIT_BOX = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]]
function boxCorners(min, max, matrix) {
  return UNIT_BOX.map(([a, b, c]) => {
    const p = new THREE.Vector3(a ? max.x : min.x, b ? max.y : min.y, c ? max.z : min.z)
    return matrix ? p.applyMatrix4(matrix) : p
  })
}

const visibleMaterial = (material) => (Array.isArray(material) ? material : [material]).some((m) => m && m.visible !== false)

/**
 * World-space boxes and spheres of the visible meshes under `object` (the silhouette the camera
 * fits), skipping subtrees tagged `userData.noFit`; lines, points and plain sprites never count.
 * `box` collects the meshes only: the floor and the light follow the model, not its labels.
 */
function measure(object, items, box) {
  if (!object.visible || object.userData?.noFit) return
  // a label that asks to be kept in view (kit.createChip): its card, as big as it is drawn now
  if (object.isSprite) {
    if (object.userData?.fit) {
      const center = new THREE.Vector3().setFromMatrixPosition(object.matrixWorld)
      const half = new THREE.Vector3(Math.abs(object.scale.x) / 2, Math.abs(object.scale.y) / 2, Math.abs(object.scale.x) / 4)
      items.push({ corners: boxCorners(center.clone().sub(half), center.clone().add(half)), center: null, radius: 0 })
    }
    return
  }
  if (object.isMesh && visibleMaterial(object.material)) {
    let localBox = null
    let localSphere = null
    if (object.isInstancedMesh) {
      if (object.count > 0) {
        object.computeBoundingBox()
        object.computeBoundingSphere()
        localBox = object.boundingBox
        localSphere = object.boundingSphere
      }
    } else if (object.geometry?.attributes?.position) {
      const geometry = object.geometry
      if (!geometry.boundingBox) geometry.computeBoundingBox()
      if (!geometry.boundingSphere) geometry.computeBoundingSphere()
      localBox = geometry.boundingBox
      localSphere = geometry.boundingSphere
    }
    if (localBox && !localBox.isEmpty() && Number.isFinite(localBox.min.x) && Number.isFinite(localBox.max.x)) {
      const corners = boxCorners(localBox.min, localBox.max, object.matrixWorld)
      corners.forEach((c) => box.expandByPoint(c))
      const center = localSphere ? localSphere.center.clone().applyMatrix4(object.matrixWorld) : null
      const radius = localSphere && Number.isFinite(localSphere.radius) ? localSphere.radius * object.matrixWorld.getMaxScaleOnAxis() : 0
      items.push({ corners, center, radius })
    }
  }
  for (const child of object.children) measure(child, items, box)
}

/** Opaque, lit meshes cast (and receive) shadows; `userData.noShadow` and noFit parts opt out. */
function castShadows(object) {
  if (object.userData?.noFit || object.userData?.noShadow) return
  if (object.isMesh) {
    const mats = (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean)
    const opaque = mats.length && mats.every((m) => !m.transparent && m.visible !== false && m.colorWrite !== false)
    if (opaque) {
      object.castShadow = true
      if (mats.every((m) => m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) object.receiveShadow = true
    }
  }
  for (const child of object.children) castShadows(child)
}

/** The tangents from the eye to a circle (centre `c` across, `depth` ahead, radius `r`): its span in x/depth. */
function tangentSpan(c, depth, r) {
  const d = Math.hypot(c, depth)
  const a = Math.atan2(c, depth)
  const h = Math.asin(Math.min(1, r / d))
  return [Math.tan(a - h), Math.tan(a + h)]
}

export function createStage(
  container,
  {
    fov = 27, target: aim = { x: 0, y: 1.4, z: 0 }, view: wideView = { azimuth: 0.42, elevation: 0.18 }, narrowView = null,
    height = 3.6, width, fit = null, turn = true, turnRange = 0.7, shadow = {}, catcher: catcherSize = 14, contact: useContact = true, zoom: enableZoom = false,
  } = {},
) {
  const frameWidth = Number.isFinite(width) ? width : height * 0.62
  const target = new THREE.Vector3(aim.x, aim.y, aim.z)
  const low = lowPowerDevice()
  const renderer = new THREE.WebGLRenderer({ antialias: !low, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.5 : 2))
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  // Neutral keeps the tokens' hues (ACES would push pear toward orange)
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = STUDIO.exposure
  renderer.shadowMap.enabled = true
  // three 0.186 removed PCFSoftShadowMap: the softness comes from the shadow radius
  renderer.shadowMap.type = THREE.PCFShadowMap
  const canvas = renderer.domElement
  canvas.setAttribute('aria-hidden', 'true')
  canvas.className = 'lab3d-canvas'
  container.appendChild(canvas)

  const scene = new THREE.Scene()
  const world = new THREE.Group()
  scene.add(world)

  // ------------------------------------------------------------------ the studio rig (in the scene, never in the world)
  const hemi = new THREE.HemisphereLight(STUDIO.hemi.sky, STUDIO.hemi.ground, low ? STUDIO.hemi.lowPower : STUDIO.hemi.intensity)
  const key = new THREE.DirectionalLight(STUDIO.key.color, STUDIO.key.intensity)
  key.castShadow = true
  key.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048)
  key.shadow.radius = low ? 2 : 6
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.015
  const fill = new THREE.DirectionalLight(STUDIO.fill.color, STUDIO.fill.intensity)
  const rim = new THREE.DirectionalLight(STUDIO.rim.color, STUDIO.rim.intensity)
  scene.add(hemi, key, key.target, fill, fill.target, rim, rim.target)

  // a soft room for metal and glass to reflect (skipped on low-power devices)
  let environment = null
  if (!low) {
    try {
      const pmrem = new THREE.PMREMGenerator(renderer)
      const room = new RoomEnvironment()
      environment = pmrem.fromScene(room, 0.04)
      room.dispose?.()
      pmrem.dispose()
      scene.environment = environment.texture
      scene.environmentIntensity = STUDIO.env
    } catch {
      environment = null
    }
  }

  // the floor: a shadow catcher on the paper, and a soft contact shadow right under the model
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ color: STUDIO.catcher.color, opacity: STUDIO.catcher.opacity, depthWrite: false }))
  catcher.rotation.x = -Math.PI / 2
  catcher.scale.set(Math.max(catcherSize, 0.001), Math.max(catcherSize, 0.001), 1)
  catcher.receiveShadow = true
  catcher.visible = catcherSize > 0
  catcher.renderOrder = -2
  scene.add(catcher)
  const contactMap = useContact ? blobTexture() : null
  const contact = contactMap
    ? new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: STUDIO.contact.color, alphaMap: contactMap, transparent: true, opacity: STUDIO.contact.opacity, depthWrite: false, toneMapped: false }))
    : null
  if (contact) {
    contact.rotation.x = -Math.PI / 2
    contact.visible = false
    contact.renderOrder = -1
    contact.userData.noFit = true
    scene.add(contact)
  }

  /** Key, fill and rim around a bounding sphere; the key's shadow box hugs it. */
  function light(center, radius, box = null) {
    const r = Math.max(0.05, radius)
    const dist = 4 * r + 1
    key.target.position.copy(center)
    key.position.copy(center).addScaledVector(KEY, dist)
    fill.target.position.copy(center)
    fill.position.copy(center).addScaledVector(FILL, dist)
    rim.target.position.copy(center)
    rim.position.copy(center).addScaledVector(RIM, dist)
    const cam = key.shadow.camera
    const s = r * 1.15
    cam.left = box?.left ?? -s
    cam.right = box?.right ?? s
    cam.top = box?.top ?? s
    cam.bottom = box?.bottom ?? -s
    cam.near = Math.max(0.01, dist - 1.6 * r)
    cam.far = dist + 3.6 * r
    cam.updateProjectionMatrix()
    key.shadow.normalBias = THREE.MathUtils.clamp(r * 0.008, 0.008, 0.05)
  }
  light(target, 0.5 * Math.hypot(height, frameWidth, frameWidth * 0.6), shadow.left !== undefined ? shadow : null)

  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 60)
  let view = wideView
  const state = { azimuth: view.azimuth, elevation: view.elevation, distance: 6, frame: 0, disposed: false, onFrame: null, onResize: null, pixelUnit: 0, fit: null, zoom: 1 }

  function aimAt(distance) {
    const { azimuth, elevation } = state
    if (distance > camera.far * 0.6) {
      camera.far = distance * 3
      camera.updateProjectionMatrix()
    }
    camera.position.set(
      target.x + distance * Math.sin(azimuth) * Math.cos(elevation),
      target.y + distance * Math.sin(elevation),
      target.z + distance * Math.cos(azimuth) * Math.cos(elevation),
    )
    camera.lookAt(target)
    camera.updateMatrixWorld()
  }

  // ------------------------------------------------------------------ fitting: every item inside the margins, the silhouette centred
  const probe = new THREE.Vector3()
  const right = new THREE.Vector3()
  const up = new THREE.Vector3()
  /** The fit items' span as seen now, in x/depth and y/depth; null when the camera is inside them. */
  function extents() {
    const inv = camera.matrixWorldInverse
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const item of state.fit.items) {
      let a0 = Infinity
      let a1 = -Infinity
      let b0 = Infinity
      let b1 = -Infinity
      for (const c of item.corners) {
        probe.copy(c).applyMatrix4(inv)
        const depth = -probe.z
        if (depth <= camera.near) return null
        const sx = probe.x / depth
        const sy = probe.y / depth
        if (sx < a0) a0 = sx
        if (sx > a1) a1 = sx
        if (sy < b0) b0 = sy
        if (sy > b1) b1 = sy
      }
      // a round part: its sphere is a tighter bound than its box's corners
      if (item.radius > 0 && item.center) {
        probe.copy(item.center).applyMatrix4(inv)
        const depth = -probe.z
        if (depth - item.radius > camera.near) {
          const [sx0, sx1] = tangentSpan(probe.x, depth, item.radius)
          const [sy0, sy1] = tangentSpan(probe.y, depth, item.radius)
          a0 = Math.max(a0, sx0)
          a1 = Math.min(a1, sx1)
          b0 = Math.max(b0, sy0)
          b1 = Math.min(b1, sy1)
        }
      }
      if (a0 < x0) x0 = a0
      if (a1 > x1) x1 = a1
      if (b0 < y0) y0 = b0
      if (b1 > y1) y1 = b1
    }
    return [x0, x1, y0, y1]
  }

  /** Aims at the fit's silhouette centre from the nearest distance at which it fits the margins. */
  function solveFit() {
    const { margin, center, radius } = state.fit
    const tv = Math.tan(THREE.MathUtils.degToRad(fov) / 2)
    const th = tv * camera.aspect
    const wx = 1 - margin.x
    const wt = 1 - margin.top
    const wb = -(1 - margin.bottom)
    const midY = (wt + wb) / 2
    const fits = () => {
      const e = extents()
      return Boolean(e) && e[0] / th >= -wx && e[1] / th <= wx && e[2] / tv >= wb && e[3] / tv <= wt
    }
    target.copy(center)
    let d = Math.max(0.5, (radius / tv) * 1.4)
    for (let k = 0; k < 7; k += 1) {
      aimAt(d)
      const e = extents()
      if (!e) {
        d *= 1.6
        continue
      }
      const nx0 = e[0] / th
      const nx1 = e[1] / th
      const ny0 = e[2] / tv
      const ny1 = e[3] / tv
      const s = Math.max((nx1 - nx0) / (2 * wx), (ny1 - ny0) / (wt - wb), 1e-3)
      right.setFromMatrixColumn(camera.matrixWorld, 0)
      up.setFromMatrixColumn(camera.matrixWorld, 1)
      target.addScaledVector(right, ((nx0 + nx1) / 2) * th * d).addScaledVector(up, ((ny0 + ny1) / 2 - midY) * tv * d)
      d = Math.max(0.2, d * s)
    }
    // the exact distance: fits() turns true once the camera is far enough and stays true
    let lo = d * 0.5
    let hi = d * 1.25
    aimAt(hi)
    for (let k = 0; k < 12 && !fits(); k += 1) {
      lo = hi
      hi *= 1.5
      aimAt(hi)
    }
    for (let k = 0; k < 22; k += 1) {
      const mid = (lo + hi) / 2
      aimAt(mid)
      if (fits()) hi = mid
      else lo = mid
    }
    return hi
  }

  function place() {
    if (state.fit) state.distance = solveFit()
    aimAt(state.distance / state.zoom)
    // scene units one screen pixel spans at the target: labels use it to stay readable
    const unit = (2 * (state.distance / state.zoom) * Math.tan(THREE.MathUtils.degToRad(fov) / 2)) / Math.max(1, container.clientHeight)
    if (Math.abs(unit - state.pixelUnit) > state.pixelUnit * 0.004) {
      state.pixelUnit = unit
      state.onResize?.(unit)
    }
  }

  function setFit(box) {
    if (!box) {
      state.fit = null
      return
    }
    const min = new THREE.Vector3(...box.min)
    const max = new THREE.Vector3(...box.max)
    const bounds = new THREE.Box3(min, max)
    const sphere = bounds.getBoundingSphere(new THREE.Sphere())
    state.fit = { items: [{ corners: boxCorners(min, max), center: null, radius: 0 }], margin: { x: 0.04, top: 0.06, bottom: 0.05, ...(box.margin || {}) }, center: sphere.center, radius: sphere.radius }
    light(sphere.center, sphere.radius)
  }
  if (fit) setFit(fit)

  /**
   * Frames `object` (default: the whole world). `fill` is the share of the view's limiting
   * dimension the model spans; `ground` is the floor's height when the model hovers (a drone), or
   * `lift` floats it a share of its own size above the floor (a molecule); `cast` makes its opaque
   * meshes cast and receive shadows; `shadow` scales the floor shadow (a tall diorama casts a long
   * one: 0.5 keeps it quiet); `fit: false` only moves the floor and the light (the camera keeps its
   * framing). Returns false when there is nothing to measure.
   */
  function frame(object = world, { fill: share = 0.78, ground, lift = 0, margin, cast = false, shadow: shadowStrength = 1, fit: refit = true, contact: showContact = true } = {}) {
    object.updateWorldMatrix(true, true)
    if (cast) castShadows(object)
    const items = []
    const box = new THREE.Box3()
    measure(object, items, box)
    if (box.isEmpty()) return false
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const span = Math.max(size.x, size.y, size.z, 1e-3)
    // `ground` puts the floor at a height; `lift` floats the model a share of its size above it
    const base = Number.isFinite(ground) ? Math.min(ground, box.min.y) : box.min.y - Math.max(0, lift) * span
    const hover = box.min.y - base
    catcher.position.set(center.x, base - span * 0.002, center.z)
    if (catcherSize > 0) catcher.scale.set(span * 9, span * 9, 1)
    catcher.material.opacity = STUDIO.catcher.opacity * THREE.MathUtils.clamp(shadowStrength, 0, 2)
    if (contact) {
      contact.visible = showContact
      contact.position.set(center.x, base + span * 0.0015, center.z)
      const spread = 1.3 + Math.min(1, hover / span) * 0.9
      contact.scale.set(Math.max(size.x, span * 0.3) * spread, Math.max(size.z, span * 0.3) * spread, 1)
      contact.material.opacity = STUDIO.contact.opacity * (hover > span * 0.05 ? 0.55 : 1)
    }
    // the light and its shadow box cover the model and the floor under it
    const lit = box.clone()
    lit.min.y = base
    const sphere = lit.getBoundingSphere(new THREE.Sphere())
    light(sphere.center, sphere.radius)
    if (refit) {
      // a hovering model keeps the floor (and its shadow) in the frame
      if (hover > 1e-4) items.push({ corners: boxCorners(new THREE.Vector3(box.min.x, base, box.min.z), new THREE.Vector3(box.max.x, base, box.max.z)), center: null, radius: 0 })
      const m = 1 - THREE.MathUtils.clamp(share, 0.3, 0.98)
      const fitSphere = box.getBoundingSphere(new THREE.Sphere())
      state.fit = { items, margin: { x: m, top: m * 0.9, bottom: m * 1.1, ...(margin || {}) }, center: fitSphere.center, radius: fitSphere.radius }
      resize()
    } else invalidate()
    return true
  }

  function resize() {
    const w = Math.max(1, container.clientWidth)
    const h = Math.max(1, container.clientHeight)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    const nextView = narrowView && camera.aspect < (narrowView.below ?? 1.5) ? narrowView : wideView
    if (nextView !== view) {
      view = nextView
      state.azimuth = view.azimuth
      state.elevation = view.elevation
    }
    // keep `height` metres in frame vertically; widen when the frame is narrow (or fit the box)
    const vfov = THREE.MathUtils.degToRad(fov)
    const needH = height / (2 * Math.tan(vfov / 2))
    const needW = frameWidth / (2 * Math.tan(vfov / 2) * camera.aspect)
    state.distance = Math.max(needH, needW) * 1.04
    camera.updateProjectionMatrix()
    place()
    state.pixelUnit = (2 * (state.distance / state.zoom) * Math.tan(vfov / 2)) / h
    state.onResize?.(state.pixelUnit)
    invalidate()
  }

  function render() {
    state.frame = 0
    if (state.disposed) return
    state.onFrame?.()
    renderer.render(scene, camera)
  }
  function invalidate() {
    if (!state.frame && !state.disposed) state.frame = requestAnimationFrame(render)
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
  ro?.observe(container)
  resize()

  // drag to turn the stand a little (fine pointers only; touch keeps scrolling the page)
  let drag = null
  const fine = window.matchMedia?.('(pointer: fine)').matches
  const onDown = (e) => {
    if (!turn || !fine || e.button !== 0 || state.blockTurn?.(e)) return
    drag = { x: e.clientX, y: e.clientY, az: state.azimuth, el: state.elevation }
    canvas.setPointerCapture?.(e.pointerId)
  }
  const onMove = (e) => {
    if (!drag) return
    state.azimuth = THREE.MathUtils.clamp(drag.az - (e.clientX - drag.x) * 0.006, view.azimuth - turnRange, view.azimuth + turnRange)
    state.elevation = THREE.MathUtils.clamp(drag.el + (e.clientY - drag.y) * 0.004, 0.02, enableZoom ? 1.4 : Math.max(0.62, view.elevation + 0.2))
    place()
    invalidate()
  }
  const onUp = () => {
    drag = null
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)

  let pinchDistance = 0
  const wheel = (event) => { event.preventDefault(); setZoom(state.zoom * Math.exp(-event.deltaY * .0012)) }
  const touchStart = (event) => { if (event.touches.length === 2) { event.preventDefault(); pinchDistance = Math.hypot(event.touches[0].clientX-event.touches[1].clientX, event.touches[0].clientY-event.touches[1].clientY) } }
  const touchMove = (event) => {
    if (event.touches.length !== 2 || !pinchDistance) return
    event.preventDefault()
    const distance = Math.hypot(event.touches[0].clientX-event.touches[1].clientX, event.touches[0].clientY-event.touches[1].clientY)
    setZoom(state.zoom * distance / pinchDistance); pinchDistance = distance
  }
  const touchEnd = (event) => { if (event.touches.length < 2) pinchDistance = 0 }
  function setZoom(value) { state.zoom = clampStageZoom(value); place(); state.onZoomChange?.(state.zoom); invalidate(); return state.zoom }
  const interactionSurface = container.parentElement || canvas
  if (enableZoom) {
    interactionSurface.addEventListener('wheel', wheel, { passive: false })
    interactionSurface.addEventListener('touchstart', touchStart, { passive: false })
    interactionSurface.addEventListener('touchmove', touchMove, { passive: false })
    interactionSurface.addEventListener('touchend', touchEnd)
    interactionSurface.addEventListener('touchcancel', touchEnd)
  }

  return {
    THREE,
    renderer,
    scene,
    world,
    camera,
    canvas,
    /** True when the soft room environment is on (metal and glass reflect it). */
    environment: Boolean(environment),
    lowPower: low,
    invalidate,
    resize,
    frame,
    set onFrame(fn) {
      state.onFrame = fn
    },
    set blockTurn(fn) {
      state.blockTurn = fn
    },
    /** Frame a new box (see `fit`): the camera keeps its turn and moves in or out. */
    setFit(box) {
      setFit(box)
      resize()
    },
    /** Called with the scene units per screen pixel now and whenever the camera moves in or out. */
    set onResize(fn) {
      state.onResize = fn
      if (fn && state.pixelUnit) fn(state.pixelUnit)
    },
    setZoom(value) { return enableZoom ? setZoom(value) : 1 },
    set onZoomChange(fn) { state.onZoomChange = fn; if (fn) fn(state.zoom) },
    setView(azimuth, elevation) {
      if (!enableZoom) return
      state.azimuth = azimuth; state.elevation = THREE.MathUtils.clamp(elevation, .02, 1.4)
      place(); invalidate()
    },
    resetView() {
      state.azimuth = view.azimuth
      state.elevation = view.elevation
      if (enableZoom) { state.zoom = 1; state.onZoomChange?.(1) }
      place()
      invalidate()
    },
    dispose() {
      state.disposed = true
      if (state.frame) cancelAnimationFrame(state.frame)
      ro?.disconnect()
      if (enableZoom) {
        interactionSurface.removeEventListener('wheel', wheel)
        interactionSurface.removeEventListener('touchstart', touchStart)
        interactionSurface.removeEventListener('touchmove', touchMove)
        interactionSurface.removeEventListener('touchend', touchEnd)
        interactionSurface.removeEventListener('touchcancel', touchEnd)
      }
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      catcher.geometry.dispose()
      catcher.material.dispose()
      if (contact) {
        contact.geometry.dispose()
        contact.material.dispose()
        contactMap.dispose()
      }
      if (environment) {
        scene.environment = null
        environment.dispose()
      }
      key.dispose?.()
      fill.dispose?.()
      rim.dispose?.()
      hemi.dispose?.()
      renderer.dispose()
      renderer.forceContextLoss?.()
      canvas.remove()
    },
  }
}
