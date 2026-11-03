import { useMemo, useState } from 'react'
import { Eye, Lightbulb, Plus, Settings } from 'lucide-react'
import { translate, useT } from '../../../i18n/index.jsx'
import { Alert, Button, MathTex, RichText, TabsWithPanels, TextArea, TextField } from '../../../components/ui/index.js'
import { Plot } from '../../../components/charts/Plot.jsx'
import { useBlockEnv } from '../BlockEnv.jsx'
import { BlockMetaEditor } from '../../sim/BlockMetaEditor.jsx'
import { NumberInput } from '../../sim/NumberInput.jsx'
import { newParam, ParamsEditor } from '../../sim/ParamsEditor.jsx'
import { ActiveLearningEditor } from '../../sim/ActiveLearningEditor.jsx'
import { autoActiveConfig } from '../../sim/ActiveLearning.jsx'
import { direction, effectiveRange, isIdentifier, paramLabel, suggestChange, valuesOf } from '../../sim/paramUtils.js'
import { analyzeFunction, exprToTex, featureValue, lhsTex, makeFn, OBSERVE_KEYS, sampleFunction } from './graphMath.js'
import { GraphView, graphXRange, useExpression } from './GraphView.jsx'
import '../../sim/interactive.css'
import './graph.css'

const EXAMPLES = ['a*x^2 + b*x + c', 'a*(x - h)^2 + k', 'a*sin(b*x)', '2*pi*sqrt(L/g)', 'P*(1 + r/100)^x']

