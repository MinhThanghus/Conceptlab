import { createMannequin, KIT } from './sportsAthlete.js'
import { LABEL_FONT, SIM_PALETTE } from '../kit.js'
import { courtOf, courtShapes, viewBox } from '../../../features/blocks/field/courts.js'

const WORLD_LENGTH = 6
// the 2D board's inks (field.css): [surface, surround, line ink, zone] as palette keys
const COURT_INKS = {
  football: ['hill2', 'paper2', 'mintInk', 'mintInk'], futsal: ['sugar', 'blueSoft', 'blueDeep', 'blueDeep'],
  volleyball: ['sandSoft', 'sugar', 'kraftInk', 'kraft'], basketball: ['sandSoft', 'paper2', 'kraftInk', 'coralDeep'],
  badminton: ['hill1', 'paper2', 'mintInk', 'mintInk'],
}
// teams keep the board's colours: A blue, B coral-deep
const teamColor = (palette, team) => (team === 'B' ? palette.coralDeep : palette.blue)
const paletteOf = (group) => group?.userData?.palette || SIM_PALETTE

export function sportsCoordinates(sport, x, y) {
  const c = courtOf(sport)
  return { x: (x - .5) * WORLD_LENGTH, z: (y - .5) * WORLD_LENGTH * c.width / c.length }
}

/** Reuse the exact vector court templates, including arcs, sidelines and service zones. */
export function courtTexture(THREE, sport, palette = SIM_PALETTE) {
  const vb = viewBox(sport), c = courtOf(sport)
  const [surface, surround, ink, zone] = (COURT_INKS[sport] || COURT_INKS.football).map((key) => palette[key] || SIM_PALETTE[key])
  const canvas = document.createElement('canvas')
  canvas.width = 2048
  canvas.height = Math.round(2048 * vb.height / vb.width)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  const scale = canvas.width / vb.width
  ctx.scale(scale, scale)
  ctx.translate(-vb.x, -vb.y)
  ctx.fillStyle = surround
  ctx.fillRect(vb.x, vb.y, vb.width, vb.height)
  for (const s of courtShapes(sport)) {
    ctx.save()
    const path = s.type === 'path' ? new Path2D(s.d) : new Path2D()
    if (s.type === 'rect') path.rect(s.x, s.y, s.w, s.h)
    if (s.type === 'line') { path.moveTo(s.x1, s.y1); path.lineTo(s.x2, s.y2) }
    if (s.type === 'circle') { path.arc(s.cx, s.cy, s.r, 0, Math.PI * 2) }
    ctx.lineWidth = Math.max(c.length * .0021, .04)
    ctx.strokeStyle = ink
    ctx.fillStyle = surface
    if (s.cls === 'fb-freezone') ctx.fillStyle = surround
    if (s.cls === 'fb-stripe') { ctx.fillStyle = ink; ctx.globalAlpha = .05 }
    if (s.cls === 'fb-zone') { ctx.fillStyle = zone; ctx.globalAlpha = .1 }
    if (['fb-surface', 'fb-freezone', 'fb-stripe', 'fb-zone'].includes(s.cls)) ctx.fill(path)
    else if (s.cls === 'fb-mark' || s.cls === 'fb-post') { ctx.fillStyle = ink; ctx.fill(path) }
    else {
      if (s.cls === 'fb-line-dash') ctx.setLineDash([c.length * .012, c.length * .009])
      ctx.stroke(path)
    }
    ctx.restore()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function material(THREE, color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: .75, ...extra }) }
function box(THREE, group, dims, position, color, extra = {}) {
  const item = new THREE.Mesh(new THREE.BoxGeometry(...dims), material(THREE, color, extra))
  item.position.set(...position); group.add(item); return item
}
function bar(THREE, group, from, to, radius, color) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), direction = b.clone().sub(a)
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 10), material(THREE, color))
  mesh.position.copy(a).add(b).multiplyScalar(.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
  group.add(mesh)
}

function addNet(THREE, group, width, height, bottomRatio = .52, palette = SIM_PALETTE) {
  const bottom = height * bottomRatio, netHeight = height - bottom
  const net = new THREE.Mesh(new THREE.PlaneGeometry(width, netHeight), new THREE.MeshBasicMaterial({ color: palette.card, transparent: true, opacity: .08, side: THREE.DoubleSide, depthWrite: false }))
  net.rotation.y = Math.PI / 2; net.position.y = (height + bottom) / 2; group.add(net)
  for (const z of [-width / 2, width / 2]) bar(THREE, group, [0, 0, z], [0, height + .08, z], .022, palette.ink2)
  const segments = []
  for (let i = 0; i <= 6; i += 1) {
    const y = bottom + netHeight * i / 6; segments.push(0, y, -width / 2, 0, y, width / 2)
  }
  for (let i = 0; i <= 24; i += 1) {
    const z = -width / 2 + width * i / 24; segments.push(0, bottom, z, 0, height, z)
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(segments, 3))
  group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: palette.card, transparent: true, opacity: .85 })))
  bar(THREE, group, [0, height, -width / 2], [0, height, width / 2], .012, palette.card)
}

