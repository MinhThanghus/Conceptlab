import { useMemo, useState } from 'react'
import { CircleCheck, CircleX, Eye, Image as ImageIcon, Info, Lightbulb, Plus, Settings, Trash2, TriangleAlert } from 'lucide-react'
import { translate, useT } from '../../../i18n/index.jsx'
import { Alert, Button, ConfirmDialog, IconButton, MathTex, RichText, SelectField, TabsWithPanels, TextArea, TextField } from '../../../components/ui/index.js'
import { useBlockEnv } from '../BlockEnv.jsx'
import { BlockMetaEditor } from '../../sim/BlockMetaEditor.jsx'
import { NumberInput } from '../../sim/NumberInput.jsx'
import { ParamsEditor } from '../../sim/ParamsEditor.jsx'
import { ActiveLearningEditor } from '../../sim/ActiveLearningEditor.jsx'
import { autoActiveConfig } from '../../sim/ActiveLearning.jsx'
import { checkReferenceCase, MODEL_SPECS, outputKeys, paramSymbols, referenceOutputs, runModel, SIM_MODEL_IDS } from '../../sim/models.js'
import { effectiveRange, suggestChange, valuesOf } from '../../sim/paramUtils.js'
import { convertParam, defaultParams, isSimModel, modelParams, sampleReferenceCases, unitMismatch, unusedParams } from './simParams.js'
import { displaySymbol, FORMULA_TEX, HAS_OBJECT, MODEL_ASSUMPTIONS, modelUnit, OSCILLATORS, outputSymbol, outputUnit, pickObserve, simParamLabel, toModelValues, unitFactors } from './simView.js'
import { SimulationView } from './SimulationView.jsx'
import '../../sim/interactive.css'
import './simulation.css'

const MAX_CASES = 10
const stripAdded = ({ added, ...p }) => p // eslint-disable-line no-unused-vars

