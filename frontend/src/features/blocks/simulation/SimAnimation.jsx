import { useEffect, useId, useRef, useState } from 'react'
import { Pause, Play, Rewind, RotateCcw, StepBack, StepForward } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { Alert, Button, IconButton, Segmented } from '../../../components/ui/index.js'
import { Plot } from '../../../components/charts/Plot.jsx'
import SimLab3D from '../../../components/lab3d/SimLab3D.jsx'
import { can3D } from '../../../components/lab3d/support.js'
import { clockSettings, digitsFor, SPEEDS } from './simView.js'
import { InterestScene, PendulumScene, ProjectileScene, SpringScene } from './scenes.jsx'
import { pendulumStandLength, scene3dState, STAGE_3D, springMaxAmp } from './scene3d.js'
import { useSimClock } from './useSimClock.js'

export const COLOR_A = 'var(--cl-series-2)'
export const COLOR_B = 'var(--cl-series-1)'
/** One scenario alone: the moving thing is the screen's one loud moment, in coral. */
export const COLOR_ONE = 'var(--color-accent-3)'

const VIEW_KEY = 'cl.sim.view'

/** The 2D/3D choice is remembered for the session, for every simulation on every page. */
function readView() {
  try {
    const v = window.sessionStorage.getItem(VIEW_KEY)
    return v === '2d' || v === '3d' ? v : null
  } catch {
    return null
  }
}
function saveView(v) {
  try {
    window.sessionStorage.setItem(VIEW_KEY, v)
  } catch {
    /* storage unavailable: the choice lasts until the page reloads */
  }
}

