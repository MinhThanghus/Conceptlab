/**
 * Hình 12.1 of the demo textbook page: the lab's own pendulum stand (pendulumBench.js, the
 * model the 3D lab uses) rendered as a clean textbook figure, plus the screen positions of the
 * pivot, the bob, the vertical and the angle so the page can letter them (O, α, L, m).
 */
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { BENCH_PALETTE, createPendulumBench } from '/frontend/src/lib/three/pendulumBench.js'

export const TEXTBOOK_BENCH = {
  ...BENCH_PALETTE,
  pear: '#2f63a8', // clamp and pivot block: painted blue steel
  pearDeep: '#24497b',
  coral: '#c8372d', // the bob
  steel: '#8a929c',
  kraft: '#b98b5e',
  card: '#fbfaf6',
}

/** The book lying on the stand's base is the page this figure sits on: leave it out here. */
export function hideBook(bench) {
  for (const child of bench.group.children) {
    if (child.isGroup && child.children.length === 2 && child.position.z > 0.1) child.visible = false
  }
}

export async function renderPendulumFigure({ width, height, ratio = 4, theta = 0.26, length = 0.8 }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(ratio)
  renderer.setSize(width, height, false)
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.55
  scene.add(new THREE.HemisphereLight('#fffaf0', '#e9e4d8', 1.1))
  const key = new THREE.DirectionalLight('#fff3df', 2.4)
  key.position.set(-1.7, 6.5, 3.1)
  key.castShadow = true
  key.shadow.mapSize.set(4096, 4096)
  Object.assign(key.shadow.camera, { left: -1.8, right: 1.8, top: 2.4, bottom: -1.2, near: 0.5, far: 14 })
  key.shadow.radius = 6
  key.shadow.bias = -0.0003
  key.shadow.normalBias = 0.01
  key.target.position.set(0, 0.8, 0)
  scene.add(key, key.target)

  // no floor plane (its shadows would float on the page): a soft contact shadow under the board
  const blot = document.createElement('canvas')
  blot.width = 256
  blot.height = 256
  const g2 = blot.getContext('2d')
  const grad = g2.createRadialGradient(128, 128, 10, 128, 128, 128)
  grad.addColorStop(0, 'rgba(40, 32, 18, 0.55)')
  grad.addColorStop(0.55, 'rgba(40, 32, 18, 0.22)')
  grad.addColorStop(1, 'rgba(40, 32, 18, 0)')
  g2.fillStyle = grad
  g2.fillRect(0, 0, 256, 256)
  const blotTex = new THREE.CanvasTexture(blot)
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 1.25), new THREE.MeshBasicMaterial({ map: blotTex, transparent: true, depthWrite: false }))
  contact.rotation.x = -Math.PI / 2
  contact.position.set(-0.2, 0.001, 0.02)
  scene.add(contact)

  const bench = createPendulumBench({ maxLength: 1.0, palette: TEXTBOOK_BENCH, formatLength: (m) => m.toFixed(1).replace('.', ',') })
  hideBook(bench)
  bench.setPendulum(0, length, theta, theta)
  scene.add(bench.group)
  bench.group.updateMatrixWorld(true)

  // The base board is sized for two pendulums; one pendulum needs only the left part of it.
  const base = bench.group.children[0]
  base.scale.x = 0.7
  base.position.x = -0.2

  // camera: nearly square to the swing plane (so the angle reads true), a little above, the
  // whole stand fitted in the frame with a margin
  const camera = new THREE.PerspectiveCamera(20, width / height, 0.1, 60)
  const box = new THREE.Box3()
  bench.group.traverse((o) => {
    if (o.isMesh && o.visible && o.parent.visible) box.expandByObject(o)
  })
  const target = box.getCenter(new THREE.Vector3())
  target.y -= 0.02
  const az = 0.14
  const el = 0.16
  const corners = []
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z))
  const place = (dist) => {
    camera.position.set(target.x + dist * Math.sin(az) * Math.cos(el), target.y + dist * Math.sin(el), target.z + dist * Math.cos(az) * Math.cos(el))
    camera.lookAt(target)
    camera.updateMatrixWorld(true)
    camera.updateProjectionMatrix()
  }
  let lo = 2
  let hi = 30
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2
    place(mid)
    const fits = corners.every((c) => {
      const p = c.clone().project(camera)
      return Math.abs(p.x) < 0.98 && Math.abs(p.y) < 0.99
    })
    if (fits) hi = mid
    else lo = mid
  }
  place(hi)

  renderer.render(scene, camera)
  const url = renderer.domElement.toDataURL('image/png')

  const P = bench.pivot(0)
  const dir = new THREE.Vector3(Math.sin(theta), -Math.cos(theta), 0)
  const B = P.clone().addScaledVector(dir, length)
  const px = (v) => {
    const p = v.clone().project(camera)
    return [((p.x + 1) / 2) * width, ((1 - p.y) / 2) * height]
  }
  const arc = []
  for (let k = 0; k <= 16; k += 1) {
    const a = (theta * k) / 16
    arc.push(px(P.clone().add(new THREE.Vector3(Math.sin(a), -Math.cos(a), 0).multiplyScalar(0.42))))
  }
  const mid = (theta / 2)
  const pts = {
    pivot: px(P),
    bob: px(B),
    vertical: px(P.clone().add(new THREE.Vector3(0, -(length + 0.2), 0))),
    arc,
    alpha: px(P.clone().add(new THREE.Vector3(Math.sin(mid), -Math.cos(mid), 0).multiplyScalar(0.53))),
    stringMid: px(P.clone().addScaledVector(dir, length * 0.55)),
    bobRadius: Math.abs(px(B.clone().add(new THREE.Vector3(bench.bobRadius, 0, 0)))[0] - px(B)[0]),
  }
  renderer.dispose()
  pmrem.dispose()
  bench.dispose()
  return { url, pts }
}