function goalNet(THREE, group, x, width, height, depth, palette = SIM_PALETTE) {
  const back = x + Math.sign(x) * depth
  const points = []
  const line = (a, b) => points.push(...a, ...b)
  for (let i = 0; i <= 12; i += 1) {
    const z = -width / 2 + width * i / 12
    line([x, height, z], [back, height * .85, z]); line([back, height * .85, z], [back, 0, z])
  }
  for (let i = 0; i <= 5; i += 1) {
    const y = height * i / 5
    line([back, y * .85, -width / 2], [back, y * .85, width / 2])
    for (const z of [-width / 2, width / 2]) line([x, y, z], [back, y * .85, z])
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  group.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: palette.card, transparent: true, opacity: .8 })))
}

/** The court as a card-stock slab on the studio paper, printed with the 2D board's own template and inks. */
export function buildSportsVenue(THREE, sport, palette = SIM_PALETTE) {
  const group = new THREE.Group(), court = courtOf(sport), vb = viewBox(sport), scale = WORLD_LENGTH / court.length
  const width = vb.width * scale, depth = vb.height * scale
  box(THREE, group, [width, .16, depth], [0, -.09, 0], palette.edge)
  const texture = courtTexture(THREE, sport, palette)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material(THREE, '#ffffff', { map: texture, roughness: .88 }))
  floor.rotation.x = -Math.PI / 2; floor.position.y = .003; group.add(floor)
  if (sport === 'volleyball' || sport === 'badminton') {
    addNet(THREE, group, court.width * scale, (sport === 'volleyball' ? 2.43 : 1.55) * scale, sport === 'volleyball' ? .59 : .50, palette)
  }
  if (sport === 'football' || sport === 'futsal') {
    const goalWidth = (sport === 'football' ? 7.32 : 3) * scale, goalHeight = (sport === 'football' ? 2.44 : 2) * scale
    for (const x of [-3, 3]) {
      for (const z of [-goalWidth / 2, goalWidth / 2]) bar(THREE, group, [x, 0, z], [x, goalHeight, z], .022, palette.card)
      bar(THREE, group, [x, goalHeight, -goalWidth / 2], [x, goalHeight, goalWidth / 2], .022, palette.card)
      goalNet(THREE, group, x, goalWidth, goalHeight, Math.max(.18, goalWidth * .24), palette)
    }
  }
  if (sport === 'basketball') {
    for (const x of [-3, 3]) {
      const y = 3.05 * scale
      bar(THREE, group, [x, 0, 0], [x, y + .22, 0], .035, palette.ink2)
      box(THREE, group, [.035, .23, 1.8 * scale], [x, y + .1, 0], palette.card)
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(.225 * scale, .018, 8, 24), material(THREE, palette.coral))
      hoop.rotation.x = Math.PI / 2; hoop.position.set(x + (x < 0 ? .2 : -.2), y, 0); group.add(hoop)
      const hoopNet = new THREE.Mesh(new THREE.CylinderGeometry(.225 * scale, .12 * scale, .28 * scale, 12, 3, true),
        new THREE.MeshBasicMaterial({ color: palette.card, wireframe: true, transparent: true, opacity: .72, side: THREE.DoubleSide }))
      hoopNet.position.set(hoop.position.x, y - .14 * scale, 0); group.add(hoopNet)
    }
  }
  return group
}

export function disposeSports(group) {
  const geometries = new Set(), materials = new Set(), textures = new Set()
  group?.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry)
    for (const mat of Array.isArray(object.material) ? object.material : [object.material]) if (mat) { materials.add(mat); if (mat.map) textures.add(mat.map) }
  })
  geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose()); textures.forEach((t) => t.dispose())
}

