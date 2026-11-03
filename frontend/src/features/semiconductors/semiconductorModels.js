/** Hand-built educational diagrams, not replicas of any paper or foundry process. */
import * as THREE from 'three'
import { createChip, SIM_PALETTE, studioMaterial } from '../../lib/three/kit.js'
import { cmosInverter } from './semiconductorMath.js'

function resources() {
  const items = new Set()
  return { keep: (item) => { items.add(item); return item }, dispose: () => items.forEach((item) => item.dispose?.()) }
}

function panel(keep, width, height, depth, material, position, name, group) {
  const mesh = new THREE.Mesh(keep(new THREE.BoxGeometry(width, height, depth)), material)
  mesh.position.set(...position)
  mesh.name = name
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)
  return mesh
}

/** A part's name: the studio chip (Lexend ink on card), legible at any stage size (`chips.minPx` floor). */
function label(chips, text, position, group, palette, scale = 1) {
  const chip = createChip(text, { size: .1 * scale, minPx: chips.minPx || 13, maxPx: 17, palette })
  chip.sprite.position.set(...position)
  chip.sprite.renderOrder = 20
  group.add(chip.sprite)
  chips.push(chip)
  return chip.sprite
}

/**
 * The legend's colours in the studio's inks: a deep blue substrate, mint n+ regions, a pear gate
 * dielectric, a plum gate, sand metal, sugar dielectric, a slate chip base; the conducting path
 * pear-deep (pMOS, pull-up) or blue (nMOS, pull-down); the induced channel mint-soft.
 */
const MATERIALS = (keep, palette) => ({
  substrate: keep(studioMaterial('blueDeep', palette, { roughness: .72 })),
  doped: keep(studioMaterial('mint', palette, { roughness: .55 })),
  oxide: keep(studioMaterial('pear', palette, { transparent: true, opacity: .85, roughness: .4 })),
  gate: keep(studioMaterial('plum', palette, { roughness: .45, metalness: .12 })),
  metal: keep(studioMaterial('sand', palette, { roughness: .36, metalness: .32 })),
  dielectric: keep(studioMaterial('sugar', palette, { transparent: true, opacity: .55, roughness: .6, depthWrite: false })),
  chip: keep(studioMaterial('muted', palette, { roughness: .68 })),
  disabled: keep(studioMaterial('rule', palette, { roughness: .8 })),
  pActive: keep(studioMaterial('small', palette, { emissive: palette.pearDeep, emissiveIntensity: .3, roughness: .45 })),
  nActive: keep(studioMaterial('blue', palette, { emissive: palette.blue, emissiveIntensity: .3, roughness: .45 })),
  channel: keep(new THREE.MeshBasicMaterial({ color: palette.mintSoft, transparent: true, opacity: .94 })),
})

