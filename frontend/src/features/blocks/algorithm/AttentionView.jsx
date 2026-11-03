import { useEffect, useId, useMemo, useState } from 'react'
import { Dices, Info, Minus, Plus, RotateCcw } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { Button, IconButton, MathTex, Segmented, Switch, TextField } from '../../../components/ui/index.js'
import { Heatmap } from '../../../components/charts/Heatmap.jsx'
import { useReportState } from '../../sim/useReportState.js'
import { computeAttention, dotTerms, EXAMPLE_MATRICES, MAX_DIM, MAX_TOKENS, MIN_DIM, MIN_TOKENS, normalizeAttention, randomAttention, resizeAttention } from './attention.js'
import { MatrixGrid } from './MatrixGrid.jsx'
import { ExplanationSection } from './StepViews.jsx'

export const ATTENTION_STEPS = ['inputs', 'scores', 'scaled', 'weights', 'output']
const PRESETS = ['lesson', 'example', 'sameQK', 'uniform', 'random']

/** Localised default token labels for the built-in example. */
export function exampleTokens(t) {
  return [t('algorithm.attention.exampleTokens.t1'), t('algorithm.attention.exampleTokens.t2'), t('algorithm.attention.exampleTokens.t3'), t('algorithm.attention.exampleTokens.t4')]
}

function rangeOf(matrix) {
  const flat = matrix.flat().filter(Number.isFinite)
  if (!flat.length) return [0, 1]
  let lo = Math.min(...flat)
  let hi = Math.max(...flat)
  if (hi - lo < 1e-9) {
    lo -= 1
    hi += 1
  }
  return [lo, hi]
}

/** Editing controls for tokens and the matrix size (shared with the editor). */
export function AttentionInputs({ cfg, onChange, idPrefix }) {
  const { t } = useT()
  const n = cfg.tokens.length
  const dk = cfg.Q[0]?.length || MIN_DIM
  const newLabel = (i) => t('algorithm.attention.tokenN', { n: i + 1 })
  return (
    <div className="stack">
      <fieldset className="alg-tokens">
        <legend className="field-label">{t('algorithm.attention.tokens')}</legend>
        <div className="alg-token-list">
          {cfg.tokens.map((tok, i) => (
            <TextField
              key={i}
              id={`${idPrefix}-tok-${i}`}
              aria-label={t('algorithm.attention.tokenLabel', { n: i + 1 })}
              value={tok}
              maxLength={24}
              onChange={(e) => onChange({ ...cfg, tokens: cfg.tokens.map((x, k) => (k === i ? e.target.value : x)) })}
              onBlur={(e) => {
                if (!e.target.value.trim()) onChange({ ...cfg, tokens: cfg.tokens.map((x, k) => (k === i ? newLabel(i) : x)) })
              }}
            />
          ))}
          <div className="alg-token-buttons">
            <IconButton icon={Minus} bordered label={t('algorithm.attention.removeToken')} disabled={n <= MIN_TOKENS} onClick={() => onChange(resizeAttention(cfg, { tokens: n - 1 }, newLabel))} />
            <IconButton icon={Plus} bordered label={t('algorithm.attention.addToken')} disabled={n >= MAX_TOKENS} onClick={() => onChange(resizeAttention(cfg, { tokens: n + 1 }, newLabel))} />
          </div>
        </div>
        <span className="field-hint">{t('algorithm.attention.tokensHint', { min: MIN_TOKENS, max: MAX_TOKENS })}</span>
      </fieldset>
      <div className="alg-dim">
        <span className="field-label" id={`${idPrefix}-dim`}>
          {t('algorithm.attention.dim')}
        </span>
        <Segmented
          size="sm"
          label={t('algorithm.attention.dim')}
          value={dk}
          onChange={(d) => onChange(resizeAttention(cfg, { dim: d }, newLabel))}
          options={Array.from({ length: MAX_DIM - MIN_DIM + 1 }, (_, i) => ({ value: MIN_DIM + i, label: String(MIN_DIM + i) }))}
        />
      </div>
      <div className="alg-matrices">
        {['Q', 'K', 'V'].map((name) => (
          <MatrixGrid key={name} name={name} caption={t(`algorithm.attention.matrix.${name}`)} matrix={cfg[name]} rowLabels={cfg.tokens} onChange={(m) => onChange({ ...cfg, [name]: m })} />
        ))}
      </div>
    </div>
  )
}

