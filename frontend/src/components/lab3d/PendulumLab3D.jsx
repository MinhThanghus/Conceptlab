import { useEffect, useRef, useState } from 'react'
import { canRender3D } from '../../lib/three/capability.js'
import '../../styles/stage3d.css'
import './lab3d.css'

const MAX_SWING = 0.45 // radians: dragging past this leaves the small-angle model the readout uses

/**
 * A pendulum stand in 3D. `items` are the pendulums on the arm ([{ length, theta, amplitude }],
 * metres and radians); the parent owns the clock and passes new angles, or drives it through
 * `onReady(controller)` without re-rendering React every frame. Three.js loads only when this
 * mounts and the device can run it; otherwise `fallback` (the 2D lab) shows instead.
 *
 * `onDrag(index, theta, phase)` makes the bobs draggable: 'move' while dragging, 'end' on release.
 */
export default function PendulumLab3D({ items, maxLength = 2.5, label, fallback = null, onReady, onDrag, formatLength, colors, className }) {
  const hostRef = useRef(null)
  const ctlRef = useRef(null)
  const itemsRef = useRef(items)
  const dragRef = useRef(onDrag)
  itemsRef.current = items
  dragRef.current = onDrag
  const [status, setStatus] = useState(() => (canRender3D() ? 'loading' : 'off'))
  const count = Math.max(1, Math.min(2, items?.length || 1))

  useEffect(() => {
    if (status === 'off' || status === 'failed') return undefined
    let cancelled = false
    let stage = null
    let bench = null
    const cleanups = []
    ;(async () => {
      try {
        const fontsReady = document.fonts?.load ? Promise.race([document.fonts.load('600 22px "Lexend Variable"'), new Promise((r) => setTimeout(r, 1200))]) : null
        const [{ createStage }, { createPendulumBench }, kit] = await Promise.all([import('../../lib/three/stage.js'), import('../../lib/three/pendulumBench.js'), import('../../lib/three/kit.js'), fontsReady])
        if (cancelled || !hostRef.current) return
        // frame the whole stand: the pivot sits maxLength + 0.62 m above the board
        stage = createStage(hostRef.current, { height: maxLength + 1.0, target: { x: 0.08, y: (maxLength + 0.72) / 2, z: 0 } })
        const THREE = stage.THREE
        bench = createPendulumBench({ maxLength, count, colors, formatLength: formatLength || ((m) => String(m)) })
        stage.world.add(bench.group)
        // floor, contact shadow and key light follow the stand; its labels keep a readable size
        stage.frame?.(bench.group, { fit: false })
        const boost = kit.labelFloor(hostRef.current, 12) / 12
        stage.onResize = (unit) => bench.setPixelUnit(unit * boost)
        const apply = (list) => {
          ;(list || []).slice(0, count).forEach((it, i) => bench.setPendulum(i, it.length, it.theta, it.amplitude))
          stage.invalidate()
        }
        apply(itemsRef.current)
        const controller = { update: apply, resetView: () => stage.resetView() }
        ctlRef.current = controller

        // dragging a bob sets where it is let go from
        const raycaster = new THREE.Raycaster()
        const ndc = new THREE.Vector2()
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
        const hit = new THREE.Vector3()
        let dragging = null
        const toNdc = (e) => {
          const rect = stage.canvas.getBoundingClientRect()
          ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
          raycaster.setFromCamera(ndc, stage.camera)
        }
        const pickBob = (e) => {
          if (!dragRef.current) return -1
          toNdc(e)
          const found = raycaster.intersectObjects(bench.bobs, false)[0]
          return found ? found.object.userData.index : -1
        }
        stage.blockTurn = (e) => pickBob(e) >= 0
        const thetaFrom = (e, i) => {
          toNdc(e)
          if (!raycaster.ray.intersectPlane(plane, hit)) return null
          const pivot = bench.pivot(i)
          const th = Math.atan2(hit.x - pivot.x, pivot.y - hit.y)
          return Math.max(-MAX_SWING, Math.min(MAX_SWING, th))
        }
        const down = (e) => {
          const i = pickBob(e)
          if (i < 0) return
          dragging = i
          stage.canvas.setPointerCapture?.(e.pointerId)
          stage.canvas.classList.add('is-dragging')
          e.preventDefault()
        }
        const move = (e) => {
          if (dragging === null) {
            stage.canvas.classList.toggle('over-bob', pickBob(e) >= 0)
            return
          }
          const th = thetaFrom(e, dragging)
          if (th !== null) dragRef.current?.(dragging, th, 'move')
        }
        const up = (e) => {
          if (dragging === null) return
          const th = thetaFrom(e, dragging)
          dragRef.current?.(dragging, th ?? 0, 'end')
          dragging = null
          stage.canvas.classList.remove('is-dragging')
        }
        stage.canvas.addEventListener('pointerdown', down)
        stage.canvas.addEventListener('pointermove', move)
        stage.canvas.addEventListener('pointerup', up)
        stage.canvas.addEventListener('pointercancel', up)
        cleanups.push(() => {
          stage.canvas.removeEventListener('pointerdown', down)
          stage.canvas.removeEventListener('pointermove', move)
          stage.canvas.removeEventListener('pointerup', up)
          stage.canvas.removeEventListener('pointercancel', up)
        })
        setStatus('ready')
        onReady?.(controller)
      } catch (err) {
        if (!cancelled) {
          console.warn('3D lab unavailable, showing the 2D lab', err)
          setStatus('failed')
        }
      }
    })()
    return () => {
      cancelled = true
      ctlRef.current = null
      cleanups.forEach((fn) => fn())
      bench?.dispose()
      stage?.dispose()
    }
    // The stand is rebuilt only when its shape changes (one or two pendulums, its height).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, maxLength, status === 'off' || status === 'failed'])

  useEffect(() => {
    ctlRef.current?.update(items)
  }, [items])

  if (status === 'off' || status === 'failed') return fallback
  return (
    <div className={['lab3d', 'stage3d', 'stage3d-fill', status === 'ready' && 'is-ready', className].filter(Boolean).join(' ')} ref={hostRef} role="img" aria-label={label} aria-busy={status === 'loading' || undefined} />
  )
}
