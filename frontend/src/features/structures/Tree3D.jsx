import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RotateCw, Undo2 } from 'lucide-react'
import { createStage } from '../../lib/three/stage.js'
import { createChip, labelFloor, scenePalette, studioMaterial } from '../../lib/three/kit.js'
import { treePoint } from './structuresMath.js'
import '../../styles/stage3d.css'

// Tree positions communicate relationships, not physical memory addresses. The states keep the 2D
// tree's inks: the current node pear, visited nodes mint, the rest card; edges ink, then mint-deep.
const STATE_ROLE = { pending: 'card', visited: 'mint', current: 'pear' }

function connection(a, b, material) {
  const delta = b.clone().sub(a)
  const geometry = new THREE.CylinderGeometry(.022, .022, delta.length(), 12)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.copy(a).add(b).multiplyScalar(.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize())
  return mesh
}

export default function Tree3D({ values, frame, label, lang = 'vi', onFailure }) {
  const host = useRef(null), live = useRef(null), latest = useRef(frame)
  latest.current = frame
  useEffect(() => {
    let stage, nodeGeometry, nodes = [], edges = [], labels = []
    const lost = (event) => { event.preventDefault(); onFailure?.() }
    try {
      stage = createStage(host.current, { view: { azimuth: .32, elevation: .3 }, turnRange: 1 })
      stage.canvas.addEventListener('webglcontextlost', lost)
      const palette = scenePalette(host.current)
      const colors = Object.fromEntries(Object.entries(STATE_ROLE).map(([state, key]) => [state, new THREE.Color(palette[key])]))
      const edgeColors = { pending: new THREE.Color(palette.ink2), visited: new THREE.Color(palette.mintDeep), current: new THREE.Color(palette.pearDeep) }
      const group = new THREE.Group()
      const radius = values.length > 7 ? .21 : .23
      nodeGeometry = new THREE.SphereGeometry(radius, 48, 32)
      const point = (i) => {
        const p = treePoint(i), depth = Math.floor(Math.log2(i + 1))
        return new THREE.Vector3((p.x - 400) / 125, 3.5 - (p.y - 40) / 95, -.24 * depth)
      }
      values.forEach((value, i) => {
        const position = point(i)
        const material = studioMaterial('card', palette, { roughness: .42, clearcoat: .3 })
        const node = new THREE.Mesh(nodeGeometry, material)
        node.position.copy(position)
        node.castShadow = true
        group.add(node)
        nodes.push(node)
        // the value in ink on a paper halo, drawn over the middle of its node
        const chip = createChip(value, { size: values.length > 7 ? .17 : .19, minPx: labelFloor(host.current, 14), maxPx: 22, palette, plain: true, weight: 700 })
        chip.sprite.position.copy(position)
        group.add(chip.sprite)
        labels.push(chip)
        if (i > 0) {
          const parent = Math.floor((i - 1) / 2)
          const mesh = connection(point(parent), position, studioMaterial('structure', palette))
          mesh.castShadow = true
          group.add(mesh)
          edges.push({ mesh, parent, child: i })
        }
      })
      stage.world.add(group)
      stage.onResize = (unit) => labels.forEach((chip) => chip.setPixelUnit(unit))
      // the tree stands over the paper; the camera fits it and re-fits after a turn
      const fit = () => stage.frame?.(group, { fill: .84, lift: .12 })
      fit()
      const update = (state) => {
        const visited = new Set(state?.visited || [])
        nodes.forEach((node, i) => {
          const key = i === state?.current ? 'current' : visited.has(i) ? 'visited' : 'pending'
          node.material.color.copy(colors[key])
          node.scale.setScalar(i === state?.current ? 1.12 : 1)
        })
        edges.forEach(({ mesh, parent, child }) => {
          mesh.material.color.copy(child === state?.current ? edgeColors.current : visited.has(parent) && visited.has(child) ? edgeColors.visited : edgeColors.pending)
        })
        stage.invalidate()
      }
      live.current = { update, rotate: () => { group.rotation.y += Math.PI / 8; fit(); stage.invalidate() }, reset: () => { group.rotation.y = 0; stage.resetView(); fit(); stage.invalidate() } }
      update(latest.current)
    } catch {
      labels.forEach((chip) => chip.dispose())
      nodes.forEach((n) => n.material.dispose())
      edges.forEach(({ mesh }) => { mesh.geometry.dispose(); mesh.material.dispose() })
      nodeGeometry?.dispose()
      stage?.canvas?.removeEventListener('webglcontextlost', lost)
      stage?.dispose()
      onFailure?.()
      return undefined
    }
    return () => {
      live.current = null
      labels.forEach((chip) => chip.dispose())
      nodes.forEach((n) => n.material.dispose())
      edges.forEach(({ mesh }) => { mesh.geometry.dispose(); mesh.material.dispose() })
      nodeGeometry?.dispose()
      stage.canvas.removeEventListener('webglcontextlost', lost)
      stage.dispose()
    }
  }, [values, onFailure])
  useEffect(() => { live.current?.update(frame) }, [frame])
  return <div className="structures-3d stage3d">
    <div className="structures-3d-canvas" ref={host} role="img" aria-label={label} />
    <div className="structures-3d-tools stage3d-tools"><button type="button" className="btn" onClick={() => live.current?.rotate()}><RotateCw size={20} aria-hidden="true" /><span className="stage3d-tool-label">{lang === 'vi' ? 'Xoay' : 'Rotate'}</span></button><button type="button" className="btn" onClick={() => live.current?.reset()}><Undo2 size={20} aria-hidden="true" /><span className="stage3d-tool-label">{lang === 'vi' ? 'Đặt lại' : 'Reset view'}</span></button></div>
  </div>
}