function createDevice(keep, mat, labels, chips, palette) {
  const group = new THREE.Group(); group.name = 'nmos-cross-section'
  const planar = new THREE.Group(); planar.name = 'planar'; group.add(planar)
  panel(keep, 4.4, .60, 2.5, mat.substrate, [0, -.12, 0], 'p-type-substrate', planar)
  panel(keep, 1.15, .30, 1.35, mat.doped, [-1.37, .30, 0], 'source-n-plus', planar)
  panel(keep, 1.15, .30, 1.35, mat.doped, [1.37, .30, 0], 'drain-n-plus', planar)
  const channel = panel(keep, 1.65, .09, 1.1, mat.channel, [0, .34, 0], 'induced-channel', planar)
  panel(keep, 1.70, .10, 1.5, mat.oxide, [0, .47, 0], 'gate-oxide', planar)
  const gate = panel(keep, 1.70, .20, 1.5, mat.gate, [0, .62, 0], 'gate-electrode', planar)
  panel(keep, .45, .36, .46, mat.metal, [-1.37, .62, 0], 'source-contact', planar)
  panel(keep, .45, .36, .46, mat.metal, [1.37, .62, 0], 'drain-contact', planar)
  label(chips, labels.source, [-1.37, 1.13, .05], planar, palette)
  label(chips, labels.gate, [0, 1.35, .05], planar, palette)
  label(chips, labels.drain, [1.37, 1.13, .05], planar, palette)
  label(chips, labels.oxide, [0, .64, 1.47], planar, palette, .9)
  label(chips, labels.substrate, [0, -.55, 1.38], planar, palette)
  const sheets = new THREE.Group(); sheets.name = 'nanosheet'; group.add(sheets)
  panel(keep, 4.4, .38, 2.3, mat.substrate, [0, -.22, 0], 'nanosheet-support', sheets)
  for (const x of [-1.65, 1.65]) panel(keep, .65, 1.20, 1.25, mat.doped, [x, .58, 0], 'sheet-contact', sheets)
  const sheetChannels = []
  for (const y of [.23, .62, 1.01]) {
    const sheet = panel(keep, 2.7, .13, .72, mat.doped, [0, y, 0], 'silicon-nanosheet', sheets); sheetChannels.push(sheet)
    for (const dz of [-.40, .40]) panel(keep, 1.6, .19, .045, mat.oxide, [0, y, dz], 'sheet-gate-dielectric', sheets)
    for (const dy of [-.105, .105]) panel(keep, 1.6, .035, .76, mat.oxide, [0, y + dy, 0], 'sheet-gate-dielectric', sheets)
    for (const dz of [-.50, .50]) panel(keep, 1.65, .24, .12, mat.gate, [0, y, dz], 'sheet-gate-side', sheets)
    for (const dy of [-.18, .18]) panel(keep, 1.65, .10, .88, mat.gate, [0, y + dy, 0], 'sheet-gate-edge', sheets)
  }
  label(chips, labels.source, [-1.68, 1.38, 0], sheets, palette)
  label(chips, labels.gate, [0, 1.55, 0], sheets, palette)
  label(chips, labels.drain, [1.68, 1.38, 0], sheets, palette)
  const wire = new THREE.Group(); wire.name = 'nanowire'; group.add(wire)
  panel(keep, 3.5, .34, 2.0, mat.substrate, [0, -.27, 0], 'nanowire-support', wire)
  panel(keep, 1.25, .22, 1.1, mat.doped, [0, .01, 0], 'nanowire-source', wire)
  const wireChannel = new THREE.Mesh(keep(new THREE.CylinderGeometry(.21, .21, 1.20, 28)), mat.doped); wireChannel.position.y = .71; wireChannel.name = 'vertical-silicon-nanowire'; wire.add(wireChannel)
  const oxideShell = new THREE.Mesh(keep(new THREE.CylinderGeometry(.29,.29,.62,32,1,true,0,Math.PI*1.6)), mat.oxide); oxideShell.position.y=.70; oxideShell.name='nanowire-gate-dielectric'; wire.add(oxideShell)
  const shellMaterial = keep(studioMaterial('plum', palette, { transparent: true, opacity: .68, side: THREE.DoubleSide, roughness: .5, depthWrite: false }))
  const shell = new THREE.Mesh(keep(new THREE.CylinderGeometry(.46,.46,.64,32,1,true,0,Math.PI*1.6)), shellMaterial); shell.position.y=.70; shell.name='surrounding-gate'; wire.add(shell)
  panel(keep, 1.0, .20, .9, mat.metal, [0, 1.40, 0], 'nanowire-drain', wire)
  label(chips, labels.source, [-1.1, .12, 0], wire, palette)
  label(chips, labels.gate, [1.05, .75, 0], wire, palette)
  label(chips, labels.drain, [0, 1.66, 0], wire, palette)
  return { group, update({ gateHigh, geometry = 'planar' }) {
    planar.visible = geometry === 'planar'; sheets.visible = geometry === 'nanosheet'; wire.visible = geometry === 'nanowire'
    channel.visible = Boolean(gateHigh)
    gate.material.emissive.set(gateHigh ? palette.plum : palette.ink); gate.material.emissiveIntensity = gateHigh ? .35 : 0
    sheetChannels.forEach((sheet) => { sheet.material = gateHigh ? mat.channel : mat.doped })
    wireChannel.material = gateHigh ? mat.channel : mat.doped
  } }
}

function createSwitch(keep, mat, z, type, labels, group) {
  const device = new THREE.Group(); device.name = `${type}-switch`; device.position.set(0, .46, z)
  group.add(device)
  panel(keep, 1.4, .28, .80, mat.substrate, [0, 0, 0], `${type}-body`, device)
  panel(keep, .90, .12, .30, mat.gate, [0, .24, 0], `${type}-gate`, device)
  panel(keep, .50, .12, .21, mat.metal, [0, .18, -.30], `${type}-contact-a`, device)
  panel(keep, .50, .12, .21, mat.metal, [0, .18, .30], `${type}-contact-b`, device)
  const channel = panel(keep, .28, .11, .48, mat.channel, [0, .18, 0], `${type}-channel`, device)
  return channel
}

function createCmos(keep, mat, labels) {
  const group = new THREE.Group(); group.name = 'cmos-inverter'
  panel(keep, 4.4, .22, 4.65, mat.chip, [0, -.20, 0], 'chip-base', group)
  const pChannel = createSwitch(keep, mat, -1.0, 'pmos', labels, group)
  const nChannel = createSwitch(keep, mat, 1.0, 'nmos', labels, group)
  const pWires = [], nWires = []
  for (const [z, len] of [[-1.75, 1.0], [-.35, .70]]) pWires.push(panel(keep, .20, .10, len, mat.disabled, [0, .18, z], 'pull-up-trace', group))
  for (const [z, len] of [[.35, .70], [1.75, 1.0]]) nWires.push(panel(keep, .20, .10, len, mat.disabled, [0, .18, z], 'pull-down-trace', group))
  for (const z of [-1.3, -.7, .7, 1.3]) panel(keep, .15, .45, .15, mat.metal, [0, .40, z], 'switch-contact-via', group)
  panel(keep, 2.0, .09, .17, mat.metal, [1, .18, 0], 'output-trace', group)
  panel(keep, .13, .09, 2.15, mat.gate, [-1.75, .18, 0], 'common-input-trace', group)
  for (const z of [-1, 1]) {
    panel(keep, 1.4, .09, .13, mat.gate, [-1.05, .18, z], 'gate-input-trace', group)
    panel(keep, .13, .52, .13, mat.gate, [-.4, .43, z], 'gate-input-via', group)
  }
  return { group, update({ input, revealed }) {
    const logic = cmosInverter(input)
    pChannel.visible = Boolean(revealed && logic.pOn)
    nChannel.visible = Boolean(revealed && logic.nOn)
    pWires.forEach((wire) => { wire.material = revealed && logic.pOn ? mat.pActive : mat.disabled })
    nWires.forEach((wire) => { wire.material = revealed && logic.nOn ? mat.nActive : mat.disabled })
  } }
}

