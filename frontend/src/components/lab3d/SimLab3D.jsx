import { useEffect, useRef, useState } from 'react'
import { oklchToHex } from '../../lib/three/simMath.js'
import { can3D } from './support.js'
import '../../styles/stage3d.css'
import './lab3d.css'

const KINDS = ['pendulum', 'projectile', 'spring']

/**
 * A simulation's scene in 3D: the pendulum stand, the projectile field or the spring track.
 * The parent owns the clock and passes `state`, a pure function of the sim time and the
 * scenario results, on every frame it draws; this only applies it and renders, so play, step,
 * scrub, compare and reduced motion behave exactly as in the 2D scene. Three.js and the model
 * load only when this mounts on a device that can run them; otherwise, or if anything fails,
 * `fallback` (the 2D scene) shows instead.
 *
 *   kind     'pendulum' | 'projectile' | 'spring'
 *   shape    what the model is built from (lanes, maxLength, maxAmp, tags, labels); a change rebuilds it
 *   state    per frame: pendulum { items: [{ length, theta, amplitude }] },
 *            projectile { layout, lanes: [...] }, spring { lanes: [{ x, massText }] }
 *   images   the SAM cut-out for each lane (URL or null)
 *   fallback shown instead of the 3D view when it cannot run, and dimmed under it while it loads
 *   controlRef.current = { resetView() } once ready; onStatus('loading' | 'ready' | 'failed')
 */