/** A row of labelled numbers (value + unit + optional note); the first may lead. */
export function Readouts({ rows, accentFirst = false, label }) {
  const { fmt } = useT()
  return (
    <dl className={`ix-readouts${accentFirst ? ' has-lead' : ''}`} aria-label={label}>
      {rows.map((r, i) => (
        <div key={r.key} className={`ix-readout${accentFirst && i === 0 ? ' accent' : ''}`}>
          <dt>
            {r.label}
            {r.symbol ? <span className="sim-sym"> {r.symbol}</span> : null}
          </dt>
          <dd>
            <span className="ix-readout-value">
              {Number.isFinite(r.value) ? fmt.number(r.value, r.digits ?? digitsFor(r.value)) : <NoValue />}
              {r.unit && Number.isFinite(r.value) ? <span className={`unit${r.unit === '°' ? ' tight' : ''}`}>{r.unit}</span> : null}
            </span>
            {r.note ? <span className="note">{r.note}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** An empty value, said in words rather than with a dash. */
export function NoValue() {
  const { t } = useT()
  return <span className="ix-novalue">{t('sim.view.noValue')}</span>
}

/**
 * Everything that changes on every animation frame: the clock, the scene (2D or 3D), the
 * transport, the time slider, the live values and the plot cursor. Kept in its own component
 * so the rest of the block (sliders, tables, challenge) does not re-render 30 times a second;
 * this matters on low-end phones. `between` (computed results) is rendered between the live
 * values and the plot; `controlRef.current` exposes { reset, restart } and
 * `onStatus({ playing, time, speed })` reports pauses (not frames) for the AI tutor.
 * `stageHints` ({ maxLength, maxAmp }) size the 3D stand and track from the sliders' ranges,
 * so moving a slider never rebuilds them.
 */
export function SimAnimation({ model, A, B, duration, moneyUnit, issues = [], asset, imageStatus, imageUrl, imageMissing, series, plotBase, plotSummary, between, controlRef, onStatus, idPrefix, stageHints }) {
  const { t, fmt, lang } = useT()
  const uid = useId().replace(/[:]/g, '')
  const stageRef = useRef(null)
  const view3dRef = useRef(null)
  const [speed, setSpeed] = useState(1)
  const { rate, step } = clockSettings(model, duration, B?.outputs)
  const clock = useSimClock({ duration, rate, speed, stepSize: step, autoplay: true, rootRef: stageRef })
  const time = Math.min(clock.t, duration)
  const atEnd = duration > 0 && time >= duration - 1e-9
  const canPlay = Boolean(B) && duration > 0

  // ------------------------------------------------------------------ 2D or 3D
  const kind3d = STAGE_3D[model] || null
  const offer3d = Boolean(kind3d) && can3D()
  const [view, setView] = useState(() => (offer3d ? readView() || '3d' : '2d'))
  const [status3d, setStatus3d] = useState(null)
  const show3d = offer3d && view === '3d'
  const live3d = show3d && status3d !== 'failed' && status3d !== 'off'
  const changeView = (v) => {
    setView(v)
    saveView(v)
  }

  const { reset, restart, reduced } = clock
  useEffect(() => {
    if (!controlRef) return
    controlRef.current = {
      reset,
      restart: () => {
        restart()
        stageRef.current?.scrollIntoView?.({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
      },
    }
  }, [controlRef, reset, restart, reduced])

  const pausedAt = clock.playing ? null : Number(time.toFixed(2))
  useEffect(() => {
    onStatus?.({ playing: clock.playing, time: pausedAt, speed })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock.playing, pausedAt, speed])

  const num = (v, d) => fmt.number(v, d ?? digitsFor(v))
  const money = (v) => (Number.isFinite(v) ? `${num(v, digitsFor(v, 2))}${moneyUnit ? ` ${moneyUnit}` : ''}` : t('sim.view.noValue'))
  const timeText = (v) => (model === 'compound_interest' ? t('sim.time.years', { value: num(v, 1) }) : t('sim.time.seconds', { value: num(v, 2) }))

  // ------------------------------------------------------------------ live values
  const nowRows = []
  let cursorX = time
  if (B) {
    const s = B.stateAt(Math.min(time, B.duration))
    if (model === 'pendulum') {
      nowRows.push({ key: 't', label: t('sim.now.time'), value: time, unit: 's', digits: 2 })
      nowRows.push({ key: 'theta', label: t('sim.now.angle'), symbol: 'θ', value: s.thetaDeg, unit: '°', digits: 1 })
      nowRows.push({ key: 'v', label: t('sim.now.speed'), symbol: 'v', value: Math.abs(s.omega) * B.values.L, unit: 'm/s', digits: 2 })
    } else if (model === 'projectile') {
      cursorX = s.x
      nowRows.push({ key: 't', label: t('sim.now.time'), value: Math.min(time, B.duration), unit: 's', digits: 2 })
      nowRows.push({ key: 'x', label: t('sim.now.distance'), symbol: 'x', value: s.x, unit: 'm', digits: 2 })
      nowRows.push({ key: 'y', label: t('sim.now.height'), symbol: 'y', value: s.y, unit: 'm', digits: 2 })
      nowRows.push({ key: 'v', label: t('sim.now.speed'), symbol: 'v', value: Math.hypot(s.vx, s.vy), unit: 'm/s', digits: 2 })
    } else if (model === 'compound_interest') {
      nowRows.push({ key: 'year', label: t('sim.now.year'), value: s.t, unit: t('sim.units.years'), digits: 1 })
      nowRows.push({ key: 'amount', label: t('sim.now.amount'), symbol: 'A', value: s.amount, unit: moneyUnit, digits: digitsFor(s.amount, 2) })
      nowRows.push({ key: 'interest', label: t('sim.now.interestSoFar'), value: s.amount - s.principal, unit: moneyUnit, digits: digitsFor(s.amount - s.principal, 2) })
    } else {
      nowRows.push({ key: 't', label: t('sim.now.time'), value: time, unit: 's', digits: 2 })
      nowRows.push({ key: 'x', label: t('sim.now.displacement'), symbol: 'x', value: s.x, unit: 'm', digits: 3 })
      nowRows.push({ key: 'v', label: t('sim.now.velocity'), symbol: 'v', value: s.v, unit: 'm/s', digits: 3 })
    }
  }

  // ------------------------------------------------------------------ what the scene shows, in words
  const describeOne = (res) => {
    if (!res) return ''
    const v = res.values
    const o = res.outputs
    if (model === 'pendulum') return t('sim.scene.describe.pendulum', { L: num(v.L, 2), theta0: num(v.theta0, 1), T: num(o.period, 2) })
    if (model === 'projectile') return t('sim.scene.describe.projectile', { v0: num(v.v0, 1), angle: num(v.angle, 1), h0: num(v.h0, 1), range: num(o.range, 1), H: num(o.max_height, 2) })
    if (model === 'spring_mass') return t('sim.scene.describe.spring_mass', { m: num(v.m, 2), k: num(v.k, 1), x0: num(v.x0, 2), T: num(o.period, 2) })
    return t('sim.scene.describe.compound_interest', { P: money(v.P), r: num(v.r, 2), n: num(v.n, 0), t: num(v.t, 1), A: money(o.amount) })
  }
  const description = A
    ? `${t('sim.scene.describe.scenario', { name: t('sim.compare.scenarioA'), text: describeOne(A) })} ${t('sim.scene.describe.scenario', { name: t('sim.compare.scenarioB'), text: describeOne(B) })}`
    : describeOne(B)
  const descId = `${uid}-desc`

  // ------------------------------------------------------------------ scene
  const items = []
  if (A) items.push({ key: 'A', label: 'A', color: COLOR_A, dash: true, result: A, stateAt: A.stateAt, L: A.values.L, imageUrl })
  if (B) items.push({ key: 'B', label: 'B', color: A ? COLOR_B : COLOR_ONE, result: B, stateAt: B.stateAt, L: B.values.L, imageUrl })
  const sceneTitle = t('sim.scene.title', { model: t(`sim.models.${model}`) })
  let scene = null
  if (B) {
    if (model === 'pendulum') scene = <PendulumScene items={items} t={time} maxLength={Math.max(...items.map((i) => i.L))} title={sceneTitle} describedBy={descId} />
    else if (model === 'projectile') scene = <ProjectileScene items={items} t={time} title={sceneTitle} describedBy={descId} />
    else if (model === 'spring_mass')
      scene = <SpringScene items={items} t={time} maxAmp={Math.max(...items.map((i) => Math.abs(i.result.values.x0)), 0.01)} title={sceneTitle} labels={{ equilibrium: t('sim.scene.equilibrium') }} describedBy={descId} />
    else {
      const one = (res, tag) => (
        <InterestScene
          result={res}
          t={time}
          title={tag ? t('sim.scene.titleOf', { title: sceneTitle, name: tag }) : sceneTitle}
          formatMoney={money}
          labels={{ year: t('sim.scene.yearOf', { year: num(Math.min(time, res.duration), 1), total: num(res.duration, 1) }) }}
          describedBy={tag ? undefined : descId}
        />
      )
      scene = A ? (
        <div className="sim-compare-grid" role="group" aria-describedby={descId}>
          {[
            ['A', A, COLOR_A],
            ['B', B, COLOR_B],
          ].map(([tag, res, color]) => (
            <figure key={tag} className="sim-compare-cell">
              <figcaption>
                <span className="ix-scenario-tag" style={{ '--tag': color }}>
                  <span className={`swatch${tag === 'A' ? ' dash' : ''}`} aria-hidden="true" />
                  {tag === 'A' ? t('sim.compare.scenarioA') : t('sim.compare.scenarioB')}
                </span>
              </figcaption>
              {one(res, tag)}
            </figure>
          ))}
        </div>
      ) : (
        one(B)
      )
    }
  }

  // the same scene in 3D: a pure function of the clock and the results, like the 2D one
  let stage3d = null
  if (B && live3d) {
    const st = scene3dState(model, items, time, { num })
    const shape =
      kind3d === 'pendulum'
        ? {
            lanes: items.length,
            maxLength: pendulumStandLength(stageHints?.maxLength, items),
            tags: items.length > 1 ? items.map((i) => i.label) : null,
            formatLength: (m) => fmt.number(m, 1),
            rulerUnit: 'm',
            lengthText: (L, tag) => (tag ? t('sim.scene.lengthTagged', { tag, value: num(L, 2) }) : t('sim.scene.length', { value: num(L, 2) })),
            locale: lang,
          }
        : kind3d === 'projectile'
          ? { lanes: items.length, tags: items.length > 1 ? items.map((i) => i.label) : null, formatMetres: (m, bare) => (bare ? fmt.number(m, 2) : t('sim.scene.metres', { value: fmt.number(m, 2) })), locale: lang }
          : {
              lanes: items.length,
              tags: items.length > 1 ? items.map((i) => i.label) : null,
              maxAmp: springMaxAmp(stageHints?.maxAmp, items),
              labels: { equilibrium: t('sim.scene.equilibrium') },
              formatMetres: (m, bare) => (bare ? fmt.number(m, 3) : t('sim.scene.metres', { value: fmt.number(m, 3) })),
              locale: lang,
            }
    stage3d = (
      <SimLab3D
        kind={kind3d}
        shape={shape}
        state={st}
        images={items.map((i) => i.imageUrl || null)}
        label={sceneTitle}
        describedBy={descId}
        fallback={scene}
        controlRef={view3dRef}
        onStatus={setStatus3d}
      />
    )
  }

  const playLabel = clock.playing ? t('sim.controls.pause') : atEnd ? t('sim.controls.replay') : time > 0 ? t('sim.controls.resume') : t('sim.controls.play')

  return (
    <>
      <div ref={stageRef} className="sim-stage-wrap stack-sm">
        {B && offer3d && status3d !== 'failed' ? (
          <div className="sim-stage-tools">
            {live3d && status3d === 'ready' ? <IconButton icon={RotateCcw} size="sm" label={t('sim.scene.resetView')} onClick={() => view3dRef.current?.resetView()} /> : null}
            <Segmented
              size="sm"
              label={t('sim.scene.viewLabel')}
              value={show3d ? '3d' : '2d'}
              onChange={changeView}
              options={[
                { value: '3d', label: t('sim.scene.view3d') },
                { value: '2d', label: t('sim.scene.view2d') },
              ]}
            />
          </div>
        ) : null}
        {B ? (
          <div className={`sim-stage sim-stage-${model}`} data-view={live3d ? '3d' : '2d'} data-lanes={items.length}>
            {live3d ? stage3d : scene}
          </div>
        ) : (
          <Alert tone="warning" title={t('sim.view.invalidTitle')}>
            <ul className="sim-issues">
              {issues.map((text, i) => (
                <li key={i}>{text}</li>
              ))}
            </ul>
          </Alert>
        )}
        {B ? (
          <p id={descId} className="visually-hidden">
            {description}
          </p>
        ) : null}
        {B && live3d ? <p className="sim-stage-note">{t(`sim.scene.note3d.${model}`)}</p> : null}
        {model === 'compound_interest' && B ? (
          <ul className="sim-legend" aria-label={t('sim.scene.legend')}>
            <li>
              <span className="key principal" aria-hidden="true" />
              {t('sim.scene.legendPrincipal')}
            </li>
            <li>
              <span className="key interest" aria-hidden="true" />
              {t('sim.scene.legendInterest')}
            </li>
            <li>
              <span className="key simple" aria-hidden="true" />
              {t('sim.scene.legendSimple')}
            </li>
          </ul>
        ) : null}
        {asset && imageStatus === 'ready' ? (
          <p className="sim-caption">
            <img src={asset.url} alt="" className="sim-caption-thumb" />
            <span>{asset.meta?.phrase ? t('sim.scene.objectCaptionNamed', { phrase: asset.meta.phrase }) : t('sim.scene.objectCaption')}</span>
          </p>
        ) : null}
        {asset && imageStatus === 'failed' ? <p className="sim-stage-note">{t('sim.scene.imageFailed')}</p> : null}
        {imageMissing ? <p className="sim-stage-note">{t('sim.scene.imageMissing')}</p> : null}
      </div>

      <div className="sim-transport" role="group" aria-label={t('sim.controls.label')}>
        <Button className="sim-play" icon={clock.playing ? Pause : Play} disabled={!canPlay} onClick={clock.playing ? clock.pause : clock.play}>
          {playLabel}
        </Button>
        <IconButton icon={StepBack} bordered label={t('sim.controls.stepBack')} disabled={!canPlay || time <= 0} onClick={() => clock.step(-1)} />
        <IconButton icon={StepForward} bordered label={t('sim.controls.stepForward')} disabled={!canPlay || atEnd} onClick={() => clock.step(1)} />
        <IconButton icon={Rewind} bordered label={t('sim.controls.rewind')} disabled={!canPlay || (time <= 0 && !clock.playing)} onClick={clock.reset} />
        <div className="sim-speed">
          <Segmented size="sm" label={t('sim.controls.speed')} value={speed} onChange={setSpeed} options={SPEEDS.map((s) => ({ value: s, label: `${fmt.number(s, 2)}×` }))} />
        </div>
      </div>
      <div className="sim-time">
        <label htmlFor={`${idPrefix}-time`}>{t('sim.controls.time')}</label>
        <input
          id={`${idPrefix}-time`}
          type="range"
          className="range"
          min={0}
          max={duration > 0 ? duration : 1}
          step={duration > 0 ? duration / 400 : 0.01}
          value={time}
          disabled={!canPlay}
          aria-valuetext={timeText(time)}
          onChange={(e) => {
            clock.pause()
            clock.seek(Number(e.target.value))
          }}
        />
        <span className="sim-time-value" aria-hidden="true">
          {timeText(time)}
        </span>
      </div>
      {clock.reduced && !clock.playing && time === 0 ? <p className="sim-stage-note">{t('sim.controls.reducedMotion')}</p> : null}

      {B ? (
        <section className="sim-section" aria-labelledby={`${idPrefix}-now`}>
          <h3 className="ix-heading" id={`${idPrefix}-now`}>
            {A ? t('sim.now.titleB') : t('sim.now.title')}
          </h3>
          <Readouts rows={nowRows} label={t('sim.now.title')} />
        </section>
      ) : null}

      {between}

      {B && plotBase ? <Plot series={series} {...plotBase} cursorX={cursorX} summary={plotSummary} height={240} /> : null}
    </>
  )
}
