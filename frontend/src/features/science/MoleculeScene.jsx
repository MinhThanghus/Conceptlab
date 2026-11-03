import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { createStage } from '../../lib/three/stage.js'
import { createChip, labelFloor, scenePalette, studioMaterial } from '../../lib/three/kit.js'
import { MOLECULES } from './molecules.js'
import { canRender3D } from '../../lib/three/capability.js'
import { useT } from '../../i18n/index.jsx'
import { SceneAside, SceneBar, SceneFocus, SceneNotes } from '../../components/lab3d/sceneLayout.jsx'
import '../../styles/stage3d.css'

// CPK colours in the studio's inks: hydrogen card white, oxygen coral, carbon ink
const ATOM_ROLE = { H: 'card', O: 'moving', C: 'structure' }

/** A true geometric arc between the first two bond vectors; sizes are illustrative. */
function angleArc(center, first, second, material) {
  const a = new THREE.Vector3(...first).normalize()
  const b = new THREE.Vector3(...second).normalize()
  const angle = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1))
  let perpendicular = b.clone().addScaledVector(a, -a.dot(b))
  if (perpendicular.lengthSq() < 1e-8) perpendicular = new THREE.Vector3(0, 1, 0).addScaledVector(a, -a.y)
  perpendicular.normalize()
  const points = Array.from({ length: 49 }, (_, i) => {
    const theta = angle * i / 48
    return center.clone().addScaledVector(a, Math.cos(theta) * .55).addScaledVector(perpendicular, Math.sin(theta) * .55)
  })
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, .02, 10, false), material)
}

export default function MoleculeScene({ molecule, rotation, onFailure }) {
  const root = useRef(null)
  const current = useRef(null)
  useEffect(() => {
    if (!root.current) return undefined
    let stage
    const objects = []
    const chips = []
    const lost = (event) => { event.preventDefault(); onFailure() }
    try {
      stage = createStage(root.current, { view: { azimuth: .45, elevation: .3 }, turn: true, turnRange: 1 })
      stage.canvas.addEventListener('webglcontextlost', lost)
      current.current = stage
      const palette = scenePalette(root.current)
      const floor = labelFloor(root.current, 14)
      const config = MOLECULES[molecule]
      const center = new THREE.Vector3(0, 1.5, 0)
      const atom = (position, symbol, radius) => {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), studioMaterial(ATOM_ROLE[symbol] || 'card', palette, symbol === 'H' ? { roughness: .5, clearcoat: .3 } : { roughness: .42 }))
        mesh.position.copy(position)
        stage.world.add(mesh)
        objects.push(mesh)
        const chip = createChip(symbol, { size: .14, minPx: floor, maxPx: 20, palette })
        chip.sprite.position.copy(position).add(new THREE.Vector3(0, radius + .2, 0))
        stage.world.add(chip.sprite)
        chips.push(chip)
      }
      atom(center, config.center, 0.31)
      const bond = studioMaterial('muted', palette, { roughness: .5 })
      for (const v of config.directions) {
        const end = new THREE.Vector3(...v).multiplyScalar(1.08).add(center)
        const direction = end.clone().sub(center)
        const offset = config.bondOrder === 2 ? 0.075 : 0
        for (const side of config.bondOrder === 2 ? [-1, 1] : [0]) {
          const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, direction.length(), 20), bond)
          cylinder.position.copy(center).add(end).multiplyScalar(0.5).add(new THREE.Vector3(0, side * offset, 0))
          cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize())
          stage.world.add(cylinder)
          objects.push(cylinder)
        }
        atom(end, config.outer, config.outer === 'H' ? 0.22 : 0.31)
      }
      // the bond angle: the one pear-deep detail
      const arc = angleArc(center, config.directions[0], config.directions[1], studioMaterial('small', palette, { roughness: .45 }))
      arc.userData.noFit = true
      stage.world.add(arc)
      objects.push(arc)
      // the molecule floats a little above the paper; the framing allows every turn of the slider
      stage.frame?.(stage.world, { fill: .82, lift: .18, cast: true })
      stage.onResize = (unit) => chips.forEach((chip) => chip.setPixelUnit(unit))
      stage.world.rotation.y = rotation * Math.PI / 180
      stage.invalidate()
    } catch {
      stage?.dispose()
      onFailure()
      return undefined
    }
    return () => {
      current.current = null
      stage.canvas.removeEventListener('webglcontextlost', lost)
      chips.forEach((chip) => chip.dispose())
      const materials = new Set()
      for (const mesh of objects) { mesh.geometry?.dispose(); if (mesh.material) materials.add(mesh.material) }
      materials.forEach((material) => material.dispose())
      stage.dispose()
    }
  }, [molecule, onFailure])
  useEffect(() => {
    const stage = current.current
    if (!stage) return
    stage.world.rotation.y = rotation * Math.PI / 180
    // the floor and the contact shadow follow the turned molecule; the framing stays put
    stage.frame?.(stage.world, { fit: false, lift: .18 })
    stage.invalidate()
  }, [rotation])
  return <div className="molecule-scene stage3d"><div className="molecule-canvas" ref={root} /><span className="molecule-formula" aria-hidden="true">{MOLECULES[molecule].formula}</span><span className="molecule-angle" aria-hidden="true">{MOLECULES[molecule].angle}°</span></div>
}