export default function SimLab3D({ kind, shape, state, images, label, describedBy, fallback = null, className, controlRef, onStatus }) {
  const hostRef = useRef(null)
  const modelRef = useRef(null)
  const stateRef = useRef(state)
  const imagesRef = useRef(images)
  stateRef.current = state
  imagesRef.current = images
  const [status, setStatus] = useState(() => (KINDS.includes(kind) && can3D() ? 'loading' : 'off'))
  const shapeKey = JSON.stringify([kind, shape || null])
  const imagesKey = JSON.stringify(images || null)
  const off = status === 'off' || status === 'failed'

  useEffect(() => {
    onStatus?.(status)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(() => {
    if (off) return undefined
    let cancelled = false
    let stage = null
    let model = null
    setStatus('loading')
    ;(async () => {
      try {
        const fontsReady = document.fonts?.load ? Promise.race([document.fonts.load('600 22px "Lexend Variable"'), new Promise((r) => setTimeout(r, 1200))]) : null
        const [{ createStage }, kit, factory] = await Promise.all([
          import('../../lib/three/stage.js'),
          import('../../lib/three/kit.js'),
          kind === 'pendulum' ? import('../../lib/three/pendulumBench.js') : kind === 'projectile' ? import('../../lib/three/projectileField.js') : import('../../lib/three/springTrack.js'),
          fontsReady,
        ])
        if (cancelled || !hostRef.current) return
        const opts = shape || {}
        const palette = kit.tokenPalette(hostRef.current, oklchToHex)
        const lanes = opts.lanes === 2 ? 2 : 1
        const colors = lanes === 2 ? [palette.coralDeep, palette.blue] : [palette.coral]
        const invalidate = () => stage?.invalidate()
        if (kind === 'pendulum') {
          const maxLength = opts.maxLength || 2.5
          stage = createStage(hostRef.current, {
            height: maxLength + 1.0,
            width: lanes === 2 ? Math.max(2.5, (maxLength + 1) * 0.66) : undefined,
            target: { x: lanes === 2 ? 0.16 : 0.08, y: (maxLength + 0.72) / 2, z: 0 },
          })
          const bench = factory.createPendulumBench({
            maxLength,
            count: lanes,
            colors,
            palette: { ...factory.BENCH_PALETTE, ...pick(palette) },
            formatLength: opts.formatLength,
            lengthText: opts.lengthText,
            rulerUnit: opts.rulerUnit,
            tags: opts.tags,
            images: imagesRef.current,
            onChange: invalidate,
          })
          model = {
            group: bench.group,
            update: (st) => (st?.items || []).slice(0, lanes).forEach((it, i) => bench.setPendulum(i, it.length, it.theta, it.amplitude)),
            setImages: bench.setImages,
            setPixelUnit: bench.setPixelUnit,
            dispose: bench.dispose,
          }
        } else if (kind === 'projectile') {
          const f = factory.PROJECTILE_FRAME
          stage = createStage(hostRef.current, { height: f.height, width: f.width, target: f.target, view: f.view, narrowView: f.narrowView, shadow: { left: -4.6, right: 4.6, top: 4.2, bottom: -4.2, far: 26 }, catcher: 24, turnRange: 0.5 })
          model = factory.createProjectileField({ lanes, colors, palette, tags: opts.tags, images: imagesRef.current, formatMetres: opts.formatMetres, onChange: invalidate })
        } else {
          const f = factory.SPRING_FRAME
          stage = createStage(hostRef.current, { height: f.height, width: f.width, target: f.target, view: f.view, narrowView: f.narrowView, shadow: { left: -2.2, right: 2.2, top: 2, bottom: -2, far: 22 }, catcher: 10, turnRange: 0.55 })
          model = factory.createSpringTrack({ lanes, colors, palette, tags: opts.tags, maxAmp: opts.maxAmp, images: imagesRef.current, formatMetres: opts.formatMetres, labels: opts.labels, onChange: invalidate })
        }
        stage.world.add(model.group)
        model.update(stateRef.current)
        const box = model.box?.(stateRef.current)
        if (box) stage.setFit(box)
        // the floor, the contact shadow and the key light's shadow box follow the model (the framing stays the model's own)
        stage.frame?.(model.group, { fit: false })
        // labels never render below 11 to 12px on a page; in the deck or on a projector they keep 18px
        const boost = kit.labelFloor(hostRef.current, 12) / 12
        stage.onResize = (unit) => model.setPixelUnit?.(unit * boost)
        stage.invalidate()
        modelRef.current = { model, stage, images: JSON.stringify(imagesRef.current || null), box: JSON.stringify(box || null) }
        if (controlRef) controlRef.current = { resetView: () => stage.resetView() }
        setStatus('ready')
      } catch (err) {
        if (!cancelled) {
          console.warn('3D view unavailable, showing the 2D scene', err)
          setStatus('failed')
        }
      }
    })()
    return () => {
      cancelled = true
      modelRef.current = null
      if (controlRef) controlRef.current = null
      model?.dispose()
      stage?.dispose()
    }
    // Rebuilt only when the shape changes (one or two lanes, the stand's height, the ruler).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapeKey, off])

  useEffect(() => {
    const live = modelRef.current
    if (!live) return
    live.model.update(state)
    // a throw that outgrows the view moves the camera out (in round steps, never every frame)
    const box = live.model.box?.(state)
    const key = JSON.stringify(box || null)
    if (box && key !== live.box) {
      live.box = key
      live.stage.setFit(box)
    }
    live.stage.invalidate()
  }, [state, status])

  useEffect(() => {
    const live = modelRef.current
    if (!live || live.images === imagesKey) return
    live.images = imagesKey
    live.model.setImages?.(images)
    live.stage.invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagesKey, status])

  if (off) return fallback
  return (
    <div
      className={['lab3d', 'stage3d', 'stage3d-fill', status === 'ready' && 'is-ready', className].filter(Boolean).join(' ')}
      ref={hostRef}
      role="img"
      aria-label={label}
      aria-describedby={describedBy}
      aria-busy={status === 'loading' || undefined}
    >
      {status === 'loading' && fallback ? (
        <div className="lab3d-placeholder" aria-hidden="true">
          {fallback}
        </div>
      ) : null}
    </div>
  )
}

/** The bench keeps its own blue and steel; the rest follows the page's tokens. */
function pick(palette) {
  const { paper, card, ink, ink2, pear, pearDeep, coral, kraft, kraftDeep, sand, sugar, rule } = palette
  return { paper, card, ink, ink2, pear, pearDeep, coral, kraft, kraftDeep, sand, sugar, rule }
}
