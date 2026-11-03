import { memo, useCallback, useMemo } from 'react'
import { Calculator, Plus, Trash2, WandSparkles } from 'lucide-react'
import { useT } from '../../../../i18n/index.jsx'
import { CONSTANTS, tryCompile, unknownVariables } from '../../../../lib/expr.js'
import { Button, IconButton, MathTex, TextArea, TextField } from '../../../../components/ui/index.js'
import { newId } from '../../../lab/specUtils.js'
import { SourceRefChips } from '../../../sources/SourceRefChips.jsx'
import { addMissingVariables, itemKeys, parseSymbolList, removeAt, replaceAt } from '../review.js'
import { roundSig } from '../numbers.js'
import { focusById, ItemShell, ListTextInput, ReviewSection, useReview } from './shared.jsx'

function exprErrorText(t, error) {
  const code = error?.code || 'bad_node'
  const position = Number.isInteger(error?.position) ? error.position + 1 : null
  const text = t(`review.exprErrors.${code}`, { position })
  return text.startsWith('⟦') ? t('review.exprErrors.bad_node') : text
}

/** Try the formula with the values from the variables table (spec §11: "công thức có chạy…"). */
function useEvaluation(compiled, variables) {
  return useMemo(() => {
    if (!compiled?.ok) return null
    const names = [...compiled.compiled.variables()]
    const values = {}
    const missing = []
    for (const name of names) {
      const q = variables.find((v) => v && v.symbol === name)
      if (q && typeof q.value === 'number' && Number.isFinite(q.value)) values[name] = q.value
      else if (!Object.hasOwn(CONSTANTS, name)) missing.push(name)
    }
    if (missing.length) return { missing }
    try {
      const value = compiled.compiled.evaluate(values)
      return { value, values }
    } catch {
      return null
    }
  }, [compiled, variables])
}

