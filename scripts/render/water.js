/**
 * water_cycle.png: the water-cycle diorama (models/waterCycle.js) lit from the top left, with no
 * printed words (the lab labels the parts and runs the self-test). Each stage is then rendered
 * alone as a mask with the same camera, so its region in the picture is measured, not drawn.
 */
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createWaterCycleDiorama } from '/frontend/src/lib/three/models/waterCycle.js'
import { canvasTexture, job, makeRenderer, renderMasks, settle } from './lib.js'

job(async () => async ({ width, height, scale = 2 }) => {
  const renderer = makeRenderer(width, height, { scale, toneMapping: THREE.NeutralToneMapping, exposure: 1.0 })
  const scene = new THREE.Scene()
  scene.background = canvasTexture(64, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#bfdcf2')
    g.addColorStop(0.55, '#e3eef5')
    g.addColorStop(1, '#f4f1e8')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.35

  scene.add(new THREE.HemisphereLight('#e4f1ff', '#cdb48b', 1.15))
  const key = new THREE.DirectionalLight('#fff3dd', 2.6)
  key.position.set(-7, 10, 6)
  key.target.position.set(0.5, 0, 0)
  key.castShadow = true
  key.shadow.mapSize.set(4096, 4096)
  Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 })
  key.shadow.radius = 4
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.02
  scene.add(key, key.target)
  const rim = new THREE.DirectionalLight('#dbe8ff', 0.6)
  rim.position.set(6, 4, -6)
  scene.add(rim)

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ color: '#36404a', opacity: 0.22 }))
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -2.32
  ground.receiveShadow = true
  scene.add(ground)

  const diorama = createWaterCycleDiorama({ seed: 5 })
  scene.add(diorama.group)

  const camera = new THREE.PerspectiveCamera(27, width / height, 0.5, 200)
  const target = new THREE.Vector3(0.15, 0.95, 0.1)
  const az = -0.42
  const el = 0.43
  const dist = 25.5
  camera.position.set(target.x + dist * Math.sin(az) * Math.cos(el), target.y + dist * Math.sin(el), target.z + dist * Math.cos(az) * Math.cos(el))
  camera.lookAt(target)
  camera.updateMatrixWorld(true)

  await settle(renderer, scene, camera, 3)
  renderer.render(scene, camera)
  const image = renderer.domElement.toDataURL('image/png')
  const p = diorama.parts
  const masks = renderMasks(renderer, scene, camera, {
    sun: p.sun,
    evaporation: p.evaporation,
    condensation: p.condensation,
    rain: p.rain,
    runoff: p.runoff,
    infiltration: p.infiltration,
  })
  return {
    image,
    masks,
    method: 'Each stage rendered alone (white on black) with the beauty camera, closed and traced; scripts/render/water.js',
    camera: { fov: camera.fov, position: camera.position.toArray().map((v) => +v.toFixed(3)), target: target.toArray() },
  }
})
