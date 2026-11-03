import * as THREE from 'three'
import { SIM_PALETTE, studioMaterial } from '../../lib/three/kit.js'

function mesh(group, geometry, material, pos, name) {
  const m = new THREE.Mesh(geometry, material); m.position.set(...pos); m.name = name
  m.castShadow = true; m.receiveShadow = true; group.add(m); return m
}
const box = (g, size, m, p, n) => mesh(g, new THREE.BoxGeometry(...size), m, p, n)
const sphere = (g, r, m, p, n) => mesh(g, new THREE.SphereGeometry(r, 24, 16), m, p, n)
function branch(g, a, b, radius, material, name) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start)
  const m = mesh(g, new THREE.CylinderGeometry(radius * .7, radius, delta.length(), 10), material, start.add(end).multiplyScalar(.5).toArray(), name)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return m
}
function disposable(group, update) {
  return { group, update, dispose() {
    const geoms = new Set(), materials = new Set()
    group.traverse((o) => { if (o.geometry) geoms.add(o.geometry); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => materials.add(m)) })
    geoms.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose())
  } }
}

/**
 * A rice field cutaway in the studio's inks: kraft subsoil under deep kraft root-zone soil, sugar
 * water, pale hill-green bunds, mint-deep stems, leaf-green blades, pear-soft roots, mint microbes.
 */
export function agricultureModel(palette = SIM_PALETTE) {
  const group = new THREE.Group(); group.name = 'Agricultural soil cutaway'
  const soil = studioMaterial('kraftDeep', palette), deep = studioMaterial('wood', palette), green = studioMaterial('mintDeep', palette), leaf = studioMaterial('leaf', palette), root = studioMaterial('pearSoft', palette)
  box(group, [4.6, .65, 3.2], deep, [0, .4, 0], 'Subsoil')
  box(group, [4.6, .38, 3.2], soil, [0, .92, 0], 'Root-zone soil')
  const water = box(group, [4.5, .18, 3.1], studioMaterial('sugar', palette, { transparent: true, opacity: .62, roughness: .08, depthWrite: false }), [0, 1.18, 0], 'Surface water')
  const bund = studioMaterial('hill', palette, { roughness: .85 })
  for (const x of [-2.35, 2.35]) box(group, [.15, .33, 3.4], bund, [x, 1.18, 0], 'Field bund')
  box(group, [4.7, .33, .15], bund, [0, 1.18, -1.65], 'Back bund')
  const plants = []
  for (let i = 0; i < 24; i++) {
    const plant = new THREE.Group(); plant.name = `Plant ${i + 1}`
    const h = .65 + (i % 4) * .08
    branch(plant, [0, 0, 0], [0, h, 0], .025, green, 'Stem')
    for (let k = 0; k < 4; k++) {
      const angle = k * 1.7 + i
      branch(plant, [0, .12 + k * .09, 0], [.22 * Math.cos(angle), h * .8, .22 * Math.sin(angle)], .018, leaf, 'Rice blade')
    }
    for (let k = 0; k < 4; k++) {
      const angle = k * 1.57
      branch(plant, [0, -.04, 0], [.13 * Math.cos(angle), -.5, .13 * Math.sin(angle)], .016, root, 'Root')
    }
    group.add(plant); plants.push(plant)
  }
  for (let i = 0; i < 6; i++) {
    const x = -1.85 + i * .73
    branch(group, [x, 1.08, 1.63], [x, .42, 1.63], .016, root, 'Exposed root in front soil section')
    for (const direction of [-1, 1]) branch(group, [x, .9, 1.63], [x + direction * .19, .48, 1.63], .011, root, 'Exposed branch root')
  }
  // The front section exposes roots independently of the water surface.
  const microbes = new THREE.Group(); microbes.name = 'Illustrative root-zone microorganisms'; group.add(microbes)
  const microMat = studioMaterial('mint', palette)
  for (let i = 0; i < 30; i++) {
    const micro = sphere(microbes, .04, microMat, [-2 + (i % 10) * .44, .55 + Math.floor(i / 10) * .16, 1.66], 'Microorganism symbol')
    micro.scale.x = 1.9; micro.rotation.z = i * 1.3
  }
  return disposable(group, ({ waterStage = 'flooded', layout = 'rows', microbes: show = false, crop = 'rice' }) => {
    water.visible = waterStage !== 'drained'; water.scale.y = waterStage === 'draining' ? .25 : 1
    water.position.y = waterStage === 'draining' ? 1.11 : 1.18
    microbes.visible = show
    plants.forEach((p, i) => {
      const x = -1.85 + (i % 6) * .73, z = -1.12 + Math.floor(i / 6) * .72
      p.position.set(x + (layout === 'broadcast' ? Math.sin(i * 7) * .2 : 0), 1.1, z + (layout === 'broadcast' ? Math.cos(i * 3) * .18 : 0))
      p.scale.set(crop === 'maize' ? 1.4 : 1, crop === 'maize' ? 1.6 : 1, crop === 'maize' ? 1.4 : 1)
    })
  })
}

