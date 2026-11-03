import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useId } from 'react'
import { ArrowLeftRight, Columns2, Lightbulb, Maximize, RefreshCw, RotateCcw, X } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { Alert, Button, MathTex, RichText } from '../../../components/ui/index.js'
import { Plot } from '../../../components/charts/Plot.jsx'
import { niceDomain, robustDomain } from '../../../components/charts/scale.js'
import { tryCompile } from '../../../lib/expr.js'
import { BlockFrame } from '../BlockRenderer.jsx'
import { useBlockEnv } from '../BlockEnv.jsx'
import { ParamControls } from '../../sim/ParamControls.jsx'
import { ExplainChange } from '../../sim/ExplainChange.jsx'
import { ActiveLearningPanel, autoActiveConfig } from '../../sim/ActiveLearning.jsx'
import { useReportState } from '../../sim/useReportState.js'
import { useElementSize } from '../steps/lessonHooks.js'
import { direction, effectiveRange, paramLabel, sameValues, suggestChange, valuesOf } from '../../sim/paramUtils.js'
import { analyzeFunction, exprToTex, featureSummary, featureValue, lhsTex, makeFn, missingSymbols, OBSERVE_KEYS, sampleFunction } from './graphMath.js'
import '../../sim/interactive.css'
import './graph.css'

/** x range of a graph block, repaired when missing or reversed. */
export function graphXRange(block) {
  let a = Number(block.x_min)
  let b = Number(block.x_max)
  if (!Number.isFinite(a)) a = -10
  if (!Number.isFinite(b)) b = 10
  if (a === b) b = a + 1
  return a < b ? [a, b] : [b, a]
}

function autoDomain(pointLists) {
  const ys = []
  pointLists.forEach((pts) => pts && pts.forEach((p) => Number.isFinite(p[1]) && ys.push(p[1])))
  if (!ys.length) return [-10, 10]
  return niceDomain(...robustDomain(ys), 6)
}

/** Expression status for the learner and the editor: { ok, compiled?, error?, missing[] }. */
export function useExpression(block, symbols) {
  const xVar = String(block.x_var || 'x').trim() || 'x'
  const expression = String(block.expression || '')
  return useMemo(() => {
    if (!expression.trim()) return { ok: false, empty: true, missing: [], xVar }
    const res = tryCompile(expression)
    if (!res.ok) return { ok: false, error: res.error, missing: [], xVar }
    const missing = missingSymbols(expression, xVar, symbols)
    return { ok: missing.length === 0, compiled: res.compiled, missing, xVar }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expression, xVar, symbols.join('|')])
}

/** The first `count` sentences of a text's opening paragraph (up to a list or display math; inline
 *  math and decimals never end a sentence; the whole paragraph when it has fewer) and the rest. */