function createStack(keep, mat) {
  const group = new THREE.Group(); group.name = 'chip-interconnect-stack'
  const substrate = new THREE.Group(); substrate.name = 'silicon-and-devices'
  const insulation = new THREE.Group(); insulation.name = 'insulation'
  const lowerMetal = new THREE.Group(); lowerMetal.name = 'lower-interconnect'
  const upperMetal = new THREE.Group(); upperMetal.name = 'upper-interconnect'
  group.add(substrate, insulation, lowerMetal, upperMetal)
  panel(keep, 4.3, .55, 2.8, mat.substrate, [0, -.28, 0], 'silicon-substrate', substrate)
  for (const x of [-1.15, 0, 1.15]) {
    panel(keep, .66, .17, .76, mat.doped, [x, .08, 0], 'device-region', substrate)
    panel(keep, .45, .08, .85, mat.oxide, [x, .21, 0], 'gate-insulator', substrate)
    panel(keep, .45, .16, .85, mat.gate, [x, .33, 0], 'gate-electrode', substrate)
  }
  panel(keep, 4.0, .15, 2.5, mat.dielectric, [0, 0, 0], 'dielectric-layer', insulation)
  for (const z of [-.8, 0, .8]) panel(keep, 3.7, .14, .19, mat.metal, [0, 0, z], 'lower-metal-line', lowerMetal)
  for (const x of [-1.4, -.45, .45, 1.4]) panel(keep, .19, .14, 2.35, mat.nActive, [x, 0, 0], 'upper-metal-line', upperMetal)
  for (const [x, z] of [[-1.4, -.8], [-.45, 0], [.45, .8], [1.4, 0]]) panel(keep, .15, .30, .15, mat.metal, [x, -.17, z], 'via', upperMetal)
  return { group, update({ separation }) {
    const d = Number(separation) / 100
    insulation.position.y = .58 + d * .28
    lowerMetal.position.y = .85 + d * .65
    upperMetal.position.y = 1.2 + d * 1.2
  } }
}

function createMemristor(keep, mat, labels, chips, palette) {
  const group = new THREE.Group(); group.name = 'conceptual-selector-memristor'
  panel(keep, 3.6, .35, 2.3, mat.substrate, [0, -.14, 0], 'selector-p-silicon', group)
  panel(keep, 2.8, .13, 1.8, mat.metal, [0, .12, 0], 'bottom-electrode', group)
  panel(keep, 2.45, .29, 1.55, mat.doped, [0, .34, 0], 'selector-silicon', group)
  panel(keep, 2.8, .13, 1.8, mat.metal, [0, .55, 0], 'middle-electrode', group)
  const switching = panel(keep, 2.1, .22, 1.35, mat.disabled, [0, .73, 0], 'resistive-switching-layer', group)
  panel(keep, 2.8, .13, 1.8, mat.metal, [0, .91, 0], 'top-electrode', group)
  label(chips, labels.topElectrode, [0, 1.30, 0], group, palette)
  label(chips, labels.switchLayer, [1.10, .83, 1.1], group, palette)
  label(chips, labels.selector, [-1.1, .30, 1.25], group, palette)
  return { group, update({ memoryState = 'high' }) { switching.material = memoryState === 'low' ? mat.nActive : mat.disabled } }
}

export function createSemiconductorModel(mode, labels, palette = SIM_PALETTE, { minPx = 13 } = {}) {
  const { keep, dispose } = resources()
  const mat = MATERIALS(keep, palette)
  const chips = []
  chips.minPx = minPx
  const model = mode === 'device' ? createDevice(keep, mat, labels, chips, palette) : mode === 'cmos' ? createCmos(keep, mat, labels) : mode === 'memristor' ? createMemristor(keep, mat, labels, chips, palette) : createStack(keep, mat)
  return {
    ...model,
    setPixelUnit: (unit) => chips.forEach((chip) => chip.setPixelUnit(unit)),
    dispose() {
      chips.forEach((chip) => chip.dispose())
      dispose()
    },
  }
}