/**
 * A closed 1D channel in the studio's inks: a paper-3 trough between steel no-flux walls; each
 * site's bar rises with concentration B and deepens from sugar to blue (the linked chart's B).
 */
export function reactionModel(palette = SIM_PALETTE) {
  const group = new THREE.Group(); group.name = 'One-dimensional reaction diffusion teaching system'
  box(group, [5, .18, 1.6], studioMaterial('base', palette), [0, .28, 0], 'Closed demonstration channel')
  const wall = studioMaterial('steel', palette)
  box(group, [5.15, .36, .08], wall, [0, .5, -.85], 'No-flux channel boundary')
  box(group, [5.15, .36, .08], wall, [0, .5, .85], 'No-flux channel boundary')
  const low = new THREE.Color(palette.sugar), high = new THREE.Color(palette.blue)
  const bars = Array.from({ length: 41 }, (_, i) => box(group, [.105, 1, 1.3], studioMaterial('sugar', palette), [-2.4 + i * .12, .5, 0], `Concentration at site ${i}`))
  return disposable(group, ({ cells }) => bars.forEach((bar, i) => {
    const b = cells[i].b; bar.scale.y = .06 + b * 1.4; bar.position.y = .38 + bar.scale.y / 2
    bar.material.color.copy(low).lerp(high, Math.min(1, Math.max(0, b)))
  }))
}

/**
 * A conceptual carbon pore in the studio's inks: slate carbon walls, a sugar glass back wall,
 * kraft rings for the surface sites, CO₂ in slate and coral, water in coral and card.
 */
export function adsorptionModel(palette = SIM_PALETTE) {
  const group = new THREE.Group(); group.name = 'Conceptual carbon pore and surface sites'
  const carbon = studioMaterial('muted', palette, { roughness: .9 }), copper = studioMaterial('wood', palette, { roughness: .45, metalness: .2 }), oxygen = studioMaterial('moving', palette), hydrogen = studioMaterial('card', palette)
  box(group, [4.6, .42, 2.7], carbon, [0, .42, 0], 'Porous carbon lower wall')
  box(group, [.3, 1.75, 2.7], carbon, [-2.15, 1.3, 0], 'Left pore wall')
  box(group, [.3, 1.75, 2.7], carbon, [2.15, 1.3, 0], 'Right pore wall')
  box(group, [4.4, 1.75, .18], studioMaterial('glass', palette, { opacity: .3 }), [0, 1.3, -1.35], 'Back wall cutaway')
  const sites = []
  for (let i = 0; i < 24; i++) {
    const site = new THREE.Group(); site.position.set(-1.65 + (i % 6) * .66, .72, -.85 + Math.floor(i / 6) * .55); group.add(site)
    const ring = mesh(site, new THREE.TorusGeometry(.17, .016, 10, 32), copper, [0, 0, 0], 'Illustrative surface site'); ring.rotation.x = Math.PI / 2
    const co = new THREE.Group(); site.add(co)
    sphere(co, .09, carbon, [0, .13, 0], 'CO2 carbon'); sphere(co, .085, oxygen, [-.15, .13, 0], 'CO2 oxygen'); sphere(co, .085, oxygen, [.15, .13, 0], 'CO2 oxygen')
    const wat = new THREE.Group(); site.add(wat)
    sphere(wat, .095, oxygen, [0, .13, 0], 'Water oxygen'); sphere(wat, .055, hydrogen, [-.09, .2, .03], 'Water hydrogen'); sphere(wat, .055, hydrogen, [.09, .2, .03], 'Water hydrogen')
    sites.push({ co, wat })
  }
  return disposable(group, ({ occupancy, separation = 0 }) => {
    sites.forEach(({ co, wat }, i) => { co.visible = i < occupancy.carbon; wat.visible = i >= occupancy.carbon && i < occupancy.carbon + occupancy.moisture; co.position.y = wat.position.y = separation ? .65 : 0 })
  })
}
