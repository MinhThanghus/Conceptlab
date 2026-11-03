/**
 * Educational scenes: generated geometry, never research measurements or reconstructions.
 * No static imports (the 2D fallback must not pull Three.js in): the scene gets THREE and a
 * `material(role, overrides)` maker, normally kit.studioMaterial bound to the page's tokens.
 */
export const POPULATION_GRID = [1, 2, 1, 1, 0, 2, 3, 4, 2, 1, 1, 4, 5, 3, 1, 1, 2, 3, 2, 1, 0, 1, 1, 1, 0]

// the studio roles' token colours in sRGB, for a caller that passes no maker (kit.SIM_PALETTE)
const ROLE_COLORS = { blue: '#0064be', blueDeep: '#0051a6', sugar: '#c6dfef', mint: '#70e093', pear: '#f7d21a', small: '#c9a000', card: '#fcfbf6', edge: '#d2c6aa', rule: '#c2beb0' }
const plainMaterial = (THREE) => (role, overrides = {}) => new THREE.MeshStandardMaterial({ color: ROLE_COLORS[role] || ROLE_COLORS.card, roughness: .6, ...overrides })

function mesh(THREE, group, geometry, material, position) {
  const item = new THREE.Mesh(geometry, material)
  item.position.set(...position)
  group.add(item)
  return item
}

/**
 * An abstract, lobed enzyme with an indented binding pocket; not a molecular structure.
 * Studio roles: the enzyme in deep blue, the active site in mint, the substrates in pear and pear-deep.
 */
export function enzymeBindingScene(THREE, value, phase = 'approach', material = plainMaterial(THREE)) {
  const group = new THREE.Group()
  // Sculpt a continuous organic silhouette with an actual concave pocket.
  const shape = new THREE.SphereGeometry(1, 72, 48)
  const positions = shape.attributes.position
  const pocket = new THREE.Vector3(.3, .54, .79).normalize()
  for (let i = 0; i < positions.count; i += 1) {
    const p = new THREE.Vector3(positions.getX(i), positions.getY(i), positions.getZ(i)).normalize()
    const folds = .07 * Math.sin(p.x * 9 + p.y * 4) * Math.cos(p.z * 8) + .04 * Math.sin(p.y * 12 - p.z * 5)
    const dent = .30 * Math.exp(-(1 - p.dot(pocket)) * 26)
    const r = 1 + folds - dent
    positions.setXYZ(i, p.x * r * 1.28, p.y * r * .74, p.z * r * .78)
  }
  shape.computeVertexNormals()
  mesh(THREE, group, shape, material('blueDeep', { roughness: .68 }), [0, .9, 0])
  const rim = mesh(THREE, group, new THREE.TorusGeometry(.21, .034, 14, 48), material('mint', { roughness: .45 }), [.34, 1.27, .55])
  rim.rotation.set(-.45, .25, 0)
  // Paired spheres symbolize substrates; count is a teaching input.
  const big = material('small')
  const small = material('pear')
  for (let i = 0; i < value; i += 1) {
    const substrate = new THREE.Group()
    const a = i * Math.PI * 2 / 8 + .38
    if (i === 0) {
      const position = phase === 'binding' ? [.34, 1.29, .68] : phase === 'release' ? [1.15, 1.72, .8] : [1.02, 1.83, .8]
      substrate.position.set(...position)
    } else substrate.position.set(Math.cos(a) * 1.65, 1.24 + Math.sin(a * 1.7) * .32, Math.sin(a) * 1.12)
    substrate.rotation.z = a * .7
    const split = i === 0 && phase === 'release'
    mesh(THREE, substrate, new THREE.SphereGeometry(.11, 24, 18), big, [split ? -.25 : -.085, 0, 0])
    mesh(THREE, substrate, new THREE.SphereGeometry(.095, 24, 18), small, [split ? .25 : .09, .04, 0])
    group.add(substrate)
  }
  group.userData.phase = phase
  return group
}

/**
 * A made-up 5×5 grid. Tiles' height changes with the display scale, not the data.
 * A putty board with card streets; ordinary cells in sugar blue, the densest in blue.
 */
export function populationGridScene(THREE, value, _phase, material = plainMaterial(THREE)) {
  const group = new THREE.Group()
  const base = mesh(THREE, group, new THREE.BoxGeometry(3.35, .14, 3.35), material('edge'), [0, -.10, 0])
  base.receiveShadow = true
  // Grid margins/streets provide spatial context without implying real locations.
  const street = material('card')
  for (let i = -2; i <= 2; i += 1) {
    mesh(THREE, group, new THREE.BoxGeometry(3.14, .012, .025), street, [0, -.018, i * .6 + .3])
    mesh(THREE, group, new THREE.BoxGeometry(.025, .012, 3.14), street, [i * .6 + .3, -.018, 0])
  }
  const dense = material('blue')
  const sparse = material('sugar')
  const cells = []
  POPULATION_GRID.forEach((n, i) => {
    const height = .045 + n * value * .092
    const tile = mesh(THREE, group, new THREE.BoxGeometry(.48, height, .48), n >= 3 ? dense : sparse, [(i % 5 - 2) * .6, height / 2, (Math.floor(i / 5) - 2) * .6])
    cells.push(tile)
  })
  group.userData.cells = cells
  return group
}

export const researchSceneFactories = { enzyme_binding: enzymeBindingScene, population_grid: populationGridScene }
