/**
 * A posable student figure for the PE material (forearm pass), procedural Three.js.
 *
 * Frame: forward +Z, up +Y, the figure's own left +X (a left/right pair is a mirror in X).
 * Joints are Groups (hips, knees, ankles, waist, chest, neck, shoulders, elbows, wrists); limbs
 * are lathe-built tapered capsules so the joints stay continuous. Units are metres for a
 * 1.56 m grade 7 student. Stylised on purpose: no face, a textbook figure, not a person.
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

export const KIT = {
  skin: '#d6a07c',
  hair: '#2b221d',
  shirt: '#2f78b7',
  trim: '#f4f1ea',
  shorts: '#1f2b45',
  sock: '#f3f1ec',
  shoe: '#2c3036',
  sole: '#e9e6df',
  pad: '#2a2f38',
}

/** Tapered capsule from y = 0 (radius r1) down to y = -length (radius r2), revolved about Y. */
function limbGeometry(r1, r2, length, seg = 20) {
  const pts = []
  const steps = 8
  for (let i = 0; i <= steps; i += 1) {
    const a = -Math.PI / 2 + (Math.PI / 2) * (i / steps) // bottom cap, from the pole up to the equator
    pts.push(new THREE.Vector2(Math.cos(a) * r2, -length + Math.sin(a) * r2))
  }
  for (let i = 0; i <= steps; i += 1) {
    const a = (Math.PI / 2) * (i / steps) // top cap, from the equator to the pole
    pts.push(new THREE.Vector2(Math.cos(a) * r1, Math.sin(a) * r1))
  }
  pts[0].x = 0
  pts[pts.length - 1].x = 0
  return new THREE.LatheGeometry(pts, seg)
}

/** Torso from the waist (y = 0) to the base of the neck: a lathe of a real torso profile, flattened front to back. */
function torsoGeometry() {
  const profile = [
    [0.0, -0.035], [0.118, -0.03], [0.124, 0.02], [0.12, 0.08], [0.128, 0.15], [0.142, 0.22], [0.15, 0.28],
    [0.148, 0.33], [0.13, 0.37], [0.095, 0.395], [0.055, 0.41], [0.0, 0.415],
  ].map(([r, y]) => new THREE.Vector2(r, y))
  const g = new THREE.LatheGeometry(profile, 32)
  g.scale(1, 1, 0.64)
  g.computeVertexNormals()
  return g
}

