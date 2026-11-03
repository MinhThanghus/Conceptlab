/**
 * pendulum_classroom_photo.jpg: the lab's pendulum stand (pendulumBench.js) on a wooden lab bench
 * in a classroom (models/classroom.js), soft daylight from a window on the left, shot like a
 * phone photo: a 4:3 frame, a normal lens, a little depth of field. The red bob is placed where
 * the cut-out and the live tests expect it (centre near 725, 573 px; about 90 px across).
 */
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { BENCH_PALETTE, createPendulumBench } from '/frontend/src/lib/three/pendulumBench.js'
import { createClassroom } from '/frontend/src/lib/three/models/classroom.js'
import { canvasTexture, fontsReady, job, makeRenderer, project, projectedRadius } from './lib.js'
import { hideBook } from './figure-pendulum.js'

const PHOTO_BENCH = {
  ...BENCH_PALETTE,
  pear: '#2d3238', // clamps and pivot block: black-painted steel
  pearDeep: '#1d2125',
  steel: '#9aa1a9',
  kraft: '#b88454',
  card: '#f3eedf',
  ink: '#1b1d20',
}

const BOARD = [
  { text: 'Bài 12. Con lắc đơn', x: 150, y: 230, size: 128, alpha: 0.92, rot: -0.01 },
  { text: 'T = 2π √(L/g)', x: 230, y: 520, size: 118, alpha: 0.9, rot: -0.008 },
  { text: 'g = 9,81 m/s²', x: 230, y: 760, size: 96, alpha: 0.84, rot: -0.012 },
  { text: 'Nhóm 3', x: 2260, y: 250, size: 104, alpha: 0.9, rot: 0.01 },
  { text: 'L = 0,80 m', x: 2260, y: 470, size: 104, alpha: 0.9, rot: 0.006 },
  { text: '10 dao động: 18,1 s', x: 2260, y: 690, size: 96, alpha: 0.88, rot: 0.004 },
  { text: 'T ≈ ?', x: 2260, y: 900, size: 104, alpha: 0.86, rot: 0.01 },
]

function stopwatch() {
  const g = new THREE.Group()
  g.name = 'stopwatch'
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.036, 0.017, 48), new THREE.MeshStandardMaterial({ color: '#25282d', roughness: 0.45 }))
  body.castShadow = true
  body.receiveShadow = true
  g.add(body)
  const lcd = canvasTexture(256, 256, (ctx, w) => {
    ctx.fillStyle = '#25282d'
    ctx.fillRect(0, 0, w, w)
    ctx.fillStyle = '#a7b39a'
    ctx.beginPath()
    ctx.roundRect(46, 78, 164, 100, 14)
    ctx.fill()
    ctx.fillStyle = '#20251d'
    ctx.font = '600 58px "Be Vietnam Pro", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('18:10', 128, 148)
  })
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.032, 48), new THREE.MeshStandardMaterial({ map: lcd, roughness: 0.25 }))
  face.rotation.x = -Math.PI / 2
  face.position.y = 0.0087
  g.add(face)
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.012, 16), new THREE.MeshStandardMaterial({ color: '#b9bec4', metalness: 0.8, roughness: 0.3 }))
  crown.rotation.x = Math.PI / 2
  crown.position.set(0, 0, -0.041)
  g.add(crown)
  return g
}

function tapeMeasure() {
  const g = new THREE.Group()
  g.name = 'tape-measure'
  const caseMat = new THREE.MeshStandardMaterial({ color: '#f0c419', roughness: 0.5 })
  const box = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.072, 0.036, 4, 0.016), caseMat)
  box.rotation.x = -Math.PI / 2
  box.position.y = 0.018
  box.castShadow = true
  g.add(box)
  const tape = canvasTexture(1024, 32, (ctx, w, h) => {
    ctx.fillStyle = '#f2d34c'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#1d1d1d'
    for (let i = 0; i < 100; i += 1) {
      const x = (i / 100) * w
      ctx.fillRect(x, 0, 1.5, i % 10 === 0 ? 18 : i % 5 === 0 ? 12 : 7)
    }
  })
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.019), new THREE.MeshStandardMaterial({ map: tape, roughness: 0.4 }))
  strip.rotation.x = -Math.PI / 2
  strip.position.set(0.245, 0.0012, 0.004)
  strip.receiveShadow = true
  g.add(strip)
  return g
}

