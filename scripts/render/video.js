/**
 * volleyball_practice.mp4: a short 3D practice clip of the forearm pass, rendered frame by frame.
 *
 * A court, a net, two students (mannequin.js): the passer receives a ball served over the net and
 * bumps it up to the setter near the net, who sets it. Two 4-second cycles at 24 fps; in each cycle
 * the passer is ready at 0.5 s, makes the platform by 1.25 s, meets the ball at 2.0 s and has
 * followed through by 2.6 s (the lesson's video markers). The ball is the one yellow thing in the
 * frame, for the SAM 3.1 track.
 */
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createMannequin, volleyballTexture } from './mannequin.js'
import { PHASES } from './figure-volleyball.js'
import { canvasTexture, job, makeRenderer } from './lib.js'

const FPS = 24
const CYCLE = 4
const CYCLES = 2
const ease = (t) => t * t * (3 - 2 * t)
const lerp = (a, b, t) => a + (b - a) * t

function mixPose(a, b, t) {
  const out = {}
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = lerp(a[k] ?? 0, b[k] ?? 0, t)
  return out
}

// passer: key poses over one cycle (seconds → pose)
const READY = PHASES[0]
const KEYS = [
  [0.0, READY],
  [0.5, READY],
  [1.25, PHASES[1]],
  [1.8, { ...PHASES[1], kneeL: 1.25, kneeR: 1.35 }],
  [2.0, PHASES[2]],
  [2.6, PHASES[3]],
  [3.4, READY],
  [4.0, READY],
]
function passerPose(t) {
  for (let i = 0; i < KEYS.length - 1; i += 1) {
    const [t0, p0] = KEYS[i]
    const [t1, p1] = KEYS[i + 1]
    if (t >= t0 && t <= t1) return mixPose(p0, p1, ease((t - t0) / (t1 - t0 || 1)))
  }
  return READY
}
// setter: ready by the net, hands up to set as the pass arrives
const SET_READY = { stance: 0.12, hipL: 0.35, hipR: 0.45, kneeL: 0.5, kneeR: 0.6, tilt: 0.05, lean: 0.08, neck: -0.35, shoulder: 0.5, adduct: 0.05, elbow: 1.2, wristUp: 0.2 }
const SET_UP = { stance: 0.12, hipL: 0.22, hipR: 0.3, kneeL: 0.32, kneeR: 0.4, tilt: 0.0, lean: -0.05, neck: -0.85, shoulder: 2.75, adduct: 0.22, elbow: 1.25, wristUp: -0.6 }
function setterPose(t) {
  if (t < 2.6) return SET_READY
  if (t < 3.3) return mixPose(SET_READY, SET_UP, ease((t - 2.6) / 0.7))
  if (t < 3.75) return SET_UP
  return mixPose(SET_UP, SET_READY, ease((t - 3.75) / 0.25))
}

