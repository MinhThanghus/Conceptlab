import { useEffect, useRef, useState } from 'react'
import { Focus, RotateCw, Undo2 } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { can3D } from '../../../components/lab3d/support.js'
import { buildSportsVenue, disposeSports, updateSportsFrame, sportsCoordinates } from '../../../lib/three/models/sportsField.js'
import { courtOf, viewBox } from './courts.js'
import '../../../styles/stage3d.css'
import './sportsField3d.css'

export default function SportsField3D({ sport, frame, ghost }) {
  const { t } = useT()
  const text = Object.fromEntries(['title', 'note', 'pose', 'focus', 'whole', 'rotate', 'reset', 'loading', 'unavailable'].map((key) => [key, t(`field.view3d.${key}`)]))
  const host = useRef(null), scene = useRef(null), frameRef = useRef(frame), ghostRef = useRef(ghost)
  frameRef.current = frame; ghostRef.current = ghost
  const [status, setStatus] = useState(() => can3D() ? 'loading' : 'unavailable')
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!can3D()) return undefined
    setStatus('loading'); setFocused(false)
    let cancelled = false, stage, venue, dynamic, rotation = 0, focus = false
    const lost = (event) => { event.preventDefault(); setStatus('unavailable') }
    ;(async () => {
      try {
        const [{ createStage }, THREE, kit] = await Promise.all([import('../../../lib/three/stage.js'), import('three'), import('../../../lib/three/kit.js')])
        if (cancelled || !host.current) return
        const court = courtOf(sport), bounds = viewBox(sport)
        const halfX = bounds.width * 3 / court.length, halfZ = bounds.height * 3 / court.length
        const fitAt = (angle) => {
          const first = frameRef.current?.players?.[0]
          if (focus && first) {
            const p = sportsCoordinates(sport, first.x, first.y)
            // Include the real court landmark when it can help identify the sport.
            const landmark = sport === 'basketball' ? { x: p.x < 0 ? -3 : 3, z: 0 } : sport === 'badminton' ? { x: 0, z: p.z } : null
            const blend = sport === 'badminton' ? .35 : .5
            const mid = landmark ? { x: p.x * (1 - blend) + landmark.x * blend, z: p.z * (1 - blend) + landmark.z * blend } : p
            const x = Math.cos(angle) * mid.x + Math.sin(angle) * mid.z
            const z = -Math.sin(angle) * mid.x + Math.cos(angle) * mid.z
            const spread = landmark ? Math.max(.75, Math.abs(p.x - landmark.x) * .65) : .75
            return { min: [x - spread, -.1, z - .7], max: [x + spread, .85, z + .7], margin: { x: .08, top: .1, bottom: .08 } }
          }
          const x = Math.abs(Math.cos(angle)) * halfX + Math.abs(Math.sin(angle)) * halfZ
          const z = Math.abs(Math.sin(angle)) * halfX + Math.abs(Math.cos(angle)) * halfZ
          return { min: [-x, -.15, -z], max: [x, 1.2, z], margin: { x: .07, top: .08, bottom: .08 } }
        }
        stage = createStage(host.current, {
          height: 5.2, width: 7.5, target: { x: 0, y: .25, z: 0 },
          fit: fitAt(0), view: { azimuth: .5, elevation: .72 }, turnRange: .4, zoom: true,
        })
        stage.canvas.addEventListener('webglcontextlost', lost)
        const palette = kit.scenePalette(host.current)
        venue = buildSportsVenue(THREE, sport, palette)
        dynamic = new THREE.Group()
        dynamic.userData.palette = palette
        stage.world.add(venue, dynamic)
        updateSportsFrame(THREE, dynamic, sport, frameRef.current, ghostRef.current)
        // players and their kit cast soft shadows on the court; the floor sits under the court slab
        const castPlayers = () => dynamic.traverse?.((object) => { if (object.isMesh && !object.material?.transparent) object.castShadow = true })
        castPlayers()
        stage.frame?.(stage.world, { fit: false, cast: true })
        scene.current = {
          update: (next, nextGhost) => { updateSportsFrame(THREE, dynamic, sport, next, nextGhost); castPlayers(); dynamic.traverse((object) => { if (object.isSprite) object.visible = !focus }); if (focus) stage.setFit(fitAt(rotation)); stage.invalidate() },
          focus: (value) => { focus = value; dynamic.traverse((object) => { if (object.isSprite) object.visible = !focus }); stage.setFit(fitAt(rotation)); stage.setView(.5, value ? .3 : .72); stage.setZoom(value ? (sport === 'badminton' ? 1.9 : sport === 'basketball' ? 1.5 : 2.5) : 1); stage.invalidate() },
          rotate: () => { rotation += Math.PI / 4; stage.world.rotation.y = rotation; stage.setFit(fitAt(rotation)); stage.frame?.(stage.world, { fit: false }); stage.invalidate() },
          reset: () => { rotation = 0; stage.world.rotation.y = 0; stage.setFit(fitAt(0)); stage.frame?.(stage.world, { fit: false }); stage.resetView(); if (focus) { stage.setView(.5, .3); stage.setZoom(sport === 'badminton' ? 1.9 : sport === 'basketball' ? 1.5 : 2.5) } stage.invalidate() },
        }
        stage.invalidate(); setStatus('ready')
      } catch {
        if (venue) disposeSports(venue)
        if (dynamic) disposeSports(dynamic)
        stage?.dispose(); stage = null
        if (!cancelled) setStatus('unavailable')
      }
    })()
    return () => {
      cancelled = true; scene.current = null
      if (venue) disposeSports(venue)
      if (dynamic) disposeSports(dynamic)
      stage?.canvas.removeEventListener('webglcontextlost', lost); stage?.dispose()
    }
  }, [sport])
  useEffect(() => { scene.current?.update(frame, ghost) }, [frame, ghost])
  return <section className="sports3d stage3d-scene" aria-label={text.title}>
    <div className="sports3d-stage stage3d">
      {status !== 'ready' ? <p className="sports3d-status" role="status">{status === 'loading' ? text.loading : text.unavailable}</p> : null}
      <div className="sports3d-host" ref={host} style={{ visibility: status === 'ready' ? 'visible' : 'hidden' }} role={status === 'ready' ? 'img' : undefined} aria-label={status === 'ready' ? text.title : undefined} />
    </div>
    {status === 'ready' ? <div className="sports3d-actions stage3d-view"><button type="button" className="btn" aria-pressed={focused} disabled={!frame?.players?.length} onClick={() => { const next = !focused; setFocused(next); scene.current?.focus(next) }}><Focus size={20} aria-hidden="true" />{focused ? text.whole : text.focus}</button><button type="button" className="btn btn-ghost" onClick={() => scene.current?.rotate()}><RotateCw size={20} aria-hidden="true" />{text.rotate}</button><button type="button" className="btn btn-ghost" onClick={() => scene.current?.reset()}><Undo2 size={20} aria-hidden="true" />{text.reset}</button></div> : null}
    <p className="stage3d-note">{text.note} {text.pose}</p>
  </section>
}
