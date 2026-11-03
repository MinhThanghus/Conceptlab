import { useT } from '../../../../i18n/index.jsx'
import { CONSTANTS, tryCompile } from '../../../../lib/expr.js'
import { Button, LinkButton, MathTex } from '../../../../components/ui/index.js'

export const MAX_FORMULAS = 8

function referenceKey(ref) {
  if (!ref?.source_id || (ref.page == null && !ref.bbox && ref.time == null && !ref.quote)) return null
  return JSON.stringify([ref.source_id, ref.page ?? null, ref.bbox ?? null, ref.time ?? null, ref.quote ?? null])
}

/** Only mark an existing graph when both expression and a specific source reference match. */
export function existingFormulaIds(formulas, blocks) {
  const graphs = (blocks || []).filter((block) => block.type === 'graph' && block.expression)
  return new Set((formulas || []).filter((formula) => {
    const expression = (formula.expression || '').replace(/\s+/g, '')
    const refs = new Set((formula.source_refs || []).map(referenceKey).filter(Boolean))
    return formula.id && expression && refs.size && graphs.some((graph) =>
      (graph.expression || '').replace(/\s+/g, '') === expression &&
      (graph.source_refs || []).some((ref) => refs.has(referenceKey(ref))))
  }).map((formula) => formula.id))
}

/** Classify reviewed expressions using the same safe grammar as the editor. */
export function formulaChoices(formulas) {
  return (formulas || []).map((formula, index) => {
    const compiled = formula?.expression?.trim() ? tryCompile(formula.expression) : null
    const hasVariables = compiled?.ok && [...compiled.compiled.variables()].some((name) => !Object.hasOwn(CONSTANTS, name))
    const reason = !formula?.confirmed ? 'unconfirmed' : !formula?.id || !hasVariables ? 'invalid' : null
    return { formula, index, reason }
  })
}

export function FormulaPicker({ choices, selected, completed, existing, onToggle, onSelectAll, onSelectRemaining, onClear, labId }) {
  const { t } = useT()
  return (
    <fieldset className="au-fieldset au-formula-picker">
      <legend>{t('build.generate.formulas.title')}</legend>
      <p className="small muted">{t('build.generate.formulas.help', { max: MAX_FORMULAS })}</p>
      <p className="small" role="status">{t('build.generate.formulas.selected', { count: selected.size, max: MAX_FORMULAS })}</p>
      {completed.size ? <p className="small" role="status">{t('build.generate.formulas.nextHint')}</p> : null}
      <div className="row" style={{ gap: '0.5rem' }}>
        <Button size="sm" variant="ghost" onClick={onSelectAll}>{t('build.generate.formulas.selectAll')}</Button>
        {completed.size || existing.size ? <Button size="sm" variant="ghost" onClick={onSelectRemaining}>{t('build.generate.formulas.selectRemaining')}</Button> : null}
        <Button size="sm" variant="ghost" onClick={onClear}>{t('build.generate.formulas.clear')}</Button>
        <LinkButton size="sm" to={`/app/labs/${labId}/review#formulas`}>{t('build.generate.formulas.review')}</LinkButton>
      </div>
      <ul className="list-reset au-formula-options">
        {choices.map(({ formula, index, reason }) => {
          const checked = selected.has(formula.id)
          const limitReached = !checked && selected.size >= MAX_FORMULAS
          return (
            <li key={`${formula.id || 'formula'}-${index}`} className="au-formula-option">
              <label>
                <input type="checkbox" checked={checked} disabled={Boolean(reason || limitReached)} onChange={(event) => onToggle(formula.id, event.target.checked)} />
                <span>
                  <strong>{t('build.generate.formulas.item', { n: index + 1 })}</strong>
                  {formula.latex ? <MathTex tex={formula.latex} /> : <span className="mono"> {formula.expression || t('build.generate.formulas.noExpression')}</span>}
                  {existing.has(formula.id) ? <span className="badge badge-success">{t('build.generate.formulas.existing')}</span> : completed.has(formula.id) ? <span className="badge badge-success">{t('build.generate.formulas.created')}</span> : null}
                  {formula.description ? <span className="small">{formula.description}</span> : null}
                  {reason || limitReached ? <span className="small muted">{t(`build.generate.formulas.${reason || 'limitReached'}`)}</span> : null}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      <p className="small muted">{t('build.generate.formulas.assumptions')}</p>
    </fieldset>
  )
}