function courtTexture() {
  return canvasTexture(2048, 1024, (ctx, w, h) => {
    // maple boards with the court's orange paint inside the lines
    ctx.fillStyle = '#c98b52'
    ctx.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 16) {
      ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '255,220,170' : '90,50,20'},${0.04 + Math.random() * 0.05})`
      ctx.fillRect(0, y, w, 16)
      ctx.fillStyle = 'rgba(60,30,10,0.18)'
      ctx.fillRect(0, y, w, 1)
    }
    ctx.fillStyle = 'rgba(214,104,52,0.55)'
    ctx.fillRect(140, 180, w - 280, h - 360)
    ctx.strokeStyle = '#f6f3ec'
    ctx.lineWidth = 10
    ctx.strokeRect(140, 180, w - 280, h - 360)
    ctx.beginPath()
    ctx.moveTo(w / 2, 180)
    ctx.lineTo(w / 2, h - 180)
    ctx.moveTo(w / 2 - 300, 180)
    ctx.lineTo(w / 2 - 300, h - 180)
    ctx.moveTo(w / 2 + 300, 180)
    ctx.lineTo(w / 2 + 300, h - 180)
    ctx.stroke()
  })
}

function netMesh() {
  const g = new THREE.Group()
  g.name = 'net'
  const tex = canvasTexture(512, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(30,30,32,0.9)'
    ctx.lineWidth = 2
    for (let x = 0; x <= w; x += 12) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }
    for (let y = 0; y <= h; y += 12) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }
    ctx.fillStyle = '#f4f2ec'
    ctx.fillRect(0, 0, w, 10)
  })
  const net = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 1.0), new THREE.MeshStandardMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, roughness: 0.9, alphaTest: 0.05 }))
  net.rotation.y = Math.PI / 2
  net.position.set(0, 2.05, 0)
  g.add(net)
  const postMat = new THREE.MeshStandardMaterial({ color: '#3f5f8f', roughness: 0.4, metalness: 0.4 })
  for (const z of [-4.9, 4.9]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 16), postMat)
    post.position.set(0, 1.3, z)
    post.castShadow = true
    g.add(post)
  }
  return g
}

job(async () => async ({ width, height, scale = 1, from = 0, count = 24 }) => {
  if (!window.__clip) {
    const renderer = makeRenderer(width, height, { scale, toneMapping: THREE.NeutralToneMapping, exposure: 1.0 })
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#e9e4d8')
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environmentIntensity = 0.45
    scene.add(new THREE.HemisphereLight('#fbf6ec', '#9c7a58', 1.0))
    const key = new THREE.DirectionalLight('#fff4e2', 2.2)
    key.position.set(-6, 9, 7)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    Object.assign(key.shadow.camera, { left: -8, right: 8, top: 6, bottom: -4, near: 1, far: 30 })
    key.shadow.radius = 4
    key.shadow.bias = -0.0003
    scene.add(key)

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), new THREE.MeshStandardMaterial({ map: courtTexture(), roughness: 0.45 }))
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 9),
      new THREE.MeshStandardMaterial({
        map: canvasTexture(1024, 320, (ctx, w, h) => {
          ctx.fillStyle = '#e8e2d4'
          ctx.fillRect(0, 0, w, h)
          ctx.fillStyle = '#5d7f9e'
          ctx.fillRect(0, h * 0.72, w, h * 0.28)
          ctx.fillStyle = 'rgba(255,255,255,0.35)'
          for (let x = 40; x < w; x += 140) ctx.fillRect(x, 20, 90, 60)
        }),
        roughness: 0.9,
      }),
    )
    wall.position.set(0, 4.5, -6)
    scene.add(wall)
    scene.add(netMesh())

    // the passer on the left half, facing the net; the setter by the net
    const passer = createMannequin()
    passer.group.rotation.y = Math.PI / 2
    passer.group.position.set(-4.2, 0, 0.6)
    scene.add(passer.group)
    const setter = createMannequin({ kit: { skin: '#c99272', hair: '#211a16', shirt: '#2f78b7', trim: '#f4f1ea', shorts: '#1f2b45', sock: '#f3f1ec', shoe: '#2c3036', sole: '#e9e6df', pad: '#2a2f38' } })
    setter.group.rotation.y = -Math.PI / 2 + 0.35 // faces the passer, a little toward the camera
    setter.group.position.set(-1.0, 0, -0.5)
    scene.add(setter.group)

    const ballR = 0.105
    const ball = new THREE.Mesh(new THREE.SphereGeometry(ballR, 48, 32), new THREE.MeshPhysicalMaterial({ map: volleyballTexture(1024), roughness: 0.45, clearcoat: 0.3 }))
    ball.castShadow = true
    scene.add(ball)

    // where the ball meets the platform at 2.0 s, and where the setter's hands are at 3.4 s
    passer.pose(passerPose(2.0))
    scene.updateMatrixWorld(true)
    const pf = passer.platform(0.075)
    const contact = pf.point.clone().addScaledVector(pf.normal, 0.03 + ballR)
    setter.pose(SET_UP)
    scene.updateMatrixWorld(true)
    const hands = new THREE.Vector3()
    setter.joints['wrist-l'].getWorldPosition(hands)
    const hands2 = setter.joints['wrist-r'].getWorldPosition(new THREE.Vector3())
    hands.add(hands2).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.16, 0))
    const serve = new THREE.Vector3(6.5, 2.9, 0.9)

    // ballistic arcs: served over the net, then bumped up to the setter
    const arc = (a, b, apex, u) => {
      const p = a.clone().lerp(b, u)
      p.y = lerp(a.y, b.y, u) + 4 * apex * u * (1 - u)
      return p
    }
    function ballAt(t) {
      if (t <= 2.0) return arc(serve, contact, 1.35, ease(Math.min(1, t / 2.0)) * 0.25 + (t / 2.0) * 0.75)
      if (t <= 3.4) return arc(contact, hands, 1.25, (t - 2.0) / 1.4)
      const settle = hands.clone()
      settle.y += 0.18 * Math.sin(((t - 3.4) / 0.6) * Math.PI)
      return settle
    }

    // from the sideline, far enough back that the near post does not fill the frame
    const camera = new THREE.PerspectiveCamera(15.5, width / height, 0.1, 80)
    camera.position.set(-2.2, 1.8, 12.5)
    camera.lookAt(-2.0, 1.3, 0)
    window.__clip = { renderer, scene, camera, passer, setter, ball, ballAt, ballR }
  }
  const { renderer, scene, camera, passer, setter, ball, ballAt, ballR } = window.__clip
  const frames = []
  const balls = []
  for (let f = from; f < Math.min(from + count, FPS * CYCLE * CYCLES); f += 1) {
    const time = f / FPS
    const t = time % CYCLE
    passer.pose(passerPose(t))
    setter.pose(setterPose(t))
    ball.position.copy(ballAt(t))
    ball.rotation.set(time * 5.1, time * 3.3, 0.4)
    scene.updateMatrixWorld(true)
    renderer.render(scene, camera)
    frames.push(renderer.domElement.toDataURL('image/jpeg', 0.94))
    const c = ball.position.clone().project(camera)
    const r = (ballR / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / ball.position.distanceTo(camera.position)) * (height / 2)
    balls.push({ t: +time.toFixed(4), x: ((c.x + 1) / 2) * width, y: ((1 - c.y) / 2) * height, r })
  }
  return { frames, balls, total: FPS * CYCLE * CYCLES, fps: FPS }
})