export function createMannequin({ kit = KIT } = {}) {
  const mat = (color, rough = 0.62, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra })
  const M = {
    skin: mat(kit.skin, 0.55),
    hair: mat(kit.hair, 0.8),
    shirt: mat(kit.shirt, 0.78),
    trim: mat(kit.trim, 0.7),
    shorts: mat(kit.shorts, 0.8),
    sock: mat(kit.sock, 0.9),
    shoe: mat(kit.shoe, 0.55),
    sole: mat(kit.sole, 0.7),
    pad: mat(kit.pad, 0.75),
  }
  const disposables = Object.values(M)
  const mesh = (geo, material, name) => {
    const m = new THREE.Mesh(geo, material)
    m.name = name
    m.castShadow = true
    m.receiveShadow = true
    disposables.push(geo)
    return m
  }
  const joint = (name, parent, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group()
    g.name = name
    g.position.set(x, y, z)
    parent.add(g)
    return g
  }

  const D = { hipY: 0.84, hipHalf: 0.088, thigh: 0.4, shin: 0.385, upperArm: 0.275, forearm: 0.245, shoulderHalf: 0.168 }
  const root = new THREE.Group()
  root.name = 'student'
  const pelvis = joint('pelvis', root, 0, D.hipY, 0)
  const pelvisMesh = mesh(new THREE.SphereGeometry(1, 32, 20), M.shorts, 'shorts-seat')
  pelvisMesh.scale.set(0.158, 0.115, 0.112)
  pelvisMesh.position.set(0, 0.045, -0.01)
  pelvis.add(pelvisMesh)

  // spine: waist → chest → neck → head
  const waist = joint('waist', pelvis, 0, 0.075, 0)
  const torso = mesh(torsoGeometry(), M.shirt, 'shirt')
  waist.add(torso)
  const hem = mesh(new THREE.TorusGeometry(0.121, 0.012, 8, 40), M.shorts, 'waistband')
  hem.rotation.x = Math.PI / 2
  hem.scale.set(1, 0.64, 1)
  hem.position.y = -0.012
  waist.add(hem)
  const chest = joint('chest', waist, 0, 0.17, 0)
  const neck = joint('neck', chest, 0, 0.235, 0.0)
  const neckMesh = mesh(limbGeometry(0.043, 0.047, 0.07), M.skin, 'neck')
  neckMesh.position.y = 0.07
  neck.add(neckMesh)
  const collar = mesh(new THREE.TorusGeometry(0.05, 0.011, 8, 32), M.trim, 'collar')
  collar.rotation.x = Math.PI / 2
  collar.position.y = 0.002
  neck.add(collar)
  const head = joint('head', neck, 0, 0.12, 0.012)
  const skull = mesh(new THREE.SphereGeometry(1, 40, 28), M.skin, 'head')
  skull.scale.set(0.09, 0.112, 0.102)
  head.add(skull)
  const hair = mesh(new THREE.SphereGeometry(1, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.56), M.hair, 'hair')
  hair.scale.set(0.097, 0.118, 0.109)
  hair.rotation.x = -0.42
  hair.position.set(0, 0.008, -0.006)
  head.add(hair)
  const ears = [-1, 1].map((s) => {
    const ear = mesh(new THREE.SphereGeometry(1, 12, 10), M.skin, s > 0 ? 'ear-l' : 'ear-r')
    ear.scale.set(0.014, 0.026, 0.018)
    ear.position.set(s * 0.088, -0.005, -0.004)
    head.add(ear)
    return ear
  })

  const sides = {}
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'l' : 'r'
    // arm
    const shoulder = joint(`shoulder-${tag}`, chest, s * D.shoulderHalf, 0.2, -0.01)
    const delt = mesh(new THREE.SphereGeometry(0.058, 24, 16), M.shirt, `sleeve-cap-${tag}`)
    shoulder.add(delt)
    const sleeve = mesh(limbGeometry(0.056, 0.05, 0.12), M.shirt, `sleeve-${tag}`)
    shoulder.add(sleeve)
    const cuff = mesh(new THREE.TorusGeometry(0.05, 0.007, 8, 24), M.trim, `sleeve-trim-${tag}`)
    cuff.rotation.x = Math.PI / 2
    cuff.position.y = -0.12
    shoulder.add(cuff)
    shoulder.add(mesh(limbGeometry(0.043, 0.036, D.upperArm), M.skin, `upper-arm-${tag}`))
    const elbow = joint(`elbow-${tag}`, shoulder, 0, -D.upperArm, 0)
    elbow.add(mesh(limbGeometry(0.036, 0.028, D.forearm), M.skin, `forearm-${tag}`))
    const wrist = joint(`wrist-${tag}`, elbow, 0, -D.forearm, 0)
    const hand = mesh(new RoundedBoxGeometry(0.05, 0.135, 0.03, 3, 0.014), M.skin, `hand-${tag}`)
    hand.position.set(0, -0.062, 0)
    wrist.add(hand)
    const thumb = mesh(limbGeometry(0.012, 0.01, 0.05), M.skin, `thumb-${tag}`)
    thumb.position.set(-s * 0.018, -0.02, 0.016)
    thumb.rotation.x = -0.35
    wrist.add(thumb)
    // leg
    const hip = joint(`hip-${tag}`, pelvis, s * D.hipHalf, 0, 0)
    hip.add(mesh(limbGeometry(0.078, 0.07, 0.17), M.shorts, `shorts-leg-${tag}`))
    hip.add(mesh(limbGeometry(0.068, 0.047, D.thigh), M.skin, `thigh-${tag}`))
    const knee = joint(`knee-${tag}`, hip, 0, -D.thigh, 0)
    const pad = mesh(limbGeometry(0.056, 0.054, 0.085), M.pad, `knee-pad-${tag}`)
    pad.position.set(0, 0.045, 0.004)
    knee.add(pad)
    knee.add(mesh(limbGeometry(0.047, 0.033, D.shin), M.skin, `shin-${tag}`))
    const sock = mesh(limbGeometry(0.039, 0.036, 0.1), M.sock, `sock-${tag}`)
    sock.position.y = -D.shin + 0.1
    knee.add(sock)
    const ankle = joint(`ankle-${tag}`, knee, 0, -D.shin, 0)
    // trainer: a rounded upper over a flat, slightly wider sole, toe a little lower than the heel collar
    const shoe = mesh(new THREE.SphereGeometry(1, 32, 20), M.shoe, `shoe-${tag}`)
    shoe.scale.set(0.05, 0.045, 0.13)
    shoe.position.set(0, -0.034, 0.05)
    ankle.add(shoe)
    const sole = mesh(new THREE.CylinderGeometry(1, 1, 0.022, 40), M.sole, `sole-${tag}`)
    sole.scale.set(0.05, 1, 0.13)
    sole.position.set(0, -0.064, 0.05)
    ankle.add(sole)
    sides[tag] = { shoulder, elbow, wrist, hip, knee, ankle, shoe, sole, hand }
  }

  const q = new THREE.Quaternion()
  const parentQ = new THREE.Quaternion()

  /**
   * Pose by anatomical angles (radians): stance (hip abduction), hip / knee flexion per leg,
   * pelvis tilt and waist lean (forward), neck (negative looks up), shoulder flexion and
   * adduction, elbow flexion. Feet are then laid flat and the figure set down on y = 0.
   */
  function pose(p) {
    const P = { stance: 0.08, hipL: 0.1, hipR: 0.1, kneeL: 0.15, kneeR: 0.15, tilt: 0, lean: 0, neck: 0, shoulder: 0.1, adduct: 0.05, elbow: 0.1, wristUp: 0, heel: 0, ...p }
    root.position.y = 0 // x and z stay where the scene put the figure
    pelvis.rotation.set(0, 0, 0)
    waist.rotation.set(P.tilt + P.lean * 0.45, 0, 0)
    chest.rotation.set(P.lean * 0.55, 0, 0)
    neck.rotation.set(P.neck * 0.5, 0, 0)
    head.rotation.set(P.neck * 0.5, 0, 0)
    for (const tag of ['l', 'r']) {
      const s = tag === 'l' ? 1 : -1
      const side = sides[tag]
      side.hip.rotation.set(-(tag === 'l' ? P.hipL : P.hipR), 0, s * P.stance)
      side.knee.rotation.set(tag === 'l' ? P.kneeL : P.kneeR, 0, 0)
      side.shoulder.rotation.set(-P.shoulder, 0, -s * P.adduct)
      side.elbow.rotation.set(-P.elbow, 0, 0)
      side.wrist.rotation.set(P.wristUp, 0, 0)
    }
    root.updateMatrixWorld(true)
    // feet flat on the floor (or up on the toes by `heel`)
    root.getWorldQuaternion(q)
    for (const tag of ['l', 'r']) {
      const a = sides[tag].ankle
      a.parent.getWorldQuaternion(parentQ)
      a.quaternion.copy(parentQ.invert().multiply(q))
      if (P.heel) a.rotateX(P.heel)
    }
    root.updateMatrixWorld(true)
    let minY = Infinity
    const box = new THREE.Box3()
    for (const tag of ['l', 'r']) {
      box.setFromObject(sides[tag].sole)
      minY = Math.min(minY, box.min.y)
    }
    root.position.y = -minY
    root.updateMatrixWorld(true)
  }

  /** World point on the top of both forearms, `fromWrist` metres above the wrists, and the platform normal. */
  function platform(fromWrist = 0.07) {
    const pts = []
    const dirs = []
    for (const tag of ['l', 'r']) {
      const { elbow, wrist } = sides[tag]
      const e = elbow.getWorldPosition(new THREE.Vector3())
      const w = wrist.getWorldPosition(new THREE.Vector3())
      const d = w.clone().sub(e).normalize()
      pts.push(w.clone().addScaledVector(d, -fromWrist))
      dirs.push(d)
    }
    const point = pts[0].add(pts[1]).multiplyScalar(0.5)
    const along = dirs[0].add(dirs[1]).normalize()
    const lateral = new THREE.Vector3(1, 0, 0).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()))
    const normal = new THREE.Vector3().crossVectors(along, lateral).normalize()
    if (normal.y < 0) normal.negate()
    return { point, normal, along }
  }

  return {
    group: root,
    joints: { pelvis, waist, chest, neck, head, ...Object.fromEntries(Object.entries(sides).flatMap(([t, s]) => Object.entries(s).map(([k, v]) => [`${k}-${t}`, v]))) },
    pose,
    platform,
    ears,
    dispose() {
      disposables.forEach((d) => d.dispose?.())
    },
  }
}