function notebook() {
  const g = new THREE.Group()
  g.name = 'notebook'
  const cover = canvasTexture(512, 700, (ctx, w, h) => {
    ctx.fillStyle = '#3d6fa8'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 4000; i += 1) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2)
    }
    ctx.fillStyle = '#f5f2e9'
    ctx.fillRect(80, 330, 352, 170)
    ctx.strokeStyle = 'rgba(40,60,90,0.5)'
    ctx.lineWidth = 2
    for (let k = 0; k < 3; k += 1) {
      ctx.beginPath()
      ctx.moveTo(100, 395 + k * 38)
      ctx.lineTo(412, 395 + k * 38)
      ctx.stroke()
    }
  })
  const book = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.012, 0.24, 2, 0.003), [
    new THREE.MeshStandardMaterial({ color: '#f1eee6', roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: '#f1eee6', roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ map: cover, roughness: 0.75 }),
    new THREE.MeshStandardMaterial({ color: '#2f5c8f', roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: '#f1eee6', roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: '#f1eee6', roughness: 0.9 }),
  ])
  book.position.y = 0.006
  book.castShadow = true
  book.receiveShadow = true
  g.add(book)
  const pencil = new THREE.Mesh(new THREE.CylinderGeometry(0.0038, 0.0038, 0.17, 6), new THREE.MeshStandardMaterial({ color: '#2f7d4f', roughness: 0.6 }))
  pencil.rotation.z = Math.PI / 2
  pencil.rotation.y = 0.5
  pencil.position.set(0.02, 0.016, 0.02)
  pencil.castShadow = true
  g.add(pencil)
  return g
}