/**
 * Scaled dot-product attention on a tiny example (spec §9.3): Q, K, V → scores → ÷√dₖ →
 * softmax heatmap → output. Inputs are editable here (not saved); a partial illustration.
 */
export function AttentionView({ block }) {
  const { t, fmt, lang } = useT()
  const uid = useId().replace(/[:]/g, '')
  const configKey = JSON.stringify(block.config ?? null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lesson = useMemo(() => normalizeAttention(block.config || {}), [configKey])
  const [cfg, setCfg] = useState(lesson)
  const [preset, setPreset] = useState('lesson')
  const [scale, setScale] = useState(true)
  const [step, setStep] = useState(0)
  const [active, setActive] = useState({ row: 0, col: 0 })

  useEffect(() => {
    setCfg(lesson)
    setPreset('lesson')
  }, [lesson])

  const n = cfg.tokens.length
  const res = useMemo(() => computeAttention(cfg, { scale }), [cfg, scale])
  const other = useMemo(() => computeAttention(cfg, { scale: !scale }), [cfg, scale])
  const row = Math.min(active?.row ?? 0, n - 1)
  const col = Math.min(active?.col ?? 0, n - 1)
  const num = (v, d = 2) => fmt.number(v, d)
  const tok = (i) => cfg.tokens[i] ?? String(i + 1)

  const applyPreset = (id) => {
    setPreset(id)
    if (id === 'lesson') setCfg(lesson)
    else if (id === 'example') setCfg(normalizeAttention({ ...EXAMPLE_MATRICES, tokens: exampleTokens(t) }))
    else if (id === 'sameQK') setCfg((c) => ({ ...c, K: c.Q.map((r) => [...r]) }))
    else if (id === 'uniform') setCfg((c) => ({ ...c, Q: c.Q.map((r) => r.map(() => 0)) }))
    else if (id === 'random') setCfg((c) => normalizeAttention(randomAttention(c.tokens, c.Q[0].length)))
  }
  const edit = (next) => {
    setCfg(next)
    setPreset(null)
  }

  const stepName = ATTENTION_STEPS[step]
  useReportState(block.id, {
    type: 'algorithm',
    algorithm: 'attention',
    step: stepName,
    scaled_by_sqrt_dk: scale,
    tokens: cfg.tokens,
    Q: cfg.Q,
    K: cfg.K,
    V: cfg.V,
    selected: { query: tok(row), key: tok(col) },
    weights: res.weights.map((r) => r.map((v) => Number(v.toFixed(3)))),
    output: res.output.map((r) => r.map((v) => Number(v.toFixed(3)))),
  })

  const terms = dotTerms(cfg.Q, cfg.K, row, col)
  const termsText = terms.map(([a, b]) => `${num(a)}×${num(b)}`).join(' + ')
  const maxW = (r) => Math.max(...r)
  // Every key within rounding distance of the largest weight (ties are common on tiny examples).
  const topKeys = (r) => r.map((w, j) => (maxW(r) - w < 0.005 ? j : -1)).filter((j) => j >= 0)
  const heat = (matrix, digits, range, captionKey) => (
    <Heatmap
      matrix={matrix}
      rowLabels={cfg.tokens}
      colLabels={cfg.tokens}
      min={range[0]}
      max={range[1]}
      digits={digits}
      caption={t(captionKey)}
      rowAxis={t('algorithm.attention.queryAxis')}
      colAxis={t('algorithm.attention.keyAxis')}
      active={{ row, col }}
      onActiveChange={(cell) => cell && setActive(cell)}
      cellLabel={(r, c, v) => t('algorithm.attention.cellAria', { query: tok(r), key: tok(c), value: num(v, digits) })}
    />
  )

  const outTerms = res.weights[row].map((w, j) => `${num(w)}·v${j + 1}`).join(' + ')

  return (
    <div className="ix-root stack">
      <div className="alg-presets">
        <span className="alg-presets-label">{t('algorithm.attention.presets')}</span>
        <div className="ix-chips" role="group" aria-label={t('algorithm.attention.presets')}>
          {PRESETS.map((id) => (
            <button key={id} type="button" className="chip" aria-pressed={preset === id} onClick={() => applyPreset(id)}>
              {id === 'random' ? <Dices size={16} aria-hidden="true" /> : null}
              {t(`algorithm.attention.preset.${id}`)}
            </button>
          ))}
        </div>
      </div>

      <ol className="alg-steps" aria-label={t('algorithm.attention.stepsLabel')}>
        {ATTENTION_STEPS.map((s, i) => (
          <li key={s}>
            <button type="button" className={i < step ? 'done' : undefined} aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)}>
              <span className="n" aria-hidden="true">
                {i + 1}
              </span>
              {t(`algorithm.attention.steps.${s}`)}
            </button>
          </li>
        ))}
      </ol>

      <section className="alg-step-body stack" aria-labelledby={`${uid}-step`}>
        <h3 className="ix-heading alg-heading" id={`${uid}-step`} aria-live="polite">
          {t('algorithm.attention.stepTitle', { n: step + 1, total: ATTENTION_STEPS.length, name: t(`algorithm.attention.steps.${stepName}`) })}
        </h3>

        {stepName === 'inputs' ? (
          <>
            <p className="alg-lead">{t('algorithm.attention.inputsIntro')}</p>
            <AttentionInputs cfg={cfg} onChange={edit} idPrefix={`${uid}-in`} />
          </>
        ) : null}

        {stepName === 'scores' ? (
          <>
            <div className="ix-formula alg-formula">
              <MathTex tex="{S = Q\,K^{\top}}" />
              <MathTex tex="{S_{ij} = q_i \cdot k_j}" />
            </div>
            <p className="alg-lead">{t('algorithm.attention.scoresIntro')}</p>
            {heat(res.scores, 2, rangeOf(res.scores), 'algorithm.attention.scoresCaption')}
            <div className="alg-note">
              <p style={{ margin: 0 }}>
                <strong>{t('algorithm.attention.scoreOf', { query: tok(row), key: tok(col) })}</strong>
              </p>
              <p className="mono alg-calc" style={{ margin: 0 }}>
                {`S = q${row + 1} · k${col + 1} = ${termsText} = ${num(res.scores[row][col])}`}
              </p>
              <div className="alg-matrices two">
                <MatrixGrid name="Q" caption={t('algorithm.attention.matrix.Q')} matrix={cfg.Q} rowLabels={cfg.tokens} readOnly highlightRow={row} />
                <MatrixGrid name="K" caption={t('algorithm.attention.matrix.K')} matrix={cfg.K} rowLabels={cfg.tokens} readOnly highlightRow={col} />
              </div>
            </div>
          </>
        ) : null}

        {stepName === 'scaled' ? (
          <>
            <div className="ix-formula alg-formula">
              <MathTex tex={scale ? '{\\tilde S = \\dfrac{S}{\\sqrt{d_k}}}' : '{\\tilde S = S}'} />
              <span className="small">{t('algorithm.attention.factor', { dk: res.dk, root: num(Math.sqrt(res.dk), 3) })}</span>
            </div>
            <Switch label={t('algorithm.attention.scaleToggle')} checked={scale} onChange={(e) => setScale(e.target.checked)} />
            <p className="alg-lead">{scale ? t('algorithm.attention.scaledIntro') : t('algorithm.attention.unscaledIntro')}</p>
            {heat(res.scaled, 2, rangeOf(res.scaled), scale ? 'algorithm.attention.scaledCaption' : 'algorithm.attention.unscaledCaption')}
          </>
        ) : null}

        {stepName === 'weights' ? (
          <>
            <div className="ix-formula alg-formula">
              <MathTex tex={'{A = \\operatorname{softmax}\\!\\left(\\tilde S\\right)}'} />
              <MathTex tex={'{\\textstyle\\sum_j A_{ij} = 1}'} />
            </div>
            <Switch label={t('algorithm.attention.scaleToggle')} checked={scale} onChange={(e) => setScale(e.target.checked)} />
            <p className="alg-lead">{t('algorithm.attention.weightsIntro')}</p>
            {heat(res.weights, 2, [0, 1], 'algorithm.attention.weightsCaption')}
            <div className="alg-note">
              <p style={{ margin: 0 }}>
                {topKeys(res.weights[row]).length > 1
                  ? t('algorithm.attention.focusTie', { query: tok(row), keys: topKeys(res.weights[row]).map((j) => `“${tok(j)}”`).join(lang === 'vi' ? ' và ' : ' and '), weight: num(maxW(res.weights[row])) })
                  : t('algorithm.attention.focus', { query: tok(row), key: tok(topKeys(res.weights[row])[0]), weight: num(maxW(res.weights[row])) })}
              </p>
              <p className="small" style={{ margin: 0 }}>
                {scale
                  ? t('algorithm.attention.compareScaled', { a: num(maxW(res.weights[row])), b: num(maxW(other.weights[row])) })
                  : t('algorithm.attention.compareUnscaled', { a: num(maxW(res.weights[row])), b: num(maxW(other.weights[row])) })}
              </p>
            </div>
          </>
        ) : null}

        {stepName === 'output' ? (
          <>
            <div className="ix-formula alg-formula">
              <MathTex tex={'{O = A\\,V}'} />
              <MathTex tex={'{o_i = \\textstyle\\sum_j A_{ij}\\, v_j}'} />
            </div>
            <p className="alg-lead">{t('algorithm.attention.outputIntro')}</p>
            <div className="alg-matrices two">
              <MatrixGrid name="O" caption={t('algorithm.attention.matrix.O')} matrix={res.output} rowLabels={cfg.tokens} readOnly highlightRow={row} digits={3} />
              <MatrixGrid name="V" caption={t('algorithm.attention.matrix.V')} matrix={cfg.V} rowLabels={cfg.tokens} readOnly />
            </div>
            <div className="alg-note">
              <label className="field-label" htmlFor={`${uid}-row`}>
                {t('algorithm.attention.pickRow')}
              </label>
              <select id={`${uid}-row`} className="select" value={row} onChange={(e) => setActive({ row: Number(e.target.value), col })}>
                {cfg.tokens.map((x, i) => (
                  <option key={i} value={i}>
                    {x}
                  </option>
                ))}
              </select>
              <p className="mono alg-calc" style={{ margin: 0 }}>
                {`o${row + 1} = ${outTerms} = [${res.output[row].map((v) => num(v, 3)).join(lang === 'vi' ? '; ' : ', ')}]`}
              </p>
              <p className="small muted" style={{ margin: 0 }}>
                {t('algorithm.attention.outputNote', { query: tok(row) })}
              </p>
            </div>
          </>
        ) : null}
      </section>

      <div className="alg-step-nav">
        <Button disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          {t('algorithm.attention.prevStep')}
        </Button>
        <Button variant="primary" disabled={step === ATTENTION_STEPS.length - 1} onClick={() => setStep((s) => Math.min(ATTENTION_STEPS.length - 1, s + 1))}>
          {t('algorithm.attention.nextStep')}
        </Button>
        {preset !== 'lesson' ? (
          <Button variant="ghost" icon={RotateCcw} onClick={() => applyPreset('lesson')}>
            {t('algorithm.restoreExample')}
          </Button>
        ) : null}
      </div>

      <p className="ix-disclaimer">
        <Info aria-hidden="true" />
        <span>{t('algorithm.attention.partial')}</span>
      </p>
      <ExplanationSection text={block.explanation} />
    </div>
  )
}
