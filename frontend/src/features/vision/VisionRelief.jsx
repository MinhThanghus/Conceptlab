import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { RotateCw, Undo2 } from 'lucide-react'
import { createStage } from '../../lib/three/stage.js'
import { scenePalette, studioMaterial } from '../../lib/three/kit.js'
import { SIZE, visibleValue } from './visionMath.js'
import '../../styles/stage3d.css'

// The columns show clamped display intensity, not an image reconstructed from a photo. Studio
// inks: a slate board, the selected pixel coral (the one loud moment), its 3 × 3 neighbourhood
// blue; the column axis orange (coral toward pear) and the row axis mint-deep, as the notes say.
export default function VisionRelief({ values, selected, neighborhood = false, magnitude = false, label, lang = 'vi', safeFraming = false, onFailure }) {
  const host = useRef(null), model = useRef(null)
  const latest = useRef({ values, selected, neighborhood, magnitude })
  latest.current = { values, selected, neighborhood, magnitude }
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let stage, geometry, outlineGeometry, boardGeometry, boardMaterial, marker, markerLine, meshes = [], outlines = [], arrows = []
    const lost = (event) => { event.preventDefault(); onFailure?.() }
    try {
      stage = createStage(host.current, { view: { azimuth: .6, elevation: .62 }, turnRange: 1 })
      stage.canvas.addEventListener('webglcontextlost', lost)
      const palette = scenePalette(host.current)
      const ink = { selected: new THREE.Color(palette.coral), kernel: new THREE.Color(palette.blue), rest: new THREE.Color(palette.rule2) }
      const group = new THREE.Group()
      boardGeometry = new THREE.BoxGeometry(4.12, .12, 4.12)
      boardMaterial = studioMaterial('muted', palette, { roughness: .8 })
      const board = new THREE.Mesh(boardGeometry, boardMaterial)
      board.position.y = -.07
      board.receiveShadow = true
      group.add(board)
      geometry = new THREE.BoxGeometry(.43, 1, .43)
      outlineGeometry = new THREE.EdgesGeometry(geometry)
      for (let i = 0; i < SIZE * SIZE; i++) {
        const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .7 })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.set((i % SIZE - 3.5) * .49, 0, (Math.floor(i / SIZE) - 3.5) * .49)
        mesh.castShadow = true
        mesh.receiveShadow = true
        const outline = new THREE.LineSegments(outlineGeometry, new THREE.LineBasicMaterial({ color: ink.rest, transparent: true, opacity: .65 }))
        mesh.add(outline)
        group.add(mesh)
        meshes.push(mesh)
        outlines.push(outline)
      }
      // Coordinate arrows lie on the board edge and rotate with the field.
      const orange = new THREE.Color(palette.coral).lerp(new THREE.Color(palette.pear), .45)
      arrows = [
        new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-2, .08, 2.25), 1.25, orange, .22, .13),
        new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(2.25, .08, -2), 1.25, new THREE.Color(palette.mintDeep), .22, .13),
      ]
      arrows.forEach((arrow) => group.add(arrow))
      // The marker rises over the surface so a selected dark pixel is not hidden by its neighbors.
      marker = new THREE.Mesh(new THREE.SphereGeometry(.07, 24, 16), new THREE.MeshBasicMaterial({ color: palette.coral, depthTest: false }))
      marker.renderOrder = 10
      marker.userData.noFit = true
      markerLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, .02, 0), new THREE.Vector3(0, 1.58, 0)]), new THREE.LineBasicMaterial({ color: palette.coralDeep, depthTest: false, transparent: true, opacity: .85 }))
      markerLine.renderOrder = 9
      group.add(marker, markerLine)
      stage.world.add(group)
      // frame the board with its tallest columns, so a brighter image never zooms the view
      const fit = () => {
        const heights = meshes.map((mesh) => [mesh.scale.y, mesh.position.y])
        meshes.forEach((mesh) => { mesh.scale.y = 1.4; mesh.position.y = .7 })
        stage.frame?.(group, { fill: safeFraming ? .78 : .86 })
        meshes.forEach((mesh, i) => { mesh.scale.y = heights[i][0]; mesh.position.y = heights[i][1] })
        stage.frame?.(group, { fit: false })
      }
      const update = ({ values: data, selected: index, neighborhood: near, magnitude: abs }) => {
        const r = Math.floor(index / SIZE), c = index % SIZE
        meshes.forEach((mesh, i) => {
          const brightness = visibleValue(abs ? Math.abs(data[i]) / 4 : data[i])
          const height = Math.max(.015, brightness * 1.4)
          mesh.scale.y = height
          mesh.position.y = height / 2
          mesh.material.color.setRGB(brightness, brightness, brightness, THREE.SRGBColorSpace)
          const inKernel = near && Math.abs(Math.floor(i / SIZE) - r) <= 1 && Math.abs(i % SIZE - c) <= 1
          outlines[i].material.color.copy(i === index ? ink.selected : inKernel ? ink.kernel : ink.rest)
          outlines[i].material.opacity = i === index || inKernel ? 1 : .55
        })
        const target = meshes[index]
        marker.visible = markerLine.visible = Boolean(target)
        if (target) {
          marker.position.set(target.position.x, 1.62, target.position.z)
          markerLine.position.set(target.position.x, 0, target.position.z)
        }
        stage.invalidate()
      }
      model.current = { update, rotate: () => { group.rotation.y += Math.PI / 8; fit(); stage.invalidate() }, reset: () => { group.rotation.y = 0; stage.resetView(); fit(); stage.invalidate() } }
      update(latest.current)
      fit()
      setReady(true)
    } catch {
      outlines.forEach((line) => line.material.dispose())
      meshes.forEach((mesh) => mesh.material.dispose())
      arrows.forEach((arrow) => { arrow.line.geometry.dispose(); arrow.line.material.dispose(); arrow.cone.geometry.dispose(); arrow.cone.material.dispose() })
      marker?.geometry.dispose(); marker?.material.dispose(); markerLine?.geometry.dispose(); markerLine?.material.dispose()
      geometry?.dispose(); outlineGeometry?.dispose(); boardGeometry?.dispose(); boardMaterial?.dispose()
      stage?.canvas?.removeEventListener('webglcontextlost', lost)
      stage?.dispose()
      onFailure?.()
      return undefined
    }
    return () => {
      model.current = null
      outlines.forEach((line) => line.material.dispose())
      meshes.forEach((mesh) => mesh.material.dispose())
      arrows.forEach((arrow) => { arrow.line.geometry.dispose(); arrow.line.material.dispose(); arrow.cone.geometry.dispose(); arrow.cone.material.dispose() })
      marker.geometry.dispose(); marker.material.dispose(); markerLine.geometry.dispose(); markerLine.material.dispose()
      geometry.dispose(); outlineGeometry.dispose(); boardGeometry.dispose(); boardMaterial.dispose()
      stage.canvas.removeEventListener('webglcontextlost', lost)
      stage.dispose()
    }
  }, [onFailure, safeFraming])
  useEffect(() => { model.current?.update({ values, selected, neighborhood, magnitude }) }, [values, selected, neighborhood, magnitude, ready])
  return <div className="vision-relief stage3d">
    <div ref={host} className="vision-relief-canvas" role="img" aria-label={label} />
    <div className="vision-relief-tools stage3d-tools"><button type="button" className="btn" onClick={() => model.current?.rotate()}><RotateCw size={20} aria-hidden="true" /><span className="stage3d-tool-label">{lang === 'vi' ? 'Xoay' : 'Rotate'}</span></button><button type="button" className="btn" onClick={() => model.current?.reset()}><Undo2 size={20} aria-hidden="true" /><span className="stage3d-tool-label">{lang === 'vi' ? 'Đặt lại' : 'Reset view'}</span></button></div>
  </div>
}
