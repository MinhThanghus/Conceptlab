import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftRight, CircleCheck, CircleX, Columns2, Lightbulb, RefreshCw, RotateCcw, TriangleAlert, X } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { Alert, Button, MathTex, RichText } from '../../../components/ui/index.js'
import { niceDomain } from '../../../components/charts/scale.js'
import { BlockFrame } from '../BlockRenderer.jsx'
import { useBlockEnv } from '../BlockEnv.jsx'
import { ParamControls } from '../../sim/ParamControls.jsx'
import { ExplainChange } from '../../sim/ExplainChange.jsx'
import { ActiveLearningPanel, autoActiveConfig } from '../../sim/ActiveLearning.jsx'
import { useReportState } from '../../sim/useReportState.js'
import { checkReferenceCase, MODEL_SPECS, naturalDuration, outputKeys, runModel } from '../../sim/models.js'
import { effectiveRange, sameValues, suggestChange, valuesOf } from '../../sim/paramUtils.js'
import { isSimModel, modelParams } from './simParams.js'
import { digitsFor, displaySymbol, FORMULA_TEX, HAS_OBJECT, MODEL_ASSUMPTIONS, modelUnit, OSCILLATORS, outputSymbol, outputUnit, pickObserve, RESULT_KEYS, roundOutputs, simParamLabel, toModelValues, unitFactors } from './simView.js'
import { COLOR_A, COLOR_B, NoValue, Readouts, SimAnimation } from './SimAnimation.jsx'
import '../../sim/interactive.css'
import './simulation.css'

const cap = (s) => (s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s)

/** Loads an image once to know whether it can be drawn (slow or broken links fall back to a shape). */
function useImageStatus(url) {
  const [state, setState] = useState({ url: null, status: 'idle' })
  useEffect(() => {
    if (!url) return undefined
    let alive = true
    const img = new Image()
    img.onload = () => alive && setState({ url, status: 'ready' })
    img.onerror = () => alive && setState({ url, status: 'failed' })
    img.src = url
    return () => {
      alive = false
    }
  }, [url])
  if (!url) return 'none'
  return state.url === url ? state.status : 'loading'
}

/**
 * Height of the nearest scrolling ancestor (a lesson slide's body), kept up to date: a slide sizes
 * its stage so the stage and its controls are in view on arrival. 0 when there is none.
 */
function useScrollerHeight(ref, enabled) {
  const [height, setHeight] = useState(0)
  useLayoutEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined
    let el = ref.current?.parentElement || null
    while (el && el !== document.body) {
      const overflow = window.getComputedStyle(el).overflowY
      if (overflow === 'auto' || overflow === 'scroll') break
      el = el.parentElement
    }
    if (!el || el === document.body) return undefined
    const update = () => setHeight(el.clientHeight)
    update()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, enabled])
  return height
}

/**
 * Learner view of a simulation block (spec §5.4, §6.2–6.3, §10.2–10.3): sliders with units
 * and provenance, run / pause / step / replay at 0.25–2×, live values, computed results,
 * a plot of the main quantity, two scenarios side by side, assumptions, reference checks
 * and the honest note that this is a simulation under stated assumptions.
 */
export function SimulationView({ block }) {
  const { t } = useT()
  if (!isSimModel(block.model)) {
    return (
      <BlockFrame block={block}>
        <Alert tone="warning" title={t('sim.view.unknownModelTitle')}>
          {t('sim.view.unknownModelBody', { model: String(block.model || t('sim.view.noValue')) })}
        </Alert>
      </BlockFrame>
    )
  }
  return <SimulationStage block={block} />
}