/** The molecule flat, for a device without 3D: the bonds as seen from the front, CPK inks. */
function FlatMolecule({ config, label }) {
  const center = [160, 100]
  const ends = config.directions.map(([x, y]) => [center[0] + x * 74, center[1] - y * 74])
  return <svg className="molecule-flat" viewBox="0 0 320 200" role="img" aria-label={label}>
    {ends.map(([x, y], i) => <line key={`b${i}`} className="molecule-flat-bond" x1={center[0]} y1={center[1]} x2={x} y2={y} />)}
    {ends.map(([x, y], i) => <g key={`a${i}`}><circle className={`molecule-flat-atom is-${config.outer}`} cx={x} cy={y} r={config.outer === 'H' ? 15 : 21} /><AtomSymbol x={x} y={y} element={config.outer} /></g>)}
    <circle className={`molecule-flat-atom is-${config.center}`} cx={center[0]} cy={center[1]} r="23" />
    <AtomSymbol x={center[0]} y={center[1]} element={config.center} />
  </svg>
}

// each atom carries its symbol, so carbon and oxygen differ by more than colour (paper type on the dark carbon)
function AtomSymbol({ x, y, element }) {
  return <text x={x} y={y} dy=".35em" textAnchor="middle" fontSize={element === 'H' ? 16 : 20} fontWeight="700"
    style={{ fill: element === 'C' ? 'var(--color-paper)' : 'var(--color-ink)' }}>{element}</text>
}

/**
 * The molecules on a lesson slide (GuidedVisual in the deck): the stage, one row (the molecule and
 * the turn), and beside the model what the shape is and its bond angle; the limits behind a disclosure.
 */
export function MoleculeDeckScene() {
  const { t, fmt } = useT()
  const [molecule, setMolecule] = useState('water')
  const [rotation, setRotation] = useState(0)
  const [enabled, setEnabled] = useState(() => canRender3D())
  const fail = useCallback(() => setEnabled(false), [])
  const config = MOLECULES[molecule]
  const name = t(`scene3d.molecule.names.${molecule}`)
  return <section className="molecule-deck stage3d-scene is-deck" aria-label={t('scene3d.molecule.choose')}>
    {enabled
      ? <MoleculeScene molecule={molecule} rotation={rotation} onFailure={fail} />
      : <div className="molecule-scene stage3d"><FlatMolecule config={config} label={`${name} (${config.formula})`} /></div>}
    <SceneBar>
      <div className="stage3d-choices" role="group" aria-label={t('scene3d.molecule.choose')}>
        {Object.keys(MOLECULES).map((key) => <button key={key} type="button" className="chip" aria-pressed={molecule === key} onClick={() => setMolecule(key)}>{t(`scene3d.molecule.names.${key}`)}</button>)}
      </div>
      {enabled ? <label className="stage3d-range"><span>{t('scene3d.molecule.rotate')}</span><strong>{fmt.number(rotation, 0)}°</strong>
        <input type="range" min="-180" max="180" step="5" value={rotation} onChange={(event) => setRotation(Number(event.target.value))} />
      </label> : null}
    </SceneBar>
    <SceneAside>
      <SceneFocus title={`${name} (${config.formula})`}>
        <p>{t(`scene3d.molecule.description.${molecule}`)}</p>
        <p>{t('scene3d.molecule.angle', { value: fmt.number(config.angle, 1) })}</p>
      </SceneFocus>
      {!enabled ? <p className="stage3d-note">{t('scene3d.molecule.unavailable')}</p> : null}
      <SceneNotes>
        <p>{t('scene3d.molecule.notice')}</p>
        <p><a href={config.source} target="_blank" rel="noreferrer">{t('scene3d.molecule.source')}</a></p>
      </SceneNotes>
    </SceneAside>
  </section>
}