job(async () => {
  await fontsReady(['600 40px "Be Vietnam Pro"', '400 40px "Segoe Print"'])
  return async ({ width, height, scale = 2, only = null }) => {
    RectAreaLightUniformsLib.init()
    const renderer = makeRenderer(width, height, { scale, toneMapping: THREE.AgXToneMapping, exposure: 1.05 })
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#d8cfb4')
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environmentIntensity = 0.24

    const room = createClassroom({ seed: 11, board: BOARD })
    scene.add(room.group)

    // window on the left: a big soft source, plus the daylight that casts the soft shadows
    const windowLight = new THREE.RectAreaLight('#fff4e6', 11, 1.9, 1.8)
    windowLight.position.set(-2.8, 1.75, 0.35)
    windowLight.lookAt(0, 1.3, -0.4)
    scene.add(windowLight)
    const sun = new THREE.DirectionalLight('#fff0dc', 1.9)
    sun.position.set(-2.7, 2.9, 3.1)
    sun.target.position.set(0.1, 1.2, -0.7)
    sun.castShadow = true
    sun.shadow.mapSize.set(4096, 4096)
    Object.assign(sun.shadow.camera, { left: -2.6, right: 2.6, top: 2.6, bottom: -2.0, near: 0.5, far: 14 })
    sun.shadow.radius = 12
    sun.shadow.blurSamples = 16
    sun.shadow.bias = -0.0003
    sun.shadow.normalBias = 0.012
    scene.add(sun, sun.target)
    scene.add(new THREE.HemisphereLight('#f6f1e6', '#a68c6b', 0.34))
    // the glow a window throws along the back wall: bright near it, falling off across the room
    const glow = new THREE.SpotLight('#fff3e2', 22, 9, 0.85, 1, 1.4)
    glow.position.set(-3.1, 2.3, 0.9)
    glow.target.position.set(-0.4, 1.5, -1.65)
    scene.add(glow, glow.target)
    const bounce = new THREE.DirectionalLight('#e9eefb', 0.22)
    bounce.position.set(2.5, 1.8, 3.5)
    scene.add(bounce)
    if (only) {
      // look-dev: keep one light to see what it does
      scene.traverse((o) => {
        if (o.isLight && o.type !== only) o.intensity = 0
      })
      scene.environmentIntensity = 0
    }

    // the stand on the bench, the bob hanging still on its 0.80 m string
    const stand = createPendulumBench({ maxLength: 0.85, palette: PHOTO_BENCH, colors: ['#c3201c'], formatLength: (m) => m.toFixed(1).replace('.', ',') })
    hideBook(stand)
    stand.group.traverse((o) => {
      if (o.isLine) o.visible = false // the dashed swing path is a lab overlay, not an object
    })
    stand.setPendulum(0, 0.8, 0.015, 0.02)
    // a real retort stand has a small heavy base under the rod, not the lab's long board
    const base = stand.group.children[0]
    base.scale.set(0.3, 0.34, 0.4)
    base.position.set(-0.5, 0.09 - 0.0153, 0)
    base.material = new THREE.MeshStandardMaterial({ color: '#2b3036', roughness: 0.48, metalness: 0.35 })
    stand.group.position.copy(room.benchTop).add(new THREE.Vector3(0.12, -0.0594, -0.06))
    scene.add(stand.group)
    const bob = stand.bobs[0]
    bob.material = new THREE.MeshPhysicalMaterial({ color: '#c3201c', roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.18, metalness: 0 })
    bob.castShadow = true

    // things a group leaves on the bench while measuring
    const sw = stopwatch()
    sw.position.copy(room.benchTop).add(new THREE.Vector3(0.5, 0.0085, 0.2))
    sw.rotation.y = -0.5
    scene.add(sw)
    const tm = tapeMeasure()
    tm.position.copy(room.benchTop).add(new THREE.Vector3(0.78, 0, 0.02))
    tm.rotation.y = 0.35
    scene.add(tm)
    const nb = notebook()
    nb.position.copy(room.benchTop).add(new THREE.Vector3(-0.95, 0, 0.14))
    nb.rotation.y = 0.22
    scene.add(nb)
    scene.traverse((o) => {
      if (o.isMesh && o !== room.parts.floor) {
        o.castShadow = o.castShadow !== false
        o.receiveShadow = true
      }
    })

    // the phone: 4:3, about a 1.3x lens, held at a standing student's eye height
    const camera = new THREE.PerspectiveCamera(32, width / height, 0.05, 40)
    const bobPos = new THREE.Vector3()
    scene.updateMatrixWorld(true)
    bob.getWorldPosition(bobPos)
    const eye = new THREE.Vector3(0.5, 1.95, 3.3)
    const target = bobPos.clone().add(new THREE.Vector3(-0.2, 0.18, 0))
    const want = { x: 725, y: 573, d: 92 }
    for (let it = 0; it < 60; it += 1) {
      camera.position.copy(eye)
      camera.lookAt(target)
      camera.updateMatrixWorld(true)
      const [bx, by] = project(bobPos, camera, width, height)
      const r = projectedRadius(bobPos, stand.bobRadius, camera, height)
      const dist = camera.position.distanceTo(bobPos)
      const frameH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
      target.addScaledVector(right, ((bx - want.x) / height) * frameH * 0.8)
      target.addScaledVector(up, (-(by - want.y) / height) * frameH * 0.8)
      const toBob = bobPos.clone().sub(eye)
      eye.addScaledVector(toBob, (1 - (2 * r) / want.d) * 0.5)
    }
    camera.position.copy(eye)
    camera.lookAt(target)
    camera.updateMatrixWorld(true)
    const [bx, by] = project(bobPos, camera, width, height)
    const br = projectedRadius(bobPos, stand.bobRadius, camera, height)

    const rt = new THREE.WebGLRenderTarget(width * scale, height * scale, { samples: 4, type: THREE.HalfFloatType })
    const composer = new EffectComposer(renderer, rt)
    composer.addPass(new RenderPass(scene, camera))
    const ao = new GTAOPass(scene, camera, width * scale, height * scale)
    ao.blendIntensity = 0.8
    ao.updateGtaoMaterial({ radius: 0.18, distanceExponent: 1.5, thickness: 1, scale: 1 })
    composer.addPass(ao)
    composer.addPass(new BokehPass(scene, camera, { focus: camera.position.distanceTo(bobPos), aperture: 0.0026, maxblur: 0.006 }))
    composer.addPass(new OutputPass())
    composer.render()
    composer.render()
    const image = renderer.domElement.toDataURL('image/png')
    return {
      image,
      bob: { cx: Math.round(bx * 10) / 10, cy: Math.round(by * 10) / 10, diameter: Math.round(br * 20) / 10 },
      camera: { fov: camera.fov, position: camera.position.toArray().map((v) => +v.toFixed(3)), target: target.toArray().map((v) => +v.toFixed(3)) },
    }
  }
})
