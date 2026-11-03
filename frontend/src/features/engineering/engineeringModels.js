/** Procedural teaching models. Geometry and sizes are illustrative, not study data. */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { SIM_PALETTE, studioMaterial } from '../../lib/three/kit.js'
import { thrustComponents } from './engineeringMath.js'

function resources() {
  const items = new Set()
  return { keep: (value) => { items.add(value); return value }, dispose: () => items.forEach((item) => item.dispose?.()) }
}

function box(keep, width, height, depth, material, x, y, z, name, round = 0) {
  const geometry = round > 0 ? new RoundedBoxGeometry(width, height, depth, 3, Math.min(round, width / 2, height / 2, depth / 2)) : new THREE.BoxGeometry(width, height, depth)
  const mesh = new THREE.Mesh(keep(geometry), material)
  mesh.position.set(x, y, z)
  mesh.name = name
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function cylinderBetween(keep, from, to, radius, material, name) {
  const delta = to.clone().sub(from)
  const mesh = new THREE.Mesh(keep(new THREE.CylinderGeometry(radius, radius, delta.length(), 20)), material)
  mesh.position.copy(from).add(to).multiplyScalar(.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize())
  mesh.name = name
  mesh.castShadow = true
  return mesh
}

/** A force or light arrow in one studio colour: a shaft and a cone, lit like the model. */
function makeVector(keep, material, name) {
  const group = new THREE.Group()
  group.name = name
  const shaft = new THREE.Mesh(keep(new THREE.CylinderGeometry(.03, .03, 1, 16)), material)
  const tip = new THREE.Mesh(keep(new THREE.ConeGeometry(.095, .2, 24)), material)
  shaft.castShadow = true
  tip.castShadow = true
  group.add(shaft, tip)
  return {
    group,
    material,
    set(direction, length) {
      group.visible = length > .015
      const shaftLength = Math.max(.01, length - .16)
      shaft.scale.y = shaftLength
      shaft.position.y = shaftLength / 2
      tip.position.y = shaftLength + .085
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize())
    },
  }
}

/**
 * A quadrotor in the studio's inks: an ink frame, light steel motors, sugar-blue rotor discs and
 * pear hubs. The three force arrows keep the legend's colours: pear-deep for the total thrust, blue
 * for the vertical component, coral for the horizontal one.
 */
export function createQuadrotorModel(palette = SIM_PALETTE) {
  const { keep, dispose } = resources()
  const group = new THREE.Group()
  group.name = 'quadrotor-teaching-model'
  const craft = new THREE.Group()
  craft.name = 'quadrotor-body'
  craft.position.y = 1.35
  group.add(craft)
  const frame = keep(studioMaterial('structure', palette))
  const steel = keep(studioMaterial('steel', palette))
  const prop = keep(studioMaterial('sugar', palette, { roughness: .45 }))
  const accent = keep(studioMaterial('pear', palette))
  craft.add(box(keep, .73, .26, .65, frame, 0, 0, 0, 'body', .06))
  craft.add(box(keep, .48, .12, .43, steel, 0, .18, 0, 'top-cover', .04))
  craft.add(box(keep, .22, .07, .09, accent, 0, .24, -.20, 'front-mark', .025))
  for (const [x, z] of [[-1.04, -1.04], [1.04, -1.04], [-1.04, 1.04], [1.04, 1.04]]) {
    craft.add(cylinderBetween(keep, new THREE.Vector3(0, 0, 0), new THREE.Vector3(x, 0, z), .065, frame, 'arm'))
    const motor = new THREE.Group()
    motor.name = 'motor-and-rotor'
    motor.position.set(x, .02, z)
    const motorBody = new THREE.Mesh(keep(new THREE.CylinderGeometry(.14, .16, .19, 32)), steel)
    motorBody.castShadow = true
    motor.add(motorBody)
    const hub = new THREE.Mesh(keep(new THREE.CylinderGeometry(.055, .055, .12, 24)), accent)
    hub.position.y = .15
    motor.add(hub)
    const rotor = new THREE.Group()
    rotor.name = 'rotor'
    rotor.position.y = .18
    rotor.rotation.y = .42
    rotor.add(box(keep, .9, .035, .10, prop, 0, 0, 0, 'rotor-blade', .015))
    const rim = new THREE.Mesh(keep(new THREE.TorusGeometry(.49, .025, 12, 64)), frame)
    rim.rotation.x = Math.PI / 2
    rim.position.y = .16
    motor.add(rim, rotor)
    craft.add(motor)
  }
  for (const z of [-.42, .42]) {
    craft.add(cylinderBetween(keep, new THREE.Vector3(-.32, -.22, z), new THREE.Vector3(.32, -.22, z), .035, steel, 'landing-foot'))
    for (const x of [-.25, .25]) craft.add(cylinderBetween(keep, new THREE.Vector3(x, -.07, z * .7), new THREE.Vector3(x, -.22, z), .027, steel, 'landing-leg'))
  }

  const thrust = makeVector(keep, keep(studioMaterial('small', palette, { emissive: palette.pearDeep, emissiveIntensity: .15 })), 'total-thrust-vector')
  const vertical = makeVector(keep, keep(studioMaterial('blue', palette, { emissive: palette.blue, emissiveIntensity: .12 })), 'vertical-component')
  const horizontal = makeVector(keep, keep(studioMaterial('moving', palette)), 'horizontal-component')
  thrust.group.position.set(.08, 1.58, .04)
  vertical.group.position.set(-.17, 1.58, .16)
  horizontal.group.position.set(.10, 1.58, .16)
  group.add(thrust.group, vertical.group, horizontal.group)
  function update({ tilt, force }) {
    const theta = Number(tilt) * Math.PI / 180
    craft.rotation.z = -theta
    const { vertical: fy, horizontal: fx } = thrustComponents(force, tilt)
    const scale = .13
    thrust.set(new THREE.Vector3(Math.sin(theta), Math.cos(theta), 0), Number(force) * scale)
    vertical.set(new THREE.Vector3(0, 1, 0), fy * scale)
    horizontal.set(new THREE.Vector3(fx < 0 ? -1 : 1, 0, 0), Math.abs(fx) * scale)
  }
  update({ tilt: 15, force: 8 })
  return { group, update, dispose }
}