/** Volleyball: 18 panels, three strips on each face of a cube mapped to the sphere, yellow with blue (and two white) middles. */
export function volleyballTexture(size = 1024) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size / 2
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(size, size / 2)
  const colors = { y: [246, 196, 33], b: [31, 84, 168], w: [247, 246, 240] }
  const seam = [70, 62, 52]
  for (let j = 0; j < size / 2; j += 1) {
    const lat = Math.PI * (0.5 - j / (size / 2))
    for (let i = 0; i < size; i += 1) {
      const lon = 2 * Math.PI * (i / size)
      const x = Math.cos(lat) * Math.cos(lon)
      const y = Math.sin(lat)
      const z = Math.cos(lat) * Math.sin(lon)
      const ax = Math.abs(x)
      const ay = Math.abs(y)
      const az = Math.abs(z)
      let face
      let u
      if (ax >= ay && ax >= az) {
        face = x > 0 ? 0 : 1
        u = y / ax
      } else if (ay >= az) {
        face = y > 0 ? 2 : 3
        u = z / ay
      } else {
        face = z > 0 ? 4 : 5
        u = x / az
      }
      // three strips across each face; the middle one changes colour with the face
      // a yellow ball with blue middle strips (two thirds yellow): reads as "yellow volleyball"
      const strip = u < -1 / 3 ? 0 : u > 1 / 3 ? 2 : 1
      const key = strip === 1 ? (face === 4 || face === 5 ? 'w' : 'b') : 'y'
      let c = colors[key]
      const edge = Math.min(Math.abs(Math.abs(u) - 1 / 3), 1 - Math.max(ax, ay, az) / Math.max(ax, ay, az) + 1)
      const faceEdge = Math.max(ax, ay, az) - [ax, ay, az].sort((a, b) => b - a)[1]
      if (edge < 0.018 || faceEdge < 0.02) c = seam
      const k = (j * size + i) * 4
      img.data[k] = c[0]
      img.data[k + 1] = c[1]
      img.data[k + 2] = c[2]
      img.data[k + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}