function SimulationStage({ block }) {
  const { t, fmt } = useT()
  const env = useBlockEnv()
  const uid = useId().replace(/[:]/g, '')
  const model = block.model
  const spec = MODEL_SPECS[model]
  const animRef = useRef(null)
  // On a lesson slide the stage comes first and large: the formula is a chip, the challenge
  // waits behind its button (the learner sees the simulation on arrival) and opens in the rail
  // beside the stage, so the run it asks for stays in view.
  const slideMode = env.presentation === 'slides'
  const rootRef = useRef(null)
  const screen = useScrollerHeight(rootRef, slideMode)

  // ------------------------------------------------------------------ parameters
  const paramsKey = JSON.stringify([model, block.params])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const all = useMemo(() => modelParams(model, block.params, t), [paramsKey, t])
  const definedCount = all.filter((p) => !p.added).length
  // Only the sliders the lesson defines; with none at all, the model defaults (marked as assumptions).
  const params = useMemo(() => (definedCount ? all.filter((p) => !p.added) : all.map((p) => ({ ...p, provenance: 'assumption' }))), [all, definedCount])
  const inputs = useMemo(() => params.filter((p) => p.role !== 'output'), [params])
  const missing = definedCount ? all.filter((p) => p.added) : []
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const defaults = useMemo(() => valuesOf(params), [JSON.stringify(params.map((p) => [p.symbol, p.value, p.min, p.max]))])
  const factors = useMemo(() => unitFactors(model, params), [model, params])
  const moneyUnit = model === 'compound_interest' ? params.find((p) => p.symbol === 'P')?.unit || t('sim.units.money') : ''
  const unitOf = (symbol) => params.find((p) => p.symbol === symbol)?.unit || modelUnit(model, symbol, (k) => t(`sim.units.${k}`), moneyUnit)

  // The 3D stand and track are sized from the sliders' ranges, so dragging never rebuilds them.
  const stageHints = useMemo(() => {
    const top = (symbol) => {
      const p = inputs.find((q) => q.symbol === symbol)
      return p ? toModelValues({ [symbol]: effectiveRange(p).max }, factors)[symbol] : undefined
    }
    return { maxLength: model === 'pendulum' ? top('L') : undefined, maxAmp: model === 'spring_mass' ? top('x0') : undefined }
  }, [inputs, factors, model])

  const [values, setValues] = useState(defaults)
  const [frozen, setFrozen] = useState(null)
  const [status, setStatus] = useState({ playing: false, time: 0, speed: 1 })
  // The lesson-wide “active learning” switch (env.activeMode) wins over the block default when present.
  // A challenge the teacher explicitly switched off (enabled: false) stays closed until the learner opens it.
  const lessonActive = typeof env.activeMode === 'boolean' ? env.activeMode && block.active?.enabled !== false : null
  const [alOpen, setAlOpen] = useState(slideMode ? false : lessonActive ?? Boolean(block.active?.enabled))
  const [alFocus, setAlFocus] = useState(false) // opened by the learner: move focus to the challenge
  const alToggleRef = useRef(null)
  const [alBase, setAlBase] = useState(null)
  const [alProgress, setAlProgress] = useState(null)

  useEffect(() => {
    setValues(defaults)
    setFrozen(null)
  }, [defaults])

  // ------------------------------------------------------------------ model runs (A and B share one clock)
  const oscillator = OSCILLATORS.includes(model)
  const mB = useMemo(() => toModelValues(values, factors), [values, factors])
  const mA = useMemo(() => (frozen ? toModelValues(frozen, factors) : null), [frozen, factors])
  const span = useMemo(() => (oscillator ? Math.max(naturalDuration(model, mB), mA ? naturalDuration(model, mA) : 0) : null), [oscillator, model, mB, mA])
  const runB = useMemo(() => runModel(model, mB, span ? { duration: span } : {}), [model, mB, span])
  const runA = useMemo(() => (mA ? runModel(model, mA, span ? { duration: span } : {}) : null), [model, mA, span])
  const B = runB.ok ? runB.result : null
  const A = runA?.ok ? runA.result : null
  // Outputs at the lesson's starting values ("what changed since the start?").
  const startOutputs = useMemo(() => {
    const run = runModel(model, toModelValues(defaults, factors), oscillator ? { duration: 1 } : {})
    return run.ok ? roundOutputs(run.result.outputs) : {}
  }, [model, defaults, factors, oscillator])
  const duration = Math.max(B?.duration || 0, A?.duration || 0)

  // ------------------------------------------------------------------ object from the photo (SAM cut-out)
  const asset = HAS_OBJECT[model] && block.object_asset_id ? env.assetById?.(block.object_asset_id) : null
  const imageStatus = useImageStatus(asset?.url || null)
  const imageUrl = imageStatus === 'ready' ? asset.url : null

  // ------------------------------------------------------------------ formatting
  const num = (v, d) => fmt.number(v, d ?? digitsFor(v))
  // Non-breaking spaces keep "b = 0 1/s" and "9,81 m/s²" on one line.
  const withUnit = (v, unit, d) => (Number.isFinite(v) ? `${num(v, d)}${unit ? `${unit === '°' ? '' : ' '}${unit}` : ''}` : t('sim.view.noValue'))
  const eq = (symbol, text) => `${displaySymbol(symbol)} = ${text}`
  const money = (v) => withUnit(v, moneyUnit, digitsFor(v, 2))
  const fmtParam = (symbol) => (v) => {
    const p = params.find((q) => q.symbol === symbol)
    const r = p ? effectiveRange(p) : { digits: 3 }
    return withUnit(v, unitOf(symbol), r.digits)
  }
  const timeText = (v) => (model === 'compound_interest' ? t('sim.time.years', { value: num(v, 1) }) : t('sim.time.seconds', { value: num(v, 2) }))
  const outputLabel = (key) => t(`sim.outputs.${key}`)
  const observeLabel = (key) => (outputKeys(model).includes(key) ? t(`sim.observe.${key}`) : key || t('sim.observe.unknown'))

  // ------------------------------------------------------------------ computed results
  const resultRows = []
  if (B) {
    const keys = [...RESULT_KEYS[model]]
    if (model === 'spring_mass' && B.values.b > 0) keys.push('damping_ratio')
    for (const key of keys) {
      const value = B.outputs[key]
      const row = { key, label: outputLabel(key), symbol: outputSymbol(model, key), value: Number.isFinite(value) ? value : null, unit: outputUnit(model, key, moneyUnit) }
      if (model === 'compound_interest') row.digits = digitsFor(value, 2)
      if (key === 'period_numeric') {
        if (!Number.isFinite(value)) row.note = t('sim.results.noOscillation')
        else {
          const diff = ((value - B.outputs.period) / B.outputs.period) * 100
          row.note = Math.abs(diff) < 0.05 ? t('sim.results.numericSame', { angle: num(B.values.theta0, 1) }) : t('sim.results.numericDiff', { angle: num(B.values.theta0, 1), diff: num(Math.abs(diff), Math.abs(diff) < 10 ? 2 : 1), more: diff > 0 ? t('sim.results.longer') : t('sim.results.shorter') })
        }
      }
      if (key === 'period' && model === 'pendulum') row.note = t('sim.results.formulaNote')
      if (key === 'simple_amount' && Number.isFinite(value)) row.note = t('sim.results.simpleNote', { diff: money(B.outputs.amount - value) })
      if (key === 'range' && B.values.h0 === 0 && B.values.angle > 0 && B.values.angle < 90) {
        row.note = Math.abs(B.values.angle - 45) < 0.05 ? t('sim.results.rangeBest') : t('sim.results.rangeNote', { other: num(90 - B.values.angle, 1) })
      }
      resultRows.push(row)
    }
  }

  // ------------------------------------------------------------------ plot of the main quantity
  const series = useMemo(() => {
    if (!B) return []
    const tagA = { id: 'A', label: t('sim.compare.scenarioA'), color: 2, dash: true }
    const tagB = { id: 'B', label: t('sim.compare.scenarioB'), color: 1 }
    const pick = (res) => res.plot.points
    if (model === 'compound_interest') {
      const out = []
      if (A) out.push({ ...tagA, points: pick(A) })
      out.push({ ...(A ? tagB : { id: 'B', label: t('sim.plot.compound'), color: 1 }), points: pick(B), showPoints: B.plot.points.length <= 41 })
      if (!A) out.push({ id: 'S', label: t('sim.plot.simple'), color: 4, dash: true, points: B.plot.simplePoints })
      return out
    }
    const single = { id: 'B', label: t(`sim.plot.series.${model}`), color: 1 }
    return A ? [{ ...tagA, points: pick(A) }, { ...tagB, points: pick(B) }] : [{ ...single, points: pick(B) }]
  }, [A, B, model, t])

  // Heights and money never go below 0: start the y axis at 0 instead of padding below it.
  const zeroBasedY = useMemo(() => {
    if (model !== 'projectile' && model !== 'compound_interest') return undefined
    let hi = 0
    for (const s of series) for (const p of s.points || []) if (Number.isFinite(p[1]) && p[1] > hi) hi = p[1]
    return hi > 0 ? niceDomain(0, hi * 1.04, 5) : undefined
  }, [series, model])

  const plotBase = useMemo(() => {
    if (model === 'projectile') return { xLabel: t('sim.plot.distance'), xUnit: 'm', yLabel: t('sim.plot.height'), yUnit: 'm', title: t('sim.plot.title.projectile'), yDomain: zeroBasedY }
    if (model === 'compound_interest') return { xLabel: t('sim.plot.year'), xUnit: t('sim.units.years'), yLabel: t('sim.plot.amount'), yUnit: moneyUnit, title: t('sim.plot.title.compound_interest'), yDomain: zeroBasedY, digits: 0 }
    if (model === 'pendulum') return { xLabel: t('sim.plot.time'), xUnit: 's', yLabel: t('sim.plot.angle'), yUnit: '°', title: t('sim.plot.title.pendulum'), xDomain: [0, duration] }
    return { xLabel: t('sim.plot.time'), xUnit: 's', yLabel: t('sim.plot.displacement'), yUnit: 'm', title: t('sim.plot.title.spring_mass'), xDomain: [0, duration] }
  }, [model, t, zeroBasedY, moneyUnit, duration])
  const mainKey = spec.primary
  const plotSummary = B ? `${outputLabel(mainKey)}: ${withUnit(B.outputs[mainKey], outputUnit(model, mainKey, moneyUnit), model === 'compound_interest' ? digitsFor(B.outputs[mainKey], 2) : undefined)}${A ? ` (A: ${withUnit(A.outputs[mainKey], outputUnit(model, mainKey, moneyUnit), model === 'compound_interest' ? digitsFor(A.outputs[mainKey], 2) : undefined)})` : ''}` : ''

  // ------------------------------------------------------------------ scenario comparison
  const setParam = (symbol, v) => setValues((cur) => ({ ...cur, [symbol]: v }))
  const resetParams = () => {
    setValues(defaults)
    setFrozen(null)
  }
  const changed = frozen ? !sameValues(frozen, values) : !sameValues(defaults, values)

  const diffRows = useMemo(() => {
    if (!frozen || !A || !B) return []
    const rows = []
    for (const p of inputs) {
      const a = frozen[p.symbol]
      const b = values[p.symbol]
      if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) > 1e-12) rows.push({ key: `p-${p.symbol}`, label: simParamLabel(p), unit: unitOf(p.symbol), a, b })
    }
    for (const key of RESULT_KEYS[model]) {
      const a = A.outputs[key]
      const b = B.outputs[key]
      if (!Number.isFinite(a) && !Number.isFinite(b)) continue
      rows.push({ key, label: outputLabel(key), unit: outputUnit(model, key, moneyUnit), a: Number.isFinite(a) ? a : null, b: Number.isFinite(b) ? b : null })
    }
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frozen, A, B, values, inputs, model, t])

  // ------------------------------------------------------------------ reference cases (spec §11)
  const checks = useMemo(() => (Array.isArray(block.reference_cases) ? block.reference_cases : []).map((c, i) => ({ i, c, r: checkReferenceCase(model, c) })), [model, block.reference_cases])
  const caseInputs = (c) =>
    Object.entries(c?.inputs || {})
      .filter(([, v]) => Number.isFinite(Number(v)) && v !== null)
      .map(([s, v]) => eq(s, withUnit(Number(v), modelUnit(model, s, (k) => t(`sim.units.${k}`), moneyUnit), 4)))
      .join(', ')

  // ------------------------------------------------------------------ assumptions
  const labAssumptions = (Array.isArray(env.assumptions) ? env.assumptions : []).filter((a) => a && String(a.text || '').trim())
  const missingText = missing.map((p) => eq(p.symbol, withUnit(p.value, p.unit, 4))).join(', ')

  // ------------------------------------------------------------------ active learning (spec §10.2)
  const observeAt = useCallback(
    (base, symbol, v, key) => {
      const run = runModel(model, toModelValues({ ...base, [symbol]: v }, factors), OSCILLATORS.includes(model) ? { duration: 1 } : {})
      const out = run.ok ? run.result.outputs[key] : null
      return Number.isFinite(out) ? out : null
    },
    [model, factors],
  )

  const alConfig = useMemo(() => {
    if (!alOpen || !inputs.length) return null
    const base = alBase || values
    const teacher = block.active
    if (teacher && inputs.some((p) => p.symbol === teacher.param) && Number.isFinite(teacher.from_value) && Number.isFinite(teacher.to_value) && teacher.from_value !== teacher.to_value) {
      return { ...teacher, observe: outputKeys(model).includes(teacher.observe) ? teacher.observe : spec.primary }
    }
    const p = inputs.find((q) => q.role !== 'constant') || inputs[0]
    const { from, to } = suggestChange({ ...p, value: base[p.symbol] ?? p.value })
    const observe = pickObserve(model, from, to, (v, key) => observeAt(base, p.symbol, v, key))
    return autoActiveConfig({
      t,
      param: p.symbol,
      from: { value: from, text: fmtParam(p.symbol)(from) },
      to: { value: to, text: fmtParam(p.symbol)(to) },
      paramText: simParamLabel(p),
      observe,
      observeText: observeLabel(observe),
      observed: { before: observeAt(base, p.symbol, from, observe), after: observeAt(base, p.symbol, to, observe) },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alOpen, alBase, block.active, inputs, observeAt, model, t])

  const alObserved = useMemo(() => {
    if (!alConfig) return null
    const base = alBase || values
    return {
      before: observeAt(base, alConfig.param, alConfig.from_value, alConfig.observe),
      after: observeAt(base, alConfig.param, alConfig.to_value, alConfig.observe),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alConfig, alBase, observeAt])

  const openActive = () => {
    setAlBase(values)
    setAlFocus(true)
    setAlOpen(true)
  }
  const closeActive = () => {
    // closing from inside the panel would leave focus nowhere: return it to the header toggle
    if (alToggleRef.current && document.activeElement !== alToggleRef.current) window.requestAnimationFrame(() => alToggleRef.current?.focus())
    setAlOpen(false)
    setAlFocus(false)
    setAlBase(null)
    setAlProgress(null)
  }
  useEffect(() => {
    if (alOpen && !alBase) setAlBase(values)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alOpen])
  useEffect(() => {
    if (lessonActive === null) return
    if (lessonActive) {
      // a slide opens on the simulation; the learner opens the challenge with its button
      if (slideMode) return
      setAlBase((b) => b || values)
      setAlOpen(true)
    } else {
      setAlOpen(false)
      setAlBase(null)
      setAlProgress(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonActive])

  // ------------------------------------------------------------------ AI tutor context
  useReportState(block.id, {
    type: 'simulation',
    model,
    params: values,
    units: Object.fromEntries(inputs.map((p) => [p.symbol, unitOf(p.symbol)])),
    outputs: B ? roundOutputs(B.outputs) : null,
    scenario: frozen ? { A: { params: frozen, outputs: A ? roundOutputs(A.outputs) : null }, B: { params: values, outputs: B ? roundOutputs(B.outputs) : null } } : null,
    time: status.playing ? null : status.time,
    playing: status.playing,
    speed: status.speed,
    reference_checks: checks.map(({ r }) => r.status),
    active_learning: alOpen ? alProgress : null,
  })

  const actions = (
    <Button ref={alToggleRef} size={slideMode ? undefined : 'sm'} variant={slideMode ? undefined : 'soft'} className="ix-toggle" icon={Lightbulb} aria-pressed={alOpen} disabled={!inputs.length || !B} onClick={alOpen ? closeActive : openActive}>
      {t('sim.active.toggle')}
    </Button>
  )

  const formula = (
    <div className="ix-formula">
      <span className="ix-formula-name">{t(`sim.models.${model}`)}</span>
      <span className="ix-formula-tex">
        {FORMULA_TEX[model].map((tex) => (
          <MathTex key={tex} tex={`{${tex}}`} />
        ))}
      </span>
    </div>
  )

  const challenge = alOpen ? (
    alConfig ? (
      <ActiveLearningPanel
        focusOnMount={alFocus}
        blockId={block.id}
        config={alConfig}
        paramText={simParamLabel(params.find((p) => p.symbol === alConfig.param))}
        formatParam={fmtParam(alConfig.param)}
        observeText={cap(observeLabel(alConfig.observe))}
        observed={alObserved}
        formatObserved={(v) => withUnit(v, outputUnit(model, alConfig.observe, moneyUnit), model === 'compound_interest' ? digitsFor(v, 2) : undefined)}
        onApply={() => {
          const base = alBase || values
          setFrozen({ ...base, [alConfig.param]: alConfig.from_value })
          setValues({ ...base, [alConfig.param]: alConfig.to_value })
          animRef.current?.reset()
        }}
        onRun={() => animRef.current?.restart()}
        sourceRefs={block.source_refs || []}
        explainSlot={
          <ExplainChange
            blockId={block.id}
            changed
            compareLabel={t('sim.view.explainVsA')}
            before={{ model, params: { ...(alBase || values), [alConfig.param]: alConfig.from_value }, question: alConfig.question }}
            after={{ model, params: { ...(alBase || values), [alConfig.param]: alConfig.to_value }, observe: alConfig.observe, observed: alObserved }}
          />
        }
        onProgress={setAlProgress}
        onClose={closeActive}
      />
    ) : (
      <Alert tone="info">{t('sim.view.activeUnavailable')}</Alert>
    )
  ) : null

  const results = B ? (
    <section className="sim-section sim-results" aria-labelledby={`${uid}-res`}>
      <h3 className="ix-heading" id={`${uid}-res`}>
        {A ? t('sim.results.titleB') : t('sim.results.title')}
      </h3>
      <Readouts rows={resultRows} accentFirst label={t('sim.results.title')} />
    </section>
  ) : null

  const compareBody = !frozen ? (
    <>
      <p className="ix-sub">{t(`sim.compare.hint.${model}`)}</p>
      <div>
        <Button size="sm" icon={Columns2} disabled={!B} onClick={() => setFrozen({ ...values })}>
          {t('sim.compare.start')}
        </Button>
      </div>
    </>
  ) : (
    <>
      <p className="sim-kept">
        <span className="ix-scenario-tag" style={{ '--tag': COLOR_A }}>
          <span className="swatch dash" aria-hidden="true" />
          {t('sim.compare.scenarioA')}
        </span>
        <span className="sim-kept-values">{inputs.map((p) => eq(p.symbol, fmtParam(p.symbol)(frozen[p.symbol]))).join(', ')}</span>
      </p>
      {!runA?.ok ? <p className="ix-sub">{t('sim.compare.invalidA')}</p> : null}
      <div className="ix-toolbar">
        <Button size="sm" icon={RefreshCw} onClick={() => setFrozen({ ...values })}>
          {t('sim.compare.update')}
        </Button>
        <Button
          size="sm"
          icon={ArrowLeftRight}
          onClick={() => {
            const a = frozen
            setFrozen({ ...values })
            setValues(a)
          }}
        >
          {t('sim.compare.swap')}
        </Button>
        <Button size="sm" variant="ghost" icon={X} onClick={() => setFrozen(null)}>
          {t('sim.compare.stop')}
        </Button>
      </div>
    </>
  )

  const paramsRail = (
    <>
      <h3 className="ix-heading">{t('sim.params.title')}</h3>
      {frozen ? (
        <p className="ix-sub">
          <span className="ix-scenario-tag" style={{ '--tag': COLOR_B }}>
            <span className="swatch" aria-hidden="true" />
            {t('sim.compare.editingB')}
          </span>
        </p>
      ) : (
        <p className="ix-sub">{t('sim.params.hint')}</p>
      )}
      <ParamControls params={inputs} values={values} onChange={setParam} idPrefix={`s-${block.id}`} labelOf={simParamLabel} />
      <div>
        <Button size="sm" variant="ghost" icon={RotateCcw} disabled={!changed && !frozen} onClick={resetParams}>
          {t('sim.params.reset')}
        </Button>
      </div>
      {slideMode ? results : null}
      {slideMode ? (
        <details className="sim-compare sim-slide-compare" open={Boolean(frozen) || undefined}>
          <summary>{t('sim.compare.title')}</summary>
          <div className="sim-slide-compare-body">{compareBody}</div>
        </details>
      ) : (
        <div className="ix-panel sim-compare">
          <h4 className="ix-heading">{t('sim.compare.title')}</h4>
          {compareBody}
        </div>
      )}
    </>
  )

  return (
    <BlockFrame block={block} actions={slideMode ? null : actions}>
      <div ref={rootRef} className={slideMode ? 'ix-root stack sim-slide' : 'ix-root stack'} style={slideMode && screen ? { '--sim-screen': `${screen}px` } : undefined}>
        {!slideMode ? formula : null}
        {!slideMode ? challenge : null}

        <div className="ix-layout">
          <div className="ix-main">
            <SimAnimation
              model={model}
              A={A}
              B={B}
              duration={duration}
              moneyUnit={moneyUnit}
              issues={(runB.issues || []).map((issue) => {
                const p = params.find((q) => q.symbol === issue.symbol)
                return t(`sim.issues.${issue.code}`, { name: p ? simParamLabel(p) : displaySymbol(issue.symbol || '') })
              })}
              asset={asset}
              imageStatus={imageStatus}
              imageUrl={imageUrl}
              imageMissing={Boolean(block.object_asset_id && HAS_OBJECT[model] && !asset)}
              series={series}
              plotBase={plotBase}
              plotSummary={plotSummary}
              stageHints={stageHints}
              controlRef={animRef}
              onStatus={setStatus}
              idPrefix={uid}
              between={slideMode ? null : results}
            />
          </div>

          <div className={slideMode && alOpen ? 'ix-side sim-rail is-challenge' : 'ix-side sim-rail'}>
            {/* on a slide the rail opens with the model's formula and the challenge button */}
            {slideMode ? (
              <div className="sim-rail-head">
                {formula}
                {actions}
              </div>
            ) : null}
            {slideMode && alOpen ? challenge : paramsRail}
          </div>
        </div>

        {frozen && diffRows.length ? (
          <div className="table-wrap sim-diff">
            <table className="table">
              <caption className="visually-hidden">{t('sim.compare.tableCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('sim.compare.quantity')}</th>
                  <th scope="col" className="num">
                    A
                  </th>
                  <th scope="col" className="num">
                    B
                  </th>
                  <th scope="col" className="num">
                    {t('sim.compare.change')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {diffRows.map((r) => {
                  const big = Math.max(Math.abs(r.a ?? 0), Math.abs(r.b ?? 0))
                  const raw = r.a === null || r.b === null ? null : r.b - r.a
                  const d = raw !== null && Math.abs(raw) <= 1e-9 * Math.max(1, big) ? 0 : raw
                  const digits = digitsFor(big, model === 'compound_interest' ? 2 : 3)
                  return (
                    <tr key={r.key}>
                      <th scope="row" className="sim-row-head">
                        {r.label}
                        {r.unit ? <span className="muted"> ({r.unit})</span> : null}
                      </th>
                      <td className="num">{r.a === null ? <NoValue /> : num(r.a, digits)}</td>
                      <td className="num">{r.b === null ? <NoValue /> : num(r.b, digits)}</td>
                      <td className="num">{d === null ? <NoValue /> : d === 0 ? '0' : `${d > 0 ? '+' : '−'}${num(Math.abs(d), digits)}`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="sim-info-grid">
          <section className="sim-info" aria-labelledby={`${uid}-assume`}>
            <h3 className="ix-heading" id={`${uid}-assume`}>
              {t('sim.assumptions.title')}
            </h3>
            {labAssumptions.length ? (
              <div className="stack-sm">
                <h4 className="sim-subhead">{t('sim.assumptions.lesson')}</h4>
                <ul className="sim-bullets">
                  {labAssumptions.map((a) => (
                    <li key={a.id || a.text}>
                      {a.text}
                      {!a.confirmed ? <span className="badge badge-warning sim-inline-badge">{t('sim.assumptions.unconfirmed')}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="stack-sm">
              <h4 className="sim-subhead">{t('sim.assumptions.model')}</h4>
              <ul className="sim-bullets">
                {MODEL_ASSUMPTIONS[model].map((key) => (
                  <li key={key}>{t(`sim.assume.${model}.${key}`)}</li>
                ))}
                {missing.length ? <li>{t('sim.assumptions.defaults', { list: missingText })}</li> : null}
              </ul>
            </div>
          </section>

          {checks.length ? (
            <section className="sim-info sim-ref" aria-labelledby={`${uid}-ref`}>
              {/* Collapsed when every case matches (shorter on phones); opens itself when something fails. */}
              <details open={checks.some(({ r }) => r.status !== 'pass')}>
                <summary>
                  <h3 className="ix-heading" id={`${uid}-ref`}>
                    {t('sim.ref.title')}
                  </h3>
                  <span className={`badge ${checks.every(({ r }) => r.status === 'pass') ? 'badge-success' : 'badge-warning'}`}>
                    {t('sim.ref.summary', { pass: checks.filter(({ r }) => r.status === 'pass').length, total: checks.length })}
                  </span>
                </summary>
              <p className="ix-sub">{t('sim.ref.intro')}</p>
              <ul className="ix-check-list sim-checks">
                {checks.map(({ i, c, r }) => {
                  const unit = r.key ? outputUnit(model, r.key, moneyUnit) : ''
                  const d = r.key && model === 'compound_interest' ? 2 : 4
                  return (
                    <li key={i} className={`sim-check ${r.status}`}>
                      <span className="sim-check-status">
                        {r.status === 'pass' ? <CircleCheck aria-hidden="true" /> : r.status === 'fail' ? <CircleX aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}
                        {t(`sim.ref.status.${r.status}`)}
                      </span>
                      <span className="sim-check-body">
                        <span>
                          {t('sim.ref.case', {
                            output: r.key ? `${outputLabel(r.key)} ${outputSymbol(model, r.key) || ''}`.trim() : String(c?.output ?? ''),
                            inputs: caseInputs(c) || t('sim.ref.noInputs'),
                          })}
                        </span>
                        {r.status === 'error' ? (
                          <span className="sim-check-detail">{t(`sim.ref.errors.${r.code}`, { output: String(c?.output ?? ''), name: displaySymbol(r.symbol || ''), suggestion: r.suggestion ? outputLabel(r.suggestion) : '' })}</span>
                        ) : (
                          <span className="sim-check-detail">
                            {t('sim.ref.values', {
                              actual: withUnit(r.actual, unit, d),
                              expected: withUnit(Number(c.expected), unit, d),
                              tolerance: fmt.number(Math.abs(Number(c.tolerance ?? 0.01)) * 100, 2),
                            })}
                          </span>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
              </details>
            </section>
          ) : null}
        </div>

        <p className="ix-disclaimer">
          <TriangleAlert aria-hidden="true" />
          <span>{asset ? t('sim.view.disclaimerPhoto') : t('sim.view.disclaimer')}</span>
        </p>

        {block.notes ? (
          <section className="sim-notes">
            <h3 className="ix-heading">{t('sim.view.notesTitle')}</h3>
            <RichText text={block.notes} />
          </section>
        ) : null}

        {B ? (
          <ExplainChange
            blockId={block.id}
            changed={changed}
            compareLabel={frozen ? t('sim.view.explainVsA') : t('sim.view.explainVsStart')}
            before={{ model, params: frozen || defaults, outputs: frozen ? (A ? roundOutputs(A.outputs) : {}) : startOutputs }}
            after={{ model, params: values, outputs: roundOutputs(B.outputs) }}
          />
        ) : null}

      </div>
    </BlockFrame>
  )
}