/**
 * A layered solar panel in the studio's inks: a paper-3 backsheet in a steel frame, deep blue
 * cells with light metal fingers and busbars, a pear-soft encapsulant, sugar glass on top, pear
 * light rays, and the illustrative crack as the one coral detail.
 */
export function createSolarCellModel(palette = SIM_PALETTE) {
  const { keep, dispose } = resources()
  const group = new THREE.Group()
  group.name = 'solar-cell-teaching-model'
  const glass = keep(studioMaterial('glass', palette, { opacity: .32, side: THREE.DoubleSide }))
  const encapsulant = keep(studioMaterial('pearSoft', palette, { transparent: true, opacity: .55, depthWrite: false }))
  const back = keep(studioMaterial('base', palette))
  const cell = keep(studioMaterial('blueDeep', palette, { roughness: .32, metalness: .2 }))
  const edge = keep(studioMaterial('steel', palette))
  const conductor = keep(studioMaterial('metal', palette, { color: palette.card }))
  const cracks = keep(new THREE.MeshBasicMaterial({ color: palette.coral }))
  const panel = new THREE.Group()
  panel.name = 'layered-solar-panel'
  panel.rotation.x = -.18
  panel.position.y = 1.0
  group.add(panel)
  const substrate = new THREE.Group(); substrate.name = 'backsheet'
  substrate.add(box(keep, 3.8, .12, 2.5, back, 0, 0, 0, 'backsheet-surface', .03))
  for (const z of [-1.21, 1.21]) substrate.add(box(keep, 3.9, .16, .08, edge, 0, .07, z, 'outer-frame', .02))
  for (const x of [-1.91, 1.91]) substrate.add(box(keep, .08, .16, 2.5, edge, x, .07, 0, 'outer-frame', .02))
  const cells = new THREE.Group(); cells.name = 'cells-and-contacts'
  for (let x = 0; x < 3; x++) for (let z = 0; z < 2; z++) {
    const cx = (x - 1) * 1.19, cz = (z - .5) * 1.14
    cells.add(box(keep, 1.13, .075, 1.08, cell, cx, 0, cz, 'silicon-cell', .015))
    for (let i = -3; i <= 3; i++) cells.add(box(keep, .012, .008, 1.02, conductor, cx + i * .14, .045, cz, 'conductive-finger'))
    for (const dx of [-.24, .24]) cells.add(box(keep, .038, .012, 1.04, conductor, cx + dx, .05, cz, 'busbar'))
  }
  const crack = new THREE.Group(); crack.name = 'illustrative-crack'
  const path = [[-.46, 0, -.42], [-.28, 0, -.25], [-.33, 0, -.12], [-.08, 0, .02], [-.14, 0, .20], [.18, 0, .38]]
  for (let i = 0; i < path.length - 1; i++) {
    const a = new THREE.Vector3(path[i][0], .065, path[i][2] - .57)
    const b = new THREE.Vector3(path[i + 1][0], .065, path[i + 1][2] - .57)
    crack.add(cylinderBetween(keep, a, b, .024, cracks, 'crack-segment'))
  }
  cells.add(crack)
  const film = new THREE.Group(); film.name = 'encapsulant'
  film.add(box(keep, 3.66, .055, 2.32, encapsulant, 0, 0, 0, 'encapsulant-sheet'))
  const cover = new THREE.Group(); cover.name = 'glass'
  cover.add(box(keep, 3.72, .075, 2.38, glass, 0, 0, 0, 'glass-cover', .02))
  panel.add(substrate, cells, film, cover)
  const rays = new THREE.Group(); rays.name = 'illustrative-sunlight'
  const rayArrows = []
  const rayMaterial = keep(studioMaterial('pear', palette, { emissive: palette.pear, emissiveIntensity: .25 }))
  for (let x = -1; x <= 1; x++) {
    const start = new THREE.Vector3(x * .8 + .45, 3.2, -.35)
    const end = new THREE.Vector3(x * .8, 1.85, -.35)
    const arrow = makeVector(keep, rayMaterial, 'sunlight-ray')
    arrow.group.position.copy(start)
    arrow.set(end.clone().sub(start), start.distanceTo(end))
    rays.add(arrow.group)
    rayArrows.push(arrow)
  }
  group.add(rays)
  function update({ separation, cracked, light }) {
    const spread = Number(separation) / 100 * .85
    substrate.position.y = -.15
    cells.position.y = .02 + spread * .55
    film.position.y = .12 + spread * 1.05
    cover.position.y = .20 + spread * 1.55
    crack.visible = Boolean(cracked)
    rays.visible = Number(light) > 0
    rayMaterial.transparent = true
    rayMaterial.opacity = Math.max(.12, Number(light) / 100)
    rayMaterial.depthWrite = rayMaterial.opacity > .98
  }
  update({ separation: 32, cracked: false, light: 70 })
  return { group, update, dispose }
}