const FormulaCard = memo(function FormulaCard({ formula, index, known, variables }) {
  const { t, fmt } = useT()
  const { setResult, announce } = useReview()
  const change = useCallback((patch) => setResult((r) => ({ ...r, formulas: replaceAt(r.formulas, index, { ...r.formulas[index], ...patch }) })), [setResult, index])
  const expr = formula.expression || ''
  const compiled = useMemo(() => (expr.trim() ? tryCompile(expr) : null), [expr])
  const unknown = useMemo(() => {
    if (!compiled?.ok) return []
    try {
      return unknownVariables(expr, known)
    } catch {
      return []
    }
  }, [compiled, expr, known])
  const evaluation = useEvaluation(compiled, variables)
  const unitOf = (symbol) => variables.find((v) => v && v.symbol === symbol)?.unit || ''
  const label = formula.output_symbol ? t('review.formulas.itemNamed', { symbol: formula.output_symbol }) : t('review.formulas.item', { n: index + 1 })
  const idBase = `review-formula-${formula.id || index}`

  return (
    <ItemShell
      title={label}
      subtitle={formula.description || null}
      confirmed={formula.confirmed}
      onConfirm={(v) => change({ confirmed: v })}
      confirmLabel={t('review.formulas.confirm')}
      actions={
        <IconButton
          icon={Trash2}
          size="sm"
          label={t('review.formulas.remove', { name: label })}
          onClick={() => {
            setResult((r) => ({ ...r, formulas: removeAt(r.formulas, index) }))
            announce(t('review.removed', { name: label }))
          }}
        />
      }
    >
      <div className="au-formula-grid">
        <div className="stack-sm">
          <TextArea
            id={`${idBase}-latex`}
            label={t('review.formulas.latex')}
            hint={t('review.formulas.latexHint')}
            rows={2}
            maxLength={600}
            className="au-mono-field"
            value={formula.latex || ''}
            onChange={(e) => change({ latex: e.target.value })}
          />
          <div className="au-preview" aria-label={t('review.formulas.preview')} role="group">
            <span className="tiny muted">{t('review.formulas.preview')}</span>
            {formula.latex ? <MathTex tex={formula.latex} display /> : <span className="small muted">{t('review.formulas.noLatex')}</span>}
          </div>
        </div>
        <div className="stack-sm">
          <TextField
            label={t('review.formulas.expression')}
            hint={t('review.formulas.expressionHint')}
            inputClassName="mono"
            maxLength={400}
            spellCheck={false}
            autoCapitalize="off"
            value={expr}
            error={compiled && !compiled.ok ? exprErrorText(t, compiled.error) : undefined}
            onChange={(e) => change({ expression: e.target.value })}
          />
          <div className="au-two">
            <TextField label={t('review.formulas.output')} hint={t('review.formulas.outputHint')} inputClassName="mono" maxLength={200} value={formula.output_symbol || ''} onChange={(e) => change({ output_symbol: e.target.value })} />
            <div className="field">
              <label className="field-label" htmlFor={`${idBase}-vars`}>
                {t('review.formulas.variables')}
              </label>
              <ListTextInput
                id={`${idBase}-vars`}
                className="mono"
                value={formula.variables || []}
                parse={parseSymbolList}
                onChange={(list) => change({ variables: list })}
                aria-describedby={`${idBase}-vars-hint`}
              />
              <span className="field-hint" id={`${idBase}-vars-hint`}>
                {t('review.formulas.variablesHint')}
              </span>
            </div>
          </div>
          {compiled?.ok ? (
            <div className="row" style={{ gap: '0.5rem' }}>
              <Button
                size="sm"
                variant="ghost"
                icon={WandSparkles}
                onClick={() => change({ variables: [...compiled.compiled.variables()].filter((v) => !Object.hasOwn(CONSTANTS, v)).slice(0, 20) })}
              >
                {t('review.formulas.fillVariables')}
              </Button>
            </div>
          ) : null}
          {unknown.length ? (
            <div className="au-inline-warn" role="status">
              <span>{t('review.formulas.unknown', { list: unknown.join(', ') })}</span>
              <Button
                size="sm"
                icon={Plus}
                onClick={() => {
                  setResult((r) => addMissingVariables(r, unknown))
                  announce(t('review.formulas.addedVariables', { list: unknown.join(', ') }))
                }}
              >
                {t('review.formulas.addToTable')}
              </Button>
            </div>
          ) : null}
          {evaluation ? (
            <div className={['au-try', evaluation.missing ? 'is-missing' : 'is-ok'].join(' ')}>
              <Calculator aria-hidden="true" />
              {evaluation.missing ? (
                <span className="small">{t('review.formulas.tryMissing', { list: evaluation.missing.join(', ') })}</span>
              ) : Number.isFinite(evaluation.value) ? (
                <span className="small">
                  {t('review.formulas.tryWith', {
                    inputs:
                      Object.entries(evaluation.values)
                        .map(([k, v]) => `${k} = ${fmt.number(v, 6)}${unitOf(k) ? ` ${unitOf(k)}` : ''}`)
                        .join('; ') || t('review.formulas.noInputs'),
                  })}{' '}
                  <strong>
                    {formula.output_symbol || '='} {formula.output_symbol ? '≈ ' : ''}
                    {fmt.number(roundSig(evaluation.value, 4), 6)}
                    {formula.output_symbol && unitOf(formula.output_symbol) ? ` ${unitOf(formula.output_symbol)}` : ''}
                  </strong>
                </span>
              ) : (
                <span className="small">{t('review.formulas.tryInvalid')}</span>
              )}
            </div>
          ) : null}
        </div>
      </div>
      <TextArea label={t('review.formulas.description')} rows={2} maxLength={2000} value={formula.description || ''} onChange={(e) => change({ description: e.target.value })} />
      <SourceRefChips refs={formula.source_refs || []} label={t('review.evidence')} />
      {!formula.source_refs?.length ? <p className="tiny muted" style={{ margin: 0 }}>{t('review.noEvidence')}</p> : null}
    </ItemShell>
  )
})

export function FormulasSection({ formulas, variables, known, progress }) {
  const { t } = useT()
  const { setResult, announce } = useReview()
  const keys = itemKeys(formulas, 'f')
  return (
    <ReviewSection
      id="formulas"
      title={t('review.formulas.title')}
      description={t('review.formulas.desc')}
      progress={progress}
      footer={
        <Button
          icon={Plus}
          onClick={() => {
            const id = newId('f')
            setResult((r) => ({ ...r, formulas: [...r.formulas, { id, latex: '', expression: '', output_symbol: '', description: '', variables: [], source_refs: [], confirmed: false }] }))
            announce(t('review.formulas.added'))
            focusById(`review-formula-${id}-latex`)
          }}
          disabled={formulas.length >= 30}
        >
          {t('review.formulas.add')}
        </Button>
      }
    >
      {formulas.length ? (
        <div className="stack">
          {formulas.map((f, i) => (
            <FormulaCard key={keys[i]} formula={f} index={i} known={known} variables={variables} />
          ))}
        </div>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          {t('review.formulas.empty')}
        </p>
      )}
    </ReviewSection>
  )
}