function leadSentences(text, count = 2) {
  const full = String(text || '').replace(/\r\n/g, '\n').trim()
  const lines = []
  for (const line of full.split('\n')) {
    if (!line.trim() || /^\s*([-*+•]\s|\d+[.)]\s|#|\$\$)/.test(line)) break
    lines.push(line)
  }
  const paragraph = lines.join('\n')
  const masked = paragraph.replace(/\$[^$\n]*\$/g, (math) => 'x'.repeat(math.length))
  const stop = /[.!?…]["”’)\]]*(?=\s|$)/g
  let end = paragraph.length
  for (let i = 0, match; i < count && (match = stop.exec(masked)); i += 1) if (i === count - 1) end = match.index + match[0].length
  const lead = paragraph.slice(0, end).trim()
  return { lead, rest: full.slice(lead.length).trim() }
}

/** Smallest plot a lesson slide draws, whatever room the sheet leaves (px): a 1366x768 laptop
 *  leaves about 190px under the formula, and the plot fits there rather than scroll its panel. */
const SLIDE_PLOT_MIN = 160

export function GraphView({ block }) {
  const { t, fmt, lang } = useT()
  const env = useBlockEnv()
  const slideMode = env.presentation === 'slides'
  const [slideTab, setSlideTab] = useState('explore')
  const slideTabsId = useId().replace(/:/g, '')
  // On a slide the plot takes the height the sheet leaves it: its host flexes, the plot's own
  // head and foot (axis name, data table button) are measured once drawn and the rest is the plot.
  const plotHostRef = useRef(null)
  const { height: plotHostHeight } = useElementSize(plotHostRef)
  const [plotChrome, setPlotChrome] = useState(72)
  useLayoutEffect(() => {
    if (!slideMode) return
    const figure = plotHostRef.current?.querySelector('.cl-plot')
    const svg = figure?.querySelector('.cl-plot-frame > svg')
    if (!figure || !svg) return
    const chrome = Math.ceil(figure.getBoundingClientRect().height - svg.getBoundingClientRect().height)
    if (chrome > 0 && Math.abs(chrome - plotChrome) > 1) setPlotChrome(chrome)
  })
  const slidePlotHeight = Math.max(SLIDE_PLOT_MIN, Math.floor(plotHostHeight - plotChrome))
  const params = useMemo(() => (Array.isArray(block.params) ? block.params.filter((p) => p && p.symbol) : []), [block.params])
  const paramsKey = JSON.stringify(params.map((p) => [p.symbol, p.value, p.min, p.max, p.step]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const defaults = useMemo(() => valuesOf(params), [paramsKey])
  const symbols = useMemo(() => params.map((p) => p.symbol), [params])
  const expr = useExpression(block, symbols)
  const [xMin, xMax] = graphXRange(block)

  const [values, setValues] = useState(defaults)
  const [frozen, setFrozen] = useState(null)
  const [yOverride, setYOverride] = useState(null)
  // The lesson-wide “active learning” switch (env.activeMode) wins over the block default when present.
  // A challenge the teacher explicitly switched off (enabled: false) stays closed until the learner opens it.
  const lessonActive = typeof env.activeMode === 'boolean' ? env.activeMode && block.active?.enabled !== false : null
  const [alOpen, setAlOpen] = useState(lessonActive ?? Boolean(block.active?.enabled))
  const [alFocus, setAlFocus] = useState(false) // opened by the learner: move focus to the challenge
  const alToggleRef = useRef(null)
  const [alBase, setAlBase] = useState(null)
  const [alProgress, setAlProgress] = useState(null)

  useEffect(() => {
    setValues(defaults)
    setFrozen(null)
    setYOverride(null)
  }, [defaults])

  const fnFor = useCallback((vals) => (expr.ok ? makeFn(expr.compiled, expr.xVar, vals) : null), [expr])
  const curve = useCallback(
    (vals) => {
      const f = fnFor(vals)
      if (!f) return { points: [], features: null }
      const points = sampleFunction(f, xMin, xMax)
      return { points, features: analyzeFunction(f, xMin, xMax, points) }
    },
    [fnFor, xMin, xMax],
  )

  const B = useMemo(() => curve(values), [curve, values])
  const A = useMemo(() => (frozen ? curve(frozen) : null), [curve, frozen])
  const D = useMemo(() => curve(defaults), [curve, defaults])

  const fixedLo = Number.isFinite(block.y_min) ? Number(block.y_min) : null
  const fixedHi = Number.isFinite(block.y_max) ? Number(block.y_max) : null
  const initialY = useMemo(() => {
    const auto = autoDomain([D.points])
    const lo = fixedLo ?? auto[0]
    const hi = fixedHi ?? auto[1]
    return hi > lo ? [lo, hi] : auto
  }, [D.points, fixedLo, fixedHi])
  const yDomain = yOverride || initialY

  const inView = useMemo(() => {
    const finite = B.points.filter((p) => Number.isFinite(p[1]))
    if (!finite.length) return 1
    return finite.filter((p) => p[1] >= yDomain[0] && p[1] <= yDomain[1]).length / finite.length
  }, [B.points, yDomain])

  const tex = useMemo(() => exprToTex(block.expression, { lang, params: symbols }), [block.expression, lang, symbols])
  const lhs = lhsTex(block.y_label)
  const formulaText = `${block.y_label && lhs !== 'y' ? block.y_label : 'y'} = ${block.expression || ''}`

  useReportState(block.id, {
    type: 'graph',
    expression: block.expression,
    x_var: expr.xVar,
    params: values,
    features: featureSummary(B.features),
    scenario: frozen ? { A: frozen, B: values } : null,
    active_learning: alOpen ? alProgress : null,
  })

  const setParam = (symbol, v) => setValues((cur) => ({ ...cur, [symbol]: v }))
  const reset = () => {
    setValues(defaults)
    setFrozen(null)
    setYOverride(null)
  }
  const fit = () => setYOverride(autoDomain([B.points, A?.points]))
  const changed = frozen ? !sameValues(frozen, values) : !sameValues(defaults, values)

  // ------------------------------------------------------------ active learning config
  const inputParams = params.filter((p) => p.role !== 'output')
  const unitOf = (symbol) => params.find((p) => p.symbol === symbol)?.unit || ''
  const fmtParam = (symbol) => (v) => {
    const p = params.find((q) => q.symbol === symbol)
    const r = p ? effectiveRange(p) : { digits: 3 }
    const u = unitOf(symbol)
    return `${fmt.number(v, r.digits)}${u ? ` ${u}` : ''}`
  }
  const observeAt = useCallback(
    (base, symbol, v, key) => {
      const f = fnFor({ ...base, [symbol]: v })
      if (!f) return null
      return featureValue(analyzeFunction(f, xMin, xMax), key)
    },
    [fnFor, xMin, xMax],
  )

  const alConfig = useMemo(() => {
    if (!alOpen || !expr.ok || !inputParams.length) return null
    const base = alBase || values
    const teacher = block.active
    if (teacher && inputParams.some((p) => p.symbol === teacher.param) && Number.isFinite(teacher.from_value) && Number.isFinite(teacher.to_value) && teacher.from_value !== teacher.to_value) {
      return { ...teacher, observe: String(teacher.observe || '') }
    }
    const p = inputParams[0]
    const { from, to } = suggestChange({ ...p, value: base[p.symbol] ?? p.value })
    let observe = OBSERVE_KEYS[0]
    for (const key of OBSERVE_KEYS) {
      const a = observeAt(base, p.symbol, from, key)
      const b = observeAt(base, p.symbol, to, key)
      if (Number.isFinite(a) && Number.isFinite(b)) {
        observe = key
        if (direction(a, b) !== 'same') break
      }
    }
    return autoActiveConfig({
      t,
      param: p.symbol,
      from: { value: from, text: fmtParam(p.symbol)(from) },
      to: { value: to, text: fmtParam(p.symbol)(to) },
      paramText: paramLabel(p),
      observe,
      observeText: t(`graph.observe.${observe}`),
      observed: { before: observeAt(base, p.symbol, from, observe), after: observeAt(base, p.symbol, to, observe) },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alOpen, expr.ok, alBase, block.active, paramsKey, observeAt, t])

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
    if (slideMode) {
      setSlideTab('explore')
      window.requestAnimationFrame(() => document.getElementById(`${slideTabsId}-tab-explore`)?.focus())
    }
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
      setAlBase((b) => b || values)
      setAlOpen(true)
    } else {
      setAlOpen(false)
      setAlBase(null)
      setAlProgress(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonActive])

  const observeLabel = (key) => (OBSERVE_KEYS.includes(key) ? t(`graph.observe.${key}`) : key || t('graph.observe.unknown'))

  // ------------------------------------------------------------ rendering helpers
  const n = (v, d = 3) => fmt.number(v, d)
  const noValue = <span className="visually-hidden">{t('sim.chart.noValue')}</span>
  const point = (x, y) => t('graph.point', { x: n(x), y: n(y) })
  const series = frozen && A
    ? [
        { id: 'A', label: t('graph.scenarioA'), points: A.points, color: 2, dash: true },
        { id: 'B', label: t('graph.scenarioB'), points: B.points, color: 1 },
      ]
    : [{ id: 'y', label: block.y_label || 'y', points: B.points, color: 1 }]

  const markers = []
  const F = B.features
  if (F) {
    if (F.quadratic) markers.push({ x: F.quadratic.vertex.x, y: F.quadratic.vertex.y, label: t('graph.vertexShort'), color: 1 })
    else F.extrema.slice(0, 2).forEach((e) => markers.push({ x: e.x, y: e.y, label: e.kind === 'max' ? t('graph.maxShort') : t('graph.minShort'), color: 1 }))
    F.roots.slice(0, 4).forEach((x) => markers.push({ x, y: 0, color: 3, r: 4.5 }))
    if (F.yIntercept?.inRange) markers.push({ x: 0, y: F.yIntercept.y, color: 3, r: 4.5 })
  }

  const featureLines = useMemo(() => {
    const out = []
    if (!F) return out
    if (F.quadratic) {
      const q = F.quadratic
      const coef = (v) => (lang === 'vi' ? String(Number(v.toPrecision(6))).replace('.', '{,}') : String(Number(v.toPrecision(6))))
      // y = x² − 2x − 3: no "1x²", no "+ 0x", signs folded into the operators.
      const terms = [
        [q.a, 'x^{2}'],
        [q.b, 'x'],
        [q.c, ''],
      ].filter(([v]) => Math.abs(v) > 1e-12)
      const std = `y = ${
        terms
          .map(([v, x], i) => {
            const abs = Math.abs(v)
            const c = x && Math.abs(abs - 1) < 1e-12 ? '' : coef(abs)
            return i === 0 ? `${v < 0 ? '-' : ''}${c}${x}` : ` ${v < 0 ? '-' : '+'} ${c}${x}`
          })
          .join('') || '0'
      }`
      out.push({ key: 'std', node: <>{t('graph.features.standardForm')} <MathTex tex={std} /></> })
      out.push({ key: 'opens', text: t(q.opens === 'up' ? 'graph.features.opensUp' : 'graph.features.opensDown', { a: n(q.a) }) })
      out.push({ key: 'vertex', text: t(q.opens === 'up' ? 'graph.features.vertexMin' : 'graph.features.vertexMax', { point: point(q.vertex.x, q.vertex.y), x: n(q.vertex.x) }) })
      const discKey = q.discriminant > 0 ? 'discPositive' : q.discriminant === 0 ? 'discZero' : 'discNegative'
      out.push({ key: 'disc', text: `${t('graph.features.discriminant', { value: n(q.discriminant) })} ${t(`graph.features.${discKey}`)}` })
    } else if (F.kind === 'linear') {
      const s = F.linear.slope
      out.push({ key: 'slope', text: t(s > 0 ? 'graph.features.lineUp' : 'graph.features.lineDown', { slope: n(s), abs: n(Math.abs(s)) }) })
    } else if (F.kind === 'constant') {
      out.push({ key: 'const', text: t('graph.features.constant', { y: n(F.linear.intercept) }) })
    }
    if (F.yIntercept) out.push({ key: 'yint', text: t(F.yIntercept.inRange ? 'graph.features.yIntercept' : 'graph.features.yInterceptOut', { y: n(F.yIntercept.y) }) })
    if (F.roots.length) {
      const rootList = F.roots.map((r) => n(r)).join(t('graph.listSep'))
      out.push({ key: 'roots', text: t('graph.features.roots', { count: F.roots.length, list: rootList }) + (F.moreRoots ? ` ${t('graph.features.moreRoots')}` : '') })
    } else if (F.kind !== 'constant' || F.linear?.intercept !== 0) {
      const outside = F.quadratic && F.quadratic.rootCount > 0
      out.push({ key: 'noroots', text: outside ? t('graph.features.rootsOutside') : t('graph.features.noRoots') })
    }
    if (!F.quadratic) {
      F.extrema.forEach((e, i) => out.push({ key: `ex${i}`, text: t(e.kind === 'max' ? 'graph.features.localMax' : 'graph.features.localMin', { point: point(e.x, e.y) }) }))
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [F, lang, t])

  const summaryText = featureLines.filter((l) => l.text).map((l) => l.text).join(' ')
  // On a slide a column between the plot and the sliders says on arrival what the curve shows (a
  // polynomial up to degree 2; the formula heads the plot, so not its expanded form) and how the
  // teacher explains it; the results tab keeps the rest. A curve with no such lines keeps two
  // columns and the explanation sits under the sliders. One sentence: a second one overflowed both
  // columns on a 1366x768 sheet (the 3-sentence demo explanations, in vi and en).
  const readLines = slideMode && ['quadratic', 'linear', 'constant'].includes(F?.kind) ? featureLines.filter((line) => line.key !== 'std').slice(0, 5) : []
  const { lead: explanationLead, rest: explanationRest } = slideMode ? leadSentences(block.explanation, 1) : { lead: '', rest: block.explanation }
  const slideRead = readLines.length || explanationLead ? (
    <section className="gr-slide-read" aria-labelledby={`${slideTabsId}-read`}>
      <h3 className="ix-heading gr-heading" id={`${slideTabsId}-read`}>{t('graph.features.title')}</h3>
      {readLines.length ? <ul className="gr-feature-list">{readLines.map((line) => <li key={line.key}>{line.node || line.text}</li>)}</ul> : null}
      {explanationLead ? <RichText text={explanationLead} className="gr-slide-explain" /> : null}
    </section>
  ) : null

  const diffRows = useMemo(() => {
    if (!frozen || !A?.features || !B.features) return []
    const rows = []
    for (const p of inputParams) {
      const a = frozen[p.symbol]
      const b = values[p.symbol]
      if (Math.abs(a - b) > 1e-12) rows.push({ key: `p-${p.symbol}`, label: paramLabel(p), unit: p.unit, a, b })
    }
    for (const key of ['x_vertex', 'y_vertex', 'y_intercept', 'discriminant', 'root_count', 'slope']) {
      const a = featureValue(A.features, key)
      const b = featureValue(B.features, key)
      if (a === null && b === null) continue
      rows.push({ key, label: t(`graph.observe.${key}`), a, b })
    }
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frozen, A, B, values, t])

  const actions = (
    <Button ref={alToggleRef} size="sm" variant="soft" className="gr-toggle" icon={Lightbulb} aria-pressed={alOpen} disabled={!expr.ok || !inputParams.length} onClick={alOpen ? closeActive : openActive}>
      {t('sim.active.toggle')}
    </Button>
  )

  if (!expr.ok) {
    return (
      <BlockFrame block={block}>
        <Alert tone={expr.empty ? 'info' : 'warning'} title={expr.empty ? t('graph.view.emptyTitle') : t('graph.view.invalidTitle')}>
          {expr.empty
            ? t('graph.view.emptyBody')
            : expr.error
              ? `${t(`graph.exprErrors.${expr.error.code}`, { position: (expr.error.position ?? 0) + 1 })}`
              : t('graph.view.missingParams', { list: expr.missing.join(', ') })}
        </Alert>
      </BlockFrame>
    )
  }

  const graphToolbar = (<div className="ix-toolbar">
              <Button size="sm" icon={RotateCcw} onClick={reset}>
                {t('graph.reset')}
              </Button>
              <Button size="sm" icon={Maximize} onClick={fit}>
                {t('graph.fit')}
              </Button>
              {yOverride ? (
                <Button size="sm" variant="ghost" onClick={() => setYOverride(null)}>
                  {t('graph.fitUndo')}
                </Button>
              ) : null}
            </div>)
  const formulaPanel = (<div className="ix-formula gr-formula">
          <span className="gr-formula-label">{t('graph.formula')}</span>
          {tex ? <MathTex tex={`${lhs} = ${tex}`} /> : <code>{formulaText}</code>}
          {slideMode ? graphToolbar : null}
        </div>)
  const activePanel = (<>
{alOpen && alConfig ? (
          <ActiveLearningPanel
            focusOnMount={alFocus}
            blockId={block.id}
            config={alConfig}
            paramText={paramLabel(params.find((p) => p.symbol === alConfig.param))}
            formatParam={fmtParam(alConfig.param)}
            observeText={observeLabel(alConfig.observe)}
            observed={alObserved}
            formatObserved={(v) => n(v)}
            onApply={() => {
              const base = alBase || values
              setFrozen({ ...base, [alConfig.param]: alConfig.from_value })
              setValues({ ...base, [alConfig.param]: alConfig.to_value })
            }}
            sourceRefs={block.source_refs || []}
            explainSlot={
              <ExplainChange
                blockId={block.id}
                changed
                compareLabel={t('graph.explainVsA')}
                before={{ params: { ...(alBase || values), [alConfig.param]: alConfig.from_value }, question: alConfig.question }}
                after={{ params: { ...(alBase || values), [alConfig.param]: alConfig.to_value }, observe: alConfig.observe, observed: alObserved }}
              />
            }
            onProgress={setAlProgress}
            onClose={closeActive}
          />
        ) : null}
        {alOpen && !alConfig ? (
          <Alert tone="info">
            {t('graph.activeUnavailable')}
          </Alert>
        ) : null}
  </>)
  const comparePanel = (<div className="gr-well">
              <h4 className="ix-heading gr-heading-sm">{t('graph.compare.title')}</h4>
              {!frozen ? (
                <>
                  <p className="small muted" style={{ margin: 0 }}>
                    {t('graph.compare.hint')}
                  </p>
                  <div>
                    <Button size="sm" icon={Columns2} onClick={() => setFrozen({ ...values })}>
                      {t('graph.compare.start')}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="small" style={{ margin: 0 }}>
                    <span className="ix-scenario-tag" style={{ color: 'var(--cl-series-2)' }}>
                      <span className="swatch dash" aria-hidden="true" />
                      <span style={{ color: 'var(--cl-text)' }}>{t('graph.scenarioA')}</span>
                    </span>{' '}
                    <span className="gr-frozen">{inputParams.map((p) => `${p.symbol} = ${fmtParam(p.symbol)(frozen[p.symbol])}`).join(t('graph.listSep'))}</span>
                  </p>
                  <div className="ix-toolbar">
                    <Button size="sm" icon={RefreshCw} onClick={() => setFrozen({ ...values })}>
                      {t('graph.compare.update')}
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
                      {t('graph.compare.swap')}
                    </Button>
                    <Button size="sm" variant="ghost" icon={X} onClick={() => setFrozen(null)}>
                      {t('graph.compare.stop')}
                    </Button>
                  </div>
                </>
              )}
            </div>)
  const plot = (
    <Plot
      series={series}
      xDomain={[xMin, xMax]}
      yDomain={yDomain}
      xLabel={block.x_label || expr.xVar}
      yLabel={block.y_label || 'y'}
      markers={markers}
      title={t('graph.plotTitle', { formula: formulaText })}
      summary={summaryText}
      height={slideMode ? slidePlotHeight : 300}
    />
  )
  // On a slide the formula heads the plot's column, so the parameter rail beside it runs the panel's
  // full height (three sliders fit a 1366x768 sheet).
  const layoutPanel = (<div className="ix-layout">
          <div className="ix-main">
            {slideMode ? formulaPanel : null}
            {slideMode ? <div className="gr-plot-host" ref={plotHostRef}>{plot}</div> : plot}
            {inView < 0.3 ? (
              <Alert tone="info" action={<Button size="sm" icon={Maximize} onClick={fit}>{t('graph.fit')}</Button>}>
                {t('graph.outOfView')}
              </Alert>
            ) : null}
            {!slideMode ? graphToolbar : null}
          </div>
          {readLines.length ? slideRead : null}

          <div className="ix-side">
            <h3 className="ix-heading gr-heading">{t('graph.params')}</h3>
            {frozen ? (
              <p className="ix-sub">
                <span className="ix-scenario-tag" style={{ color: 'var(--cl-series-1)' }}>
                  <span className="swatch" aria-hidden="true" />
                  <span style={{ color: 'var(--cl-text)' }}>{t('graph.editingB')}</span>
                </span>
              </p>
            ) : !slideMode ? (
              // on a slide the sliders speak for themselves and the rail keeps its height for them
              <p className="ix-sub">{t('graph.paramsHint')}</p>
            ) : null}
            <ParamControls params={params} values={values} onChange={setParam} idPrefix={`g-${block.id}`} />
            {readLines.length ? null : slideRead}
            {slideMode ? <details className="gr-slide-compare"><summary>{t('graph.compare.title')}</summary>{comparePanel}</details> : comparePanel}
          </div>
        </div>)
  const resultsPanel = (<>
{frozen && diffRows.length ? (
          <div className="table-wrap gr-diff">
            <table className="table">
              <caption className="visually-hidden">{t('graph.compare.tableCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('graph.compare.quantity')}</th>
                  <th scope="col" className="num">
                    A
                  </th>
                  <th scope="col" className="num">
                    B
                  </th>
                  <th scope="col" className="num">
                    {t('graph.compare.change')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {diffRows.map((r) => (
                  <tr key={r.key}>
                    <th scope="row" className="gr-row-head">
                      {r.label}
                      {r.unit ? <span className="muted"> ({r.unit})</span> : null}
                    </th>
                    <td className="num">{r.a === null ? noValue : n(r.a)}</td>
                    <td className="num">{r.b === null ? noValue : n(r.b)}</td>
                    <td className="num">{r.a === null || r.b === null ? noValue : `${r.b - r.a > 0 ? '+' : r.b - r.a < 0 ? '−' : '±'}${n(Math.abs(r.b - r.a))}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <section className="gr-features" aria-labelledby={`gf-${block.id}`}>
          <h3 className="ix-heading gr-heading" id={`gf-${block.id}`}>
            {frozen ? t('graph.features.titleB') : t('graph.features.title')}
          </h3>
          <ul className="gr-feature-list">
            {featureLines.map((line) => (
              <li key={line.key}>{line.node || line.text}</li>
            ))}
          </ul>
          <p className="small muted" style={{ margin: 0 }}>
            {t('graph.features.note')}
          </p>
        </section>

        <ExplainChange
          blockId={block.id}
          changed={changed}
          compareLabel={frozen ? t('graph.explainVsA') : t('graph.explainVsStart')}
          before={{ params: frozen || defaults, features: featureSummary(frozen ? A?.features : D.features) }}
          after={{ params: values, features: featureSummary(B.features) }}
        />

        {explanationRest ? (
          <section className="stack-sm gr-explain">
            <h3 className="ix-heading gr-heading">{t('graph.explanationTitle')}</h3>
            <RichText text={explanationRest} />
          </section>
        ) : null}
  </>)

  const tabNames = ['explore', 'results', ...(inputParams.length ? ['predict'] : [])]
  const selectTab = (next) => {
    setSlideTab(next)
    if (next === 'predict' && !alOpen) { setAlBase(values); setAlFocus(false); setAlOpen(true) }
  }
  const keyTabs = (event) => {
    const index = tabNames.indexOf(slideTab)
    let next = null
    if (event.key === 'ArrowRight') next = tabNames[(index + 1) % tabNames.length]
    if (event.key === 'ArrowLeft') next = tabNames[(index - 1 + tabNames.length) % tabNames.length]
    if (event.key === 'Home') next = tabNames[0]
    if (event.key === 'End') next = tabNames[tabNames.length - 1]
    if (next) {
      event.preventDefault(); selectTab(next)
      document.getElementById(`${slideTabsId}-tab-${next}`)?.focus()
    }
  }
  return (
    <BlockFrame block={block} actions={slideMode ? null : actions}>
      {slideMode ? (
        <div className="ix-root gr-slide">
          <div className="gr-slide-tabs" role="tablist" aria-label={t('graph.slide.tabsLabel')} onKeyDown={keyTabs}>
            {tabNames.map((name) => <button type="button" role="tab" key={name} id={`${slideTabsId}-tab-${name}`}
              aria-selected={slideTab === name} aria-controls={`${slideTabsId}-panel-${name}`} tabIndex={slideTab === name ? 0 : -1}
              onClick={() => selectTab(name)}>{t(`graph.slide.${name}`)}</button>)}
          </div>
          <section className="gr-slide-panel gr-slide-explore" role="tabpanel" id={`${slideTabsId}-panel-explore`} aria-labelledby={`${slideTabsId}-tab-explore`} hidden={slideTab !== 'explore'}>
            {layoutPanel}
          </section>
          <section className="gr-slide-panel" role="tabpanel" id={`${slideTabsId}-panel-results`} aria-labelledby={`${slideTabsId}-tab-results`} hidden={slideTab !== 'results'}>
            {resultsPanel}
          </section>
          {inputParams.length ? <section className="gr-slide-panel" role="tabpanel" id={`${slideTabsId}-panel-predict`} aria-labelledby={`${slideTabsId}-tab-predict`} hidden={slideTab !== 'predict'}>
            {activePanel}
          </section> : null}
        </div>
      ) : <div className="ix-root stack">{formulaPanel}{activePanel}{layoutPanel}{resultsPanel}</div>}
    </BlockFrame>
  )
}
