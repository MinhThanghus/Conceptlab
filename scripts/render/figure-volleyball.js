/**
 * Hình 5 of the PE page: the four phases of the forearm pass, one student figure (mannequin.js)
 * posed four times and lit the same way, the ball where each phase puts it.
 */
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createMannequin, volleyballTexture } from './mannequin.js'

export const PHASES = [
  // H1 ready position: feet shoulder width, knees bent, weight forward, arms forward, eyes on the ball
  { stance: 0.11, hipL: 0.62, hipR: 0.82, kneeL: 0.95, kneeR: 1.05, tilt: 0.16, lean: 0.24, neck: -0.62, shoulder: 0.62, adduct: 0.06, elbow: 1.05, wristUp: 0.2 },
  // H2 platform: hands clasped, thumbs together, elbows locked, forearms one plane
  { stance: 0.12, hipL: 0.8, hipR: 0.98, kneeL: 1.2, kneeR: 1.3, tilt: 0.2, lean: 0.28, neck: -0.7, shoulder: 0.82, adduct: 0.28, elbow: 0.02, wristUp: -0.18 },
  // H3 contact: the ball on the forearms above the wrists, legs extending, arms below the shoulders
  { stance: 0.11, hipL: 0.5, hipR: 0.62, kneeL: 0.68, kneeR: 0.78, tilt: 0.13, lean: 0.2, neck: -0.62, shoulder: 1.02, adduct: 0.28, elbow: 0.02, wristUp: -0.18 },
  // H4 follow-through: body forward, arms no higher than the shoulders, ball on its way to the target
  { stance: 0.1, hipL: 0.16, hipR: 0.3, kneeL: 0.12, kneeR: 0.26, tilt: 0.06, lean: 0.12, neck: -0.7, shoulder: 1.36, adduct: 0.28, elbow: 0.02, wristUp: -0.12, heel: 0.22 },
]

export async function renderPassPanels({ width, height, ratio = 4 }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(ratio)
  renderer.setSize(width, height, false)
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.5
  scene.add(new THREE.HemisphereLight('#fffaf2', '#e6e0d2', 1.2))
  const key = new THREE.DirectionalLight('#fff2dc', 2.5)
  key.position.set(-1.2, 5.2, 3.4)
  key.castShadow = true
  key.shadow.mapSize.set(4096, 4096)
  Object.assign(key.shadow.camera, { left: -1.6, right: 2.2, top: 2.6, bottom: -1.4, near: 0.5, far: 14 })
  key.shadow.radius = 5
  key.shadow.bias = -0.0002
  key.shadow.normalBias = 0.01
  key.target.position.set(0.3, 0.6, 0)
  scene.add(key, key.target)
  const rim = new THREE.DirectionalLight('#dfe8ff', 0.7)
  rim.position.set(3, 2.5, -2.5)
  scene.add(rim)

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.ShadowMaterial({ color: '#2a2418', opacity: 0.2 }))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const student = createMannequin()
  student.group.rotation.y = Math.PI / 2 // faces +X, to the right of the page
  scene.add(student.group)

  const ballR = 0.105
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(ballR, 48, 32),
    new THREE.MeshPhysicalMaterial({ map: volleyballTexture(1024), roughness: 0.48, clearcoat: 0.25, clearcoatRoughness: 0.5 }),
  )
  ball.castShadow = true
  ball.rotation.set(0.4, 0.8, 0.2)
  scene.add(ball)

  const trailMat = new THREE.LineDashedMaterial({ color: '#59616c', dashSize: 0.045, gapSize: 0.04, transparent: true, opacity: 0.85 })
  let trail = null
  const setTrail = (points) => {
    if (trail) {
      scene.remove(trail)
      trail.geometry.dispose()
      trail = null
    }
    if (!points) return
    const curve = new THREE.QuadraticBezierCurve3(...points)
    trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), trailMat)
    trail.computeLineDistances()
    scene.add(trail)
  }

  const camera = new THREE.PerspectiveCamera(27, width / height, 0.1, 40)
  const target = new THREE.Vector3(0.42, 0.9, 0)
  camera.position.set(target.x + 1.2, target.y + 0.3, 3.95)
  camera.lookAt(target)

  const urls = []
  const info = []
  for (let i = 0; i < PHASES.length; i += 1) {
    student.pose(PHASES[i])
    const pf = student.platform(0.075)
    const contact = pf.point.clone().addScaledVector(pf.normal, 0.03 + ballR)
    let at
    if (i === 0) {
      at = contact.clone().add(new THREE.Vector3(0.5, 0.52, 0))
      setTrail([at.clone().add(new THREE.Vector3(0.3, 0.22, 0)), at.clone().add(new THREE.Vector3(0.15, 0.13, 0)), at.clone().add(new THREE.Vector3(0.09, 0.07, 0))])
    } else if (i === 1) {
      at = contact.clone().add(new THREE.Vector3(0.36, 0.36, 0))
      setTrail([at.clone().add(new THREE.Vector3(0.4, 0.36, 0)), at.clone().add(new THREE.Vector3(0.2, 0.2, 0)), at.clone().add(new THREE.Vector3(0.09, 0.09, 0))])
    } else if (i === 2) {
      at = contact
      setTrail(null)
    } else {
      at = contact.clone().add(new THREE.Vector3(0.17, 0.42, 0))
      setTrail([contact.clone().add(new THREE.Vector3(0.0, 0.08, 0)), contact.clone().add(new THREE.Vector3(0.05, 0.28, 0)), at.clone().add(new THREE.Vector3(-0.02, -0.12, 0))])
    }
    ball.position.copy(at)
    ball.rotation.z += 0.9
    scene.updateMatrixWorld(true)
    renderer.render(scene, camera)
    urls.push(renderer.domElement.toDataURL('image/png'))
    const p = at.clone().project(camera)
    info.push({ ball: [((p.x + 1) / 2) * width, ((1 - p.y) / 2) * height] })
  }
  renderer.dispose()
  pmrem.dispose()
  student.dispose()
  return { urls, info }
}