/** Teacher editor for a reference case list (spec §11 — checked before publishing). */
function ReferenceCasesEditor({ model, cases, onChange, moneyUnit, idPrefix }) {
  const { t, fmt } = useT()
  const spec = MODEL_SPECS[model]
  const symbols = paramSymbols(model)
  const outputs = referenceOutputs(model)
  const tUnit = (k) => t(`sim.units.${k}`)
  const update = (index, patch) => onChange(cases.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  const setInput = (index, symbol, v) => {
    const inputs = { ...(cases[index].inputs || {}) }
    if (v === null || v === undefined) delete inputs[symbol]
    else inputs[symbol] = v
    update(index, { inputs })
  }
  const addCase = () => {
    const samples = sampleReferenceCases(model)
    const key = (c) => JSON.stringify([c.inputs, c.output])
    const used = new Set(cases.map(key))
    const next = samples.find((c) => !used.has(key(c))) || { ...(cases[cases.length - 1] || samples[0]), inputs: { ...(cases[cases.length - 1] || samples[0]).inputs } }
    onChange([...cases, next])
  }
  const withUnit = (v, unit, d = 4) => (Number.isFinite(v) ? `${fmt.number(v, d)}${unit ? ` ${unit}` : ''}` : t('sim.view.noValue'))

  return (
    <div className="stack">
      {!cases.length ? <p className="small muted" style={{ margin: 0 }}>{t('sim.editor.casesEmpty')}</p> : null}
      {cases.map((c, index) => {
        const r = checkReferenceCase(model, c)
        const outKey = outputs.includes(c.output) ? c.output : null
        const unit = outKey ? outputUnit(model, outKey, moneyUnit) : ''
        const tolPct = Number.isFinite(Number(c.tolerance)) ? Number((Number(c.tolerance) * 100).toPrecision(6)) : null
        const base = `${idPrefix}-${index}`
        return (
          <fieldset key={index} className="sim-case">
            <legend className="visually-hidden">{t('sim.editor.caseN', { n: index + 1 })}</legend>
            <header>
              <strong>{t('sim.editor.caseN', { n: index + 1 })}</strong>
              <IconButton icon={Trash2} size="sm" label={t('sim.editor.removeCase', { n: index + 1 })} onClick={() => onChange(cases.filter((_, i) => i !== index))} />
            </header>
            <p className="small muted" style={{ margin: 0 }}>
              {t('sim.editor.caseInputsHint')}
            </p>
            <div className="ix-grid">
              {symbols.map((s) => {
                const def = spec.inputDefaults[s]
                const required = spec.required.includes(s)
                const u = modelUnit(model, s, tUnit, moneyUnit)
                return (
                  <NumberInput
                    key={s}
                    id={`${base}-${s}`}
                    label={`${displaySymbol(s)}${u ? ` (${u})` : ''}`}
                    value={c.inputs?.[s] ?? null}
                    allowEmpty
                    required={required}
                    placeholder={def !== undefined ? t('sim.editor.defaultPlaceholder', { value: fmt.number(def, 4) }) : undefined}
                    error={required && (c.inputs?.[s] === undefined || c.inputs?.[s] === null) ? t('sim.editor.inputRequired') : undefined}
                    onChange={(v) => setInput(index, s, v)}
                  />
                )
              })}
            </div>
            <div className="ix-grid">
              <SelectField
                id={`${base}-out`}
                label={t('sim.editor.output')}
                value={outKey || ''}
                placeholder={t('sim.editor.choose')}
                options={outputs.map((k) => ({ value: k, label: `${t(`sim.outputs.${k}`)} (${outputSymbol(model, k)})` }))}
                error={!outKey ? (c.output ? t('sim.editor.outputUnknown', { output: String(c.output) }) : t('sim.editor.outputRequired')) : undefined}
                onChange={(e) => update(index, { output: e.target.value })}
              />
              <NumberInput id={`${base}-exp`} label={`${t('sim.editor.expected')}${unit ? ` (${unit})` : ''}`} value={c.expected} required onChange={(v) => update(index, { expected: v })} />
              <NumberInput
                id={`${base}-tol`}
                label={t('sim.editor.tolerance')}
                hint={t('sim.editor.toleranceHint')}
                value={tolPct}
                required
                onChange={(v) => update(index, { tolerance: Math.abs(v) / 100 })}
              />
            </div>
            {r.status === 'error' && r.code === 'unknownOutput' && r.suggestion ? (
              <div>
                <Button size="sm" onClick={() => update(index, { output: r.suggestion })}>
                  {t('sim.editor.useSuggestion', { output: t(`sim.outputs.${r.suggestion}`) })}
                </Button>
              </div>
            ) : null}
            <div className={`sim-case-result sim-check ${r.status}`} aria-live="polite">
              <span className="sim-check-status">
                {r.status === 'pass' ? <CircleCheck aria-hidden="true" /> : r.status === 'fail' ? <CircleX aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}
                {t(`sim.ref.status.${r.status}`)}
              </span>
              {r.status === 'error' ? (
                <span>{t(`sim.ref.errors.${r.code}`, { output: String(c.output ?? ''), name: displaySymbol(r.symbol || ''), suggestion: r.suggestion ? t(`sim.outputs.${r.suggestion}`) : '' })}</span>
              ) : (
                <span>{t('sim.ref.values', { actual: withUnit(r.actual, unit), expected: withUnit(Number(c.expected), unit), tolerance: fmt.number(Math.abs(Number(c.tolerance ?? 0.01)) * 100, 2) })}</span>
              )}
            </div>
            {r.status === 'fail' ? <p className="small muted" style={{ margin: 0 }}>{t('sim.editor.failHint')}</p> : null}
          </fieldset>
        )
      })}
      <div className="ix-toolbar">
        <Button icon={Plus} disabled={cases.length >= MAX_CASES} onClick={addCase}>
          {t('sim.editor.addCase')}
        </Button>
        {cases.length >= MAX_CASES ? <span className="small muted">{t('sim.editor.maxCases', { max: MAX_CASES })}</span> : null}
      </div>
    </div>
  )
}

/** Picker for the moving object: SAM cut-outs of this lab (spec §6.1, §6.3). */
function ObjectPicker({ value, onChange, idPrefix }) {
  const { t } = useT()
  const env = useBlockEnv()
  const cutouts = (env.assets || []).filter((a) => a && a.kind === 'cutout' && a.url)
  const selectedMissing = value && !cutouts.some((a) => a.id === value)
  return (
    <div className="stack-sm">
      {cutouts.length ? (
        <fieldset style={{ border: 0, margin: 0, padding: 0, minInlineSize: 0 }}>
          <legend className="visually-hidden">{t('sim.editor.objectTitle')}</legend>
          <div className="sim-asset-grid">
            <label className="sim-asset">
              <input type="radio" name={`${idPrefix}-object`} checked={!value} onChange={() => onChange(null)} />
              <span className="none" aria-hidden="true">
                <ImageIcon size={22} />
              </span>
              <span className="name">{t('sim.editor.objectNone')}</span>
            </label>
            {cutouts.map((a, i) => (
              <label key={a.id} className="sim-asset">
                <input type="radio" name={`${idPrefix}-object`} checked={value === a.id} onChange={() => onChange(a.id)} />
                <img src={a.url} alt="" loading="lazy" />
                <span className="name">{a.meta?.label || a.meta?.phrase || t('sim.editor.cutoutN', { n: i + 1 })}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          {t('sim.editor.noCutouts')}
        </p>
      )}
      {selectedMissing ? (
        <Alert
          tone="warning"
          action={
            <Button size="sm" onClick={() => onChange(null)}>
              {t('sim.editor.objectClear')}
            </Button>
          }
        >
          {t('sim.editor.objectMissing')}
        </Alert>
      ) : null}
    </div>
  )
}

export function SimulationEditor({ block, onChange }) {
  const { t, lang, fmt } = useT()
  const env = useBlockEnv()
  const [tab, setTab] = useState('setup')
  const [pendingModel, setPendingModel] = useState(null)
  const contentLang = env.language === 'en' || env.language === 'vi' ? env.language : lang
  const tl = (key, vars) => translate(contentLang, key, vars)
  const set = (patch) => onChange({ ...block, ...patch })

  const model = isSimModel(block.model) ? block.model : null
  const params = useMemo(() => (Array.isArray(block.params) ? block.params.filter(Boolean) : []), [block.params])
  const symbols = model ? paramSymbols(model) : []
  const known = params.filter((p) => symbols.includes(p.symbol))
  const unknown = model ? unusedParams(model, params) : []
  const missing = model ? modelParams(model, params, tl).filter((p) => p.added) : []
  const pParam = known.find((p) => p.symbol === 'P')
  const moneyUnit = model === 'compound_interest' ? pParam?.unit || t('sim.units.money') : ''
  const cases = Array.isArray(block.reference_cases) ? block.reference_cases : []
  const writeKnown = (next) => set({ params: [...next, ...unknown] })

  const applyModel = (next) => {
    set({
      model: next,
      params: defaultParams(next, tl),
      reference_cases: sampleReferenceCases(next),
      active: null,
      object_asset_id: HAS_OBJECT[next] ? block.object_asset_id || null : null,
    })
    setPendingModel(null)
  }
  const requestModel = (next) => {
    if (!isSimModel(next) || next === model) return
    if (!model) applyModel(next)
    else setPendingModel(next)
  }

  // Suggested active-learning config, written in the lab's language (it is stored in the spec).
  const suggest = () => {
    const inputs = known.filter((p) => p.role !== 'output')
    const p = inputs.find((q) => q.role !== 'constant') || inputs[0]
    if (!model || !p) return { enabled: true, question: '', param: p?.symbol || '', from_value: null, to_value: null, observe: model ? MODEL_SPECS[model].primary : '', options: [], correct_option: null, explanation: '' }
    const base = valuesOf(known)
    const factors = unitFactors(model, known)
    const at = (v, key) => {
      const run = runModel(model, toModelValues({ ...base, [p.symbol]: v }, factors), OSCILLATORS.includes(model) ? { duration: 1 } : {})
      const out = run.ok ? run.result.outputs[key] : null
      return Number.isFinite(out) ? out : null
    }
    const { from, to } = suggestChange(p)
    const observe = pickObserve(model, from, to, at)
    const r = effectiveRange(p)
    const nf = new Intl.NumberFormat(contentLang === 'en' ? 'en-US' : 'vi-VN', { maximumFractionDigits: r.digits })
    const text = (v) => `${nf.format(v)}${p.unit ? ` ${p.unit}` : ''}`
    const cfg = autoActiveConfig({
      t: tl,
      param: p.symbol,
      from: { value: from, text: text(from) },
      to: { value: to, text: text(to) },
      paramText: simParamLabel(p),
      observe,
      observeText: tl(`sim.observe.${observe}`),
      observed: { before: at(from, observe), after: at(to, observe) },
    })
    return { ...cfg, auto: undefined }
  }

  const observeOptions = model ? outputKeys(model).map((k) => ({ value: k, label: `${t(`sim.outputs.${k}`)} (${outputSymbol(model, k)})` })) : []

  const setup = (
    <div className="ix-editor">
      <BlockMetaEditor block={block} onChange={onChange} />

      <section className="ix-editor-section">
        <h3>{t('sim.editor.modelTitle')}</h3>
        <SelectField
          label={t('sim.editor.model')}
          hint={t('sim.editor.modelHint')}
          value={model || ''}
          placeholder={t('sim.editor.choose')}
          error={!model ? t('sim.editor.modelUnknown', { model: String(block.model || t('sim.view.noValue')) }) : undefined}
          options={SIM_MODEL_IDS.map((m) => ({ value: m, label: t(`sim.models.${m}`) }))}
          onChange={(e) => requestModel(e.target.value)}
        />
        {model ? (
          <div className="card-muted stack-sm">
            <p style={{ margin: 0 }}>{t(`sim.modelInfo.${model}`)}</p>
            <div className="ix-formula">
              {FORMULA_TEX[model].map((tex) => (
                <MathTex key={tex} tex={`{${tex}}`} />
              ))}
            </div>
            <p className="small" style={{ margin: 0, fontWeight: 600 }}>
              {t('sim.assumptions.model')}
            </p>
            <ul className="sim-bullets small">
              {MODEL_ASSUMPTIONS[model].map((key) => (
                <li key={key}>{t(`sim.assume.${model}.${key}`)}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {model ? (
        <section className="ix-editor-section">
          <h3>{t('sim.editor.paramsTitle')}</h3>
          <p className="small muted" style={{ margin: 0 }}>
            {t('sim.editor.paramsHint')}
          </p>
          {model === 'compound_interest' && pParam ? (
            <TextField
              label={t('sim.editor.moneyUnit')}
              hint={t('sim.editor.moneyUnitHint')}
              value={pParam.unit || ''}
              maxLength={40}
              onChange={(e) => writeKnown(known.map((p) => (p.symbol === 'P' ? { ...p, unit: e.target.value } : p)))}
            />
          ) : null}
          {known.map((p) => {
            const mm = unitMismatch(model, p)
            if (!mm) return null
            return (
              <Alert
                key={`mm-${p.symbol}`}
                tone="warning"
                action={
                  <Button size="sm" onClick={() => writeKnown(known.map((q) => (q.symbol === p.symbol ? (mm.factor ? convertParam(q, mm.factor, mm.expected) : { ...q, unit: mm.expected }) : q)))}>
                    {mm.factor ? t('sim.editor.convert', { unit: mm.expected }) : t('sim.editor.useUnit', { unit: mm.expected })}
                  </Button>
                }
              >
                {mm.factor ? t('sim.editor.unitConvertible', { name: simParamLabel(p), given: mm.given, unit: mm.expected }) : t('sim.editor.unitUnknown', { name: simParamLabel(p), given: mm.given, unit: mm.expected })}
              </Alert>
            )
          })}
          {known.length ? (
            <ParamsEditor params={known} onChange={writeKnown} locked idPrefix={`sp-${block.id}`} />
          ) : (
            <Alert
              tone="info"
              action={
                <Button size="sm" icon={Plus} onClick={() => set({ params: [...defaultParams(model, tl), ...unknown] })}>
                  {t('sim.editor.addDefaults')}
                </Button>
              }
            >
              {t('sim.editor.noParams')}
            </Alert>
          )}
          {known.length && missing.length ? (
            <div className="ix-panel">
              <p className="small" style={{ margin: 0 }}>
                {t('sim.editor.missingIntro')}
              </p>
              <div className="ix-chips">
                {missing.map((p) => (
                  <Button key={p.symbol} size="sm" icon={Plus} onClick={() => writeKnown([...known, stripAdded(p)])}>
                    {t('sim.editor.addParam', { name: simParamLabel(p), value: `${fmt.number(p.value, 4)}${p.unit ? `${p.unit === '°' ? '' : ' '}${p.unit}` : ''}` })}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          {unknown.length ? (
            <Alert
              tone="warning"
              title={t('sim.editor.unknownTitle')}
              action={
                <Button size="sm" icon={Trash2} onClick={() => set({ params: known })}>
                  {t('sim.editor.removeUnknown')}
                </Button>
              }
            >
              {t('sim.editor.unknownBody', { list: unknown.map((p) => p.symbol).join(', '), expected: symbols.map(displaySymbol).join(', ') })}
            </Alert>
          ) : null}
        </section>
      ) : null}

      {model && HAS_OBJECT[model] ? (
        <section className="ix-editor-section">
          <h3>{t('sim.editor.objectTitle')}</h3>
          <p className="small muted" style={{ margin: 0 }}>
            {t('sim.editor.objectHint')}
          </p>
          <ObjectPicker value={block.object_asset_id || null} onChange={(id) => set({ object_asset_id: id })} idPrefix={`so-${block.id}`} />
        </section>
      ) : null}

      {model ? (
        <section className="ix-editor-section">
          <h3>{t('sim.editor.casesTitle')}</h3>
          <p className="small muted" style={{ margin: 0 }}>
            {t('sim.editor.casesHint')}
          </p>
          <ReferenceCasesEditor model={model} cases={cases} moneyUnit={moneyUnit} onChange={(next) => set({ reference_cases: next })} idPrefix={`sc-${block.id}`} />
        </section>
      ) : null}

      <section className="ix-editor-section">
        <h3>{t('sim.editor.notesTitle')}</h3>
        <TextArea label={t('sim.editor.notes')} hint={t('sim.editor.notesHint')} rows={4} maxLength={12000} value={block.notes || ''} onChange={(e) => set({ notes: e.target.value })} />
        {block.notes ? (
          <div className="card-muted">
            <RichText text={block.notes} />
          </div>
        ) : null}
      </section>
    </div>
  )

  return (
    <div className="stack">
      <TabsWithPanels
        label={t('sim.editor.tabsLabel')}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'setup', label: t('sim.editor.tabSetup'), icon: Settings, content: <div style={{ paddingBlockStart: 'var(--space-md)' }}>{setup}</div> },
          {
            id: 'active',
            label: t('sim.editor.tabActive'),
            icon: Lightbulb,
            content: (
              <div style={{ paddingBlockStart: 'var(--space-md)' }} className="stack">
                <p className="small muted" style={{ margin: 0 }}>
                  {t('sim.editor.activeIntro')}
                </p>
                {model ? (
                  <ActiveLearningEditor value={block.active || null} onChange={(active) => set({ active })} params={known} observeOptions={observeOptions} suggest={suggest} />
                ) : (
                  <Alert tone="info">{t('sim.editor.chooseModelFirst')}</Alert>
                )}
              </div>
            ),
          },
          {
            id: 'preview',
            label: t('sim.editor.tabPreview'),
            icon: Eye,
            content: (
              <div className="ix-preview">
                <span className="ix-preview-label">
                  <Eye size={14} aria-hidden="true" />
                  {t('sim.editor.previewLabel')}
                </span>
                {tab === 'preview' ? <SimulationView block={block} /> : null}
              </div>
            ),
          },
        ]}
      />
      <ConfirmDialog
        open={Boolean(pendingModel)}
        onClose={() => setPendingModel(null)}
        onConfirm={() => applyModel(pendingModel)}
        title={t('sim.editor.switchTitle')}
        confirmLabel={t('sim.editor.switchConfirm')}
      >
        <p style={{ margin: 0 }}>{pendingModel ? t('sim.editor.switchBody', { model: t(`sim.models.${pendingModel}`) }) : null}</p>
        <p className="small muted" style={{ marginBlockEnd: 0 }}>
          <Info size={14} aria-hidden="true" /> {t('sim.editor.switchNote')}
        </p>
      </ConfirmDialog>
    </div>
  )
}