/** The player's number on a team-coloured bead (a ghost: card with the team's ring), Lexend, drawn at 2x. */
function badge(THREE, label, team, ghost, palette = SIM_PALETTE) {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  const color = teamColor(palette, team)
  ctx.fillStyle = ghost ? palette.card : color
  ctx.beginPath(); ctx.arc(64, 64, 57, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = ghost ? color : palette.card; ctx.lineWidth = ghost ? 7 : 5; ctx.stroke()
  ctx.fillStyle = ghost ? palette.ink : palette.paper; ctx.font = `700 ${String(label).length > 2 ? 42 : 56}px ${LABEL_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label || '?', 64, 66)
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false }))
  sprite.position.set(0, ghost ? .15 : .59, 0); sprite.scale.set(.26, .26, 1)
  return sprite
}

// People are illustrative, enlarged figures; their pose is not inferred from the 2D data.
const POSES = {
  football: { stance: .18, hipL: .38, hipR: -.18, kneeL: .68, kneeR: .30, tilt: .1, lean: .12, shoulder: .42, elbow: .8 },
  futsal: { stance: .16, hipL: .28, hipR: -.12, kneeL: .58, kneeR: .32, tilt: .1, lean: .15, shoulder: .48, elbow: .78 },
  basketball: { stance: .19, hipL: .42, hipR: .24, kneeL: .68, kneeR: .52, tilt: .1, lean: .12, shoulder: .72, adduct: .12, elbow: 1.05 },
  badminton: { stance: .22, hipL: .38, hipR: .2, kneeL: .65, kneeR: .45, tilt: .1, lean: .15, shoulder: .68, adduct: .25, elbow: .8 },
  volleyball: { stance: .15, hipL: .5, hipR: .4, kneeL: .75, kneeR: .7, tilt: .12, lean: .2, shoulder: .75, adduct: .25, elbow: .08 },
}

function badmintonRacket(THREE, wrist, palette = SIM_PALETTE) {
  const racket = new THREE.Group()
  bar(THREE, racket, [0, -.06, 0], [0, -.36, 0], .012, palette.ink2)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.105, .012, 8, 32), material(THREE, palette.pearDeep))
  rim.scale.set(.77, 1.15, 1); rim.position.y = -.44; racket.add(rim)
  const wire = material(THREE, palette.card)
  for (const x of [-.04, 0, .04]) {
    const line = new THREE.Mesh(new THREE.CylinderGeometry(.0025, .0025, .19, 5), wire)
    line.position.set(x, -.44, 0); racket.add(line)
  }
  racket.rotation.set(.2, 0, -.5); wrist.add(racket)
}

function player(THREE, p, ghost, sport, palette = SIM_PALETTE) {
  const group = new THREE.Group(), color = teamColor(palette, p.team)
  if (!ghost) {
    const model = createMannequin({ kit: { ...KIT, shirt: color, shorts: palette.ink2, trim: palette.card, sock: palette.card, pad: sport === 'volleyball' ? palette.ink2 : KIT.skin } })
    model.pose(POSES[sport] || POSES.football)
    model.joints['shoulder-r'].rotation.x -= .32
    model.joints['elbow-r'].rotation.x -= .25
    if (sport === 'football' || sport === 'futsal') {
      model.joints['shoulder-l'].rotation.x += .8
      model.joints['shoulder-l'].rotation.z += .22
    }
    if (sport === 'badminton') badmintonRacket(THREE, model.joints['wrist-r'], palette)
    model.group.scale.setScalar(.31)
    model.group.rotation.y = p.team === 'B' ? -Math.PI / 2 : Math.PI / 2
    group.add(model.group)
  } else {
    const ring = new THREE.Mesh(new THREE.RingGeometry(.12, .145, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .65, side: THREE.DoubleSide }))
    ring.rotation.x = -Math.PI / 2; ring.position.y = .025; group.add(ring)
  }
  group.add(badge(THREE, p.label || '?', p.team, ghost, palette))
  group.userData.signature = `${p.team}:${p.label || ''}:${ghost}:${sport}`
  return group
}

function makeSportBall(THREE, sport, palette = SIM_PALETTE) {
  if (sport === 'badminton') {
    const shuttle = new THREE.Group()
    const cork = new THREE.Mesh(new THREE.SphereGeometry(.045, 16, 10), material(THREE, palette.card))
    cork.position.y = .045; shuttle.add(cork)
    const feathers = new THREE.Mesh(new THREE.CylinderGeometry(.085, .032, .12, 12, 1, true), material(THREE, palette.card, { side: THREE.DoubleSide }))
    feathers.position.y = .12; shuttle.add(feathers)
    shuttle.scale.setScalar(.3)
    return shuttle
  }
  const ball = new THREE.Group(), radius = sport === 'basketball' ? .083 : .07
  const orange = new THREE.Color(palette.coral).lerp(new THREE.Color(palette.pear), .4)
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 24), material(THREE, sport === 'basketball' ? orange : palette.card))
  sphere.position.y = radius; ball.add(sphere)
  const seamColor = sport === 'basketball' ? palette.kraftInk : palette.ink2
  for (const angle of [0, Math.PI / 2]) {
    const seam = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.002, .0028, 4, 32), material(THREE, seamColor))
    seam.rotation.y = angle; seam.position.y = radius; ball.add(seam)
  }
  if (sport !== 'basketball') {
    for (const [x,y,z] of [[0,.07,.065], [.055,.10,.03], [-.055,.04,.03]]) {
      const patch = new THREE.Mesh(new THREE.SphereGeometry(.019, 8, 6), material(THREE, seamColor))
      patch.position.set(x,y,z); ball.add(patch)
    }
  }
  ball.scale.setScalar(.55)
  return ball
}

/** Reconcile token groups in place: playback moves positions without allocating every frame. */
export function updateSportsFrame(THREE, group, sport, frame, ghost) {
  const wanted = new Map()
  for (const [prefix, current, isGhost] of [['p', frame, false], ['g', ghost, true]]) {
    for (const p of current?.players || []) wanted.set(`${prefix}:${p.id}`, { p, isGhost })
  }
  const objects = group.userData.players || new Map()
  for (const [key, existing] of objects) if (!wanted.has(key)) { group.remove(existing); disposeSports(existing); objects.delete(key) }
  for (const [key, { p, isGhost }] of wanted) {
    let item = objects.get(key)
    const signature = `${p.team}:${p.label || ''}:${isGhost}:${sport}`
    if (item && item.userData.signature !== signature) { group.remove(item); disposeSports(item); objects.delete(key); item = null }
    if (!item) { item = player(THREE, p, isGhost, sport, paletteOf(group)); objects.set(key, item); group.add(item) }
    const pos = sportsCoordinates(sport, p.x, p.y); item.position.set(pos.x, .02, pos.z)
  }
  group.userData.players = objects
  if (!group.userData.ball) {
    const ball = makeSportBall(THREE, sport, paletteOf(group))
    group.userData.ball = ball; group.add(ball)
  }
  const ball = group.userData.ball
  ball.visible = Boolean(frame?.ball)
  if (frame?.ball) { const pos = sportsCoordinates(sport, frame.ball.x, frame.ball.y); ball.position.set(pos.x, 0, pos.z) }
  if (!group.userData.ghostBall) {
    const marker = new THREE.Mesh(new THREE.RingGeometry(.09, .12, 24), new THREE.MeshBasicMaterial({ color: paletteOf(group).card, transparent: true, opacity: .75, side: THREE.DoubleSide }))
    marker.rotation.x = -Math.PI / 2; group.userData.ghostBall = marker; group.add(marker)
  }
  const ghostBall = group.userData.ghostBall
  ghostBall.visible = Boolean(ghost?.ball)
  if (ghost?.ball) { const pos = sportsCoordinates(sport, ghost.ball.x, ghost.ball.y); ghostBall.position.set(pos.x, .03, pos.z) }
  const arrows = frame?.arrows || [], ghostArrows = ghost?.arrows || []
  const arrowKey = JSON.stringify([arrows, ghostArrows])
  if (arrowKey !== group.userData.arrowKey) {
    if (group.userData.arrows) { group.remove(group.userData.arrows); disposeSports(group.userData.arrows) }
    const arrowGroup = new THREE.Group()
    for (const [arrow, isGhost] of [...arrows.map((a) => [a, false]), ...ghostArrows.map((a) => [a, true])]) {
      const a = sportsCoordinates(sport, arrow.x1, arrow.y1), b = sportsCoordinates(sport, arrow.x2, arrow.y2)
      const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x, .035, a.z), new THREE.Vector3(b.x, .035, b.z)])
      const color = arrow.kind === 'run' ? paletteOf(group).ink : paletteOf(group).pearDeep
      const dashed = arrow.kind === 'run' || isGhost
      const options = { color, transparent: isGhost, opacity: isGhost ? .55 : 1 }
      const line = new THREE.Line(geometry, dashed ? new THREE.LineDashedMaterial({ ...options, dashSize: .14, gapSize: .10 }) : new THREE.LineBasicMaterial(options))
      if (dashed) line.computeLineDistances()
      arrowGroup.add(line)
      const head = new THREE.Mesh(new THREE.ConeGeometry(.085, .18, 10), new THREE.MeshBasicMaterial(options))
      head.position.set(b.x, .06, b.z); head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize())
      arrowGroup.add(head)
    }
    group.add(arrowGroup); group.userData.arrows = arrowGroup; group.userData.arrowKey = arrowKey
  }
}