export function GraphEditor({ block, onChange }) {
  const { t, lang, fmt } = useT()
  const env = useBlockEnv()
  const [tab, setTab] = useState('setup')
  const contentLang = env.language === 'en' || env.language === 'vi' ? env.language : lang
  const tl = (key, vars) => translate(contentLang, key, vars)
  const set = (patch) => onChange({ ...block, ...patch })

  const params = Array.isArray(block.params) ? block.params : []
  const symbols = params.map((p) => p.symbol).filter(Boolean)
  const expr = useExpression(block, symbols)
  const [xMin, xMax] = graphXRange(block)
  const defaults = useMemo(() => valuesOf(params.filter((p) => p && p.symbol)), [params])
  const tex = useMemo(() => exprToTex(block.expression, { lang, params: symbols }), [block.expression, lang, symbols])

  const xVarError = !isIdentifier(expr.xVar) ? t('graph.editor.xVarInvalid') : symbols.includes(expr.xVar) ? t('graph.editor.xVarClash') : undefined
  const xRangeError = Number(block.x_min) >= Number(block.x_max) ? t('graph.editor.xRangeOrder') : undefined
  const yRangeError = Number.isFinite(block.y_min) && Number.isFinite(block.y_max) && block.y_min >= block.y_max ? t('graph.editor.yRangeOrder') : undefined
  const exprError = expr.empty ? t('graph.editor.exprRequired') : expr.error ? t(`graph.exprErrors.${expr.error.code}`, { position: (expr.error.position ?? 0) + 1 }) : undefined

  const preview = useMemo(() => {
    if (!expr.ok) return null
    const f = makeFn(expr.compiled, expr.xVar, defaults)
    return sampleFunction(f, xMin, xMax, 240)
  }, [expr, defaults, xMin, xMax])

  const addMissing = (list) => {
    let next = [...params]
    for (const sym of list) next = [...next, newParam(next, sym)]
    set({ params: next })
  }

  // Suggested active-learning config, written in the lab's language (it is stored in the spec).
  const suggest = () => {
    const inputs = params.filter((p) => p.symbol && p.role !== 'output')
    const p = inputs[0]
    if (!p || !expr.ok) return { enabled: true, question: '', param: p?.symbol || '', from_value: null, to_value: null, observe: 'y_vertex', options: [], correct_option: null, explanation: '' }
    const { from, to } = suggestChange(p)
    const at = (v, key) => featureValue(analyzeFunction(makeFn(expr.compiled, expr.xVar, { ...defaults, [p.symbol]: v }), xMin, xMax), key)
    let observe = OBSERVE_KEYS[0]
    for (const key of OBSERVE_KEYS) {
      const a = at(from, key)
      const b = at(to, key)
      if (Number.isFinite(a) && Number.isFinite(b)) {
        observe = key
        if (direction(a, b) !== 'same') break
      }
    }
    const r = effectiveRange(p)
    const text = (v) => `${fmt.number(v, r.digits)}${p.unit ? ` ${p.unit}` : ''}`
    const cfg = autoActiveConfig({
      t: tl,
      param: p.symbol,
      from: { value: from, text: text(from) },
      to: { value: to, text: text(to) },
      paramText: paramLabel(p),
      observe,
      observeText: tl(`graph.observe.${observe}`),
      observed: { before: at(from, observe), after: at(to, observe) },
    })
    return { ...cfg, auto: undefined }
  }

  const observeOptions = OBSERVE_KEYS.map((key) => ({ value: key, label: t(`graph.observe.${key}`) }))

  const setup = (
    <div className="ix-editor">
      <BlockMetaEditor block={block} onChange={onChange} />

      <section className="ix-editor-section">
        <h3>{t('graph.editor.formulaTitle')}</h3>
        <TextField
          className="gr-expr"
          label={t('graph.editor.expression')}
          hint={t('graph.editor.expressionHint', { x: expr.xVar })}
          value={block.expression || ''}
          maxLength={400}
          spellCheck={false}
          autoComplete="off"
          error={exprError}
          onChange={(e) => set({ expression: e.target.value })}
        />
        <div className="gr-syntax">
          <span className="small muted">{t('graph.editor.examples')}</span>
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="chip" onClick={() => set({ expression: ex })}>
              <code>{ex}</code>
            </button>
          ))}
        </div>
        {expr.missing.length ? (
          <Alert tone="warning" title={t('graph.editor.missingTitle')}>
            <div className="stack-sm">
              <span>{t('graph.editor.missingBody', { list: expr.missing.join(', ') })}</span>
              <div className="gr-missing">
                {expr.missing.map((sym) => (
                  <Button key={sym} size="sm" icon={Plus} onClick={() => addMissing([sym])}>
                    {t('graph.editor.addParam', { symbol: sym })}
                  </Button>
                ))}
                {expr.missing.length > 1 ? (
                  <Button size="sm" variant="soft" onClick={() => addMissing(expr.missing)}>
                    {t('graph.editor.addAll')}
                  </Button>
                ) : null}
              </div>
            </div>
          </Alert>
        ) : null}
        {tex ? (
          <div className="ix-formula gr-formula">
            <span className="gr-formula-label">{t('graph.editor.readAs')}</span>
            <MathTex tex={`${lhsTex(block.y_label)} = ${tex}`} />
          </div>
        ) : null}
        <div className="ix-grid">
          <TextField label={t('graph.editor.xVar')} value={block.x_var ?? 'x'} maxLength={20} inputClassName="mono" error={xVarError} onChange={(e) => set({ x_var: e.target.value.trim() })} />
          <NumberInput label={t('graph.editor.xMin')} value={block.x_min} onChange={(v) => set({ x_min: v })} required error={xRangeError} />
          <NumberInput label={t('graph.editor.xMax')} value={block.x_max} onChange={(v) => set({ x_max: v })} required />
          <NumberInput label={t('graph.editor.yMin')} hint={t('graph.editor.autoHint')} value={block.y_min} allowEmpty onChange={(v) => set({ y_min: v })} error={yRangeError} />
          <NumberInput label={t('graph.editor.yMax')} hint={t('graph.editor.autoHint')} value={block.y_max} allowEmpty onChange={(v) => set({ y_max: v })} />
        </div>
        <div className="ix-grid wide">
          <TextField label={t('graph.editor.xLabel')} hint={t('graph.editor.labelHint')} value={block.x_label || ''} maxLength={200} onChange={(e) => set({ x_label: e.target.value })} />
          <TextField label={t('graph.editor.yLabel')} value={block.y_label || ''} maxLength={200} onChange={(e) => set({ y_label: e.target.value })} />
        </div>
        {preview ? (
          <div className="gr-mini">
            <Plot
              series={[{ id: 'p', label: block.y_label || 'y', points: preview, color: 1 }]}
              xDomain={[xMin, xMax]}
              yDomain={Number.isFinite(block.y_min) && Number.isFinite(block.y_max) && block.y_max > block.y_min ? [block.y_min, block.y_max] : undefined}
              xLabel={block.x_label || expr.xVar}
              yLabel={block.y_label || 'y'}
              title={t('graph.editor.livePreview')}
              height={200}
            />
          </div>
        ) : null}
      </section>

      <section className="ix-editor-section">
        <h3>{t('graph.editor.paramsTitle')}</h3>
        <p className="small muted" style={{ margin: 0 }}>
          {t('graph.editor.paramsHint')}
        </p>
        <ParamsEditor params={params} onChange={(next) => set({ params: next })} idPrefix={`gp-${block.id}`} />
      </section>

      <section className="ix-editor-section">
        <h3>{t('graph.editor.explanationTitle')}</h3>
        <TextArea label={t('graph.editor.explanation')} hint={t('graph.editor.explanationHint')} rows={4} maxLength={12000} value={block.explanation || ''} onChange={(e) => set({ explanation: e.target.value })} />
        {block.explanation ? (
          <div className="card-muted">
            <RichText text={block.explanation} />
          </div>
        ) : null}
      </section>
    </div>
  )

  return (
    <div className="stack">
      <TabsWithPanels
        label={t('graph.editor.tabsLabel')}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'setup', label: t('graph.editor.tabSetup'), icon: Settings, content: <div style={{ paddingBlockStart: '1rem' }}>{setup}</div> },
          {
            id: 'active',
            label: t('graph.editor.tabActive'),
            icon: Lightbulb,
            content: (
              <div style={{ paddingBlockStart: '1rem' }} className="stack">
                <p className="small muted" style={{ margin: 0 }}>
                  {t('graph.editor.activeIntro')}
                </p>
                <ActiveLearningEditor value={block.active || null} onChange={(active) => set({ active })} params={params} observeOptions={observeOptions} suggest={suggest} />
              </div>
            ),
          },
          {
            id: 'preview',
            label: t('graph.editor.tabPreview'),
            icon: Eye,
            content: (
              <div className="gr-preview">
                <p className="gr-preview-label">{t('graph.editor.previewLabel')}</p>
                <GraphView block={block} />
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}
