import { useId, useMemo, useRef, useState } from 'react'
import { Bot, Check, CircleCheck, CircleHelp, Info, LoaderCircle, Pencil, Plus, Sparkles, Trash2, WandSparkles, Workflow, X } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import {
  AIBadge,
  Alert,
  Badge,
  Button,
  Dialog,
  ErrorMessage,
  IconButton,
  MathTex,
  ProvenanceBadge,
  RichText,
  SelectField,
  TextArea,
  TextField,
} from '../../components/ui/index.js'
import { BlockEnvProvider, useBlockEnv } from '../blocks/BlockEnv.jsx'
import { BlockRenderer } from '../blocks/BlockRenderer.jsx'
import { PROVENANCES } from '../lab/specUtils.js'
import PaperItemChat from './PaperItemChat.jsx'
import { AddedNotice, GenerateResult, PageChip, SamePage, itemLabel } from './PaperPanels.jsx'
import { useWorkspace } from './workspaceContext.js'
import { firstRef, isAttentionRelated, parseNumberInput, sanitizeEquation, selectionText, splitVariables } from './paperUtils.js'

const hasValue = (v) => v.known_value !== null && v.known_value !== undefined && Number.isFinite(Number(v.known_value))

function VariablesTable({ eq, variables, controlled, onToggle, caption }) {
  const { t, fmt } = useT()
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={caption}>
      <table className="table paper-vars">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {onToggle ? <th scope="col">{t('paper.equations.colControl')}</th> : null}
            <th scope="col">{t('paper.equations.colSymbol')}</th>
            <th scope="col">{t('paper.equations.colMeaning')}</th>
            <th scope="col">{t('paper.equations.colUnit')}</th>
            <th scope="col" className="num">
              {t('paper.equations.colValue')}
            </th>
            <th scope="col">{t('paper.equations.colProvenance')}</th>
          </tr>
        </thead>
        <tbody>
          {variables.map((v, i) => (
            <tr key={`${v.symbol}-${i}`}>
              {onToggle ? (
                <td>
                  <label className="paper-check-label">
                    <input
                      type="checkbox"
                      className="paper-check"
                      checked={controlled.includes(v.symbol)}
                      onChange={() => onToggle(eq.id, v.symbol)}
                      aria-label={t('paper.equations.controlAria', { symbol: v.symbol })}
                    />
                  </label>
                </td>
              ) : null}
              <th scope="row" className="paper-symbol">
                <MathTex tex={v.symbol} />
              </th>
              <td className="paper-meaning">{v.meaning || <span className="muted">{t('paper.equations.noValue')}</span>}</td>
              <td>{v.unit || <span className="muted">{t('paper.equations.noValue')}</span>}</td>
              <td className="num">{hasValue(v) ? fmt.number(v.known_value, 6) : <span className="muted">{t('paper.equations.noValue')}</span>}</td>
              <td>
                <ProvenanceBadge value={v.provenance} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EquationFacts({ eq, onEdit }) {
  const { t, fmt } = useT()
  const ws = useWorkspace()
  const variables = Array.isArray(eq.variables) ? eq.variables : []
  const controlled = ws.controlled[eq.id] || []
  const { known, unknown } = splitVariables(eq)
  const missing = Array.isArray(eq.missing) ? eq.missing.filter(Boolean) : []
  return (
    <div className="stack">
      <div className="stack-sm">
        <div className="row-between">
          <h4 style={{ margin: 0 }}>{t('paper.equations.variables')}</h4>
          <Button size="sm" icon={Pencil} onClick={onEdit}>
            {t('paper.equations.edit')}
          </Button>
        </div>
        {variables.length ? (
          <>
            <p className="small muted" style={{ margin: 0 }}>
              {t('paper.equations.controlHint')}
            </p>
            <VariablesTable
              eq={eq}
              variables={variables}
              controlled={controlled}
              onToggle={ws.toggleControlled}
              caption={t('paper.equations.variablesCaption', { label: itemLabel('equations', eq, t) })}
            />
          </>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            {t('paper.equations.noVariables')}
          </p>
        )}
      </div>
      {eq.conditions ? (
        <div className="stack-sm">
          <h4 style={{ margin: 0 }}>{t('paper.equations.conditions')}</h4>
          <RichText text={eq.conditions} />
        </div>
      ) : null}
      <div className="paper-known-missing">
        <div className="card-muted stack-sm">
          <h4 className="panel-title" style={{ margin: 0, fontSize: '1rem' }}>
            <CircleCheck size={18} aria-hidden="true" style={{ color: 'var(--cl-success)' }} />
            {t('paper.equations.known')}
          </h4>
          {known.length ? (
            <ul className="paper-value-list">
              {known.map((v, i) => (
                <li key={`${v.symbol}-${i}`}>
                  <MathTex tex={v.symbol} /> = {fmt.number(v.known_value, 6)}
                  {v.unit ? ` ${v.unit}` : ''} <ProvenanceBadge value={v.provenance} compact />
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted" style={{ margin: 0 }}>
              {t('paper.equations.noneKnown')}
            </p>
          )}
        </div>
        <div className="card-muted stack-sm">
          <h4 className="panel-title" style={{ margin: 0, fontSize: '1rem' }}>
            <CircleHelp size={18} aria-hidden="true" style={{ color: 'var(--cl-prov-unknown)' }} />
            {t('paper.equations.missing')}
          </h4>
          {missing.length || unknown.length ? (
            <ul className="paper-value-list">
              {missing.map((m, i) => (
                <li key={`m${i}`}>{m}</li>
              ))}
              {unknown.length ? <li>{t('paper.equations.noValueFor', { list: unknown.map((v) => v.symbol).join(', ') })}</li> : null}
            </ul>
          ) : (
            <p className="small muted" style={{ margin: 0 }}>
              {t('paper.equations.noneMissing')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function toInput(value, lang) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return ''
  const text = String(Number(value))
  return lang === 'vi' ? text.replace('.', ',') : text
}

/** Edit the recognized content (spec §9.2). Works on a draft; "Save" writes analysis.paper. */
function EquationEditor({ eq, onDone }) {
  const { t, lang } = useT()
  const ws = useWorkspace()
  const seq = useRef(0)
  const nextKey = (prefix) => {
    seq.current += 1
    return `${prefix}${seq.current}`
  }
  const [draft, setDraft] = useState(() => ({
    label: eq.label || '',
    latex: eq.latex || '',
    expression: eq.expression || '',
    conditions: eq.conditions || '',
    variables: (eq.variables || []).map((v, i) => ({
      key: `v${i}`,
      symbol: v.symbol || '',
      meaning: v.meaning || '',
      unit: v.unit || '',
      value: toInput(v.known_value, lang),
      provenance: v.provenance || 'unknown',
    })),
    missing: (eq.missing || []).map((text, i) => ({ key: `m${i}`, text })),
  }))
  const [errors, setErrors] = useState({})
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const setVar = (key, patch) => setDraft((d) => ({ ...d, variables: d.variables.map((v) => (v.key === key ? { ...v, ...patch } : v)) }))
  const provenanceOptions = PROVENANCES.map((p) => ({ value: p, label: t(`common.provenance.${p}`) }))

  const save = () => {
    const nextErrors = {}
    const variables = draft.variables
      .filter((v) => v.symbol.trim())
      .map((v) => {
        const n = parseNumberInput(v.value, lang)
        if (Number.isNaN(n)) nextErrors[v.key] = t('paper.edit.badNumber')
        return { symbol: v.symbol.trim(), meaning: v.meaning, unit: v.unit, known_value: n === null || Number.isNaN(n) ? null : n, provenance: v.provenance }
      })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    ws.saveEquation(
      eq.id,
      sanitizeEquation({
        ...eq,
        label: draft.label,
        latex: draft.latex,
        expression: draft.expression,
        conditions: draft.conditions,
        variables,
        missing: draft.missing.map((m) => m.text),
      }),
    )
    onDone(true)
  }

  return (
    <form
      className="stack paper-edit"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <Alert tone="info">{t('paper.edit.intro')}</Alert>
      <TextArea label={t('paper.edit.latex')} hint={t('paper.edit.latexHint')} rows={3} maxLength={1000} value={draft.latex} spellCheck={false} onChange={(e) => set({ latex: e.target.value })} />
      {draft.latex ? (
        <div className="card-muted stack-sm">
          <span className="small muted">{t('paper.edit.preview')}</span>
          <MathTex tex={draft.latex} display />
        </div>
      ) : null}
      <div className="paper-edit-row">
        <TextField label={t('paper.edit.label')} maxLength={20} value={draft.label} onChange={(e) => set({ label: e.target.value })} />
        <TextField
          label={t('paper.edit.expression')}
          hint={t('paper.edit.expressionHint')}
          maxLength={400}
          spellCheck={false}
          value={draft.expression}
          onChange={(e) => set({ expression: e.target.value })}
        />
      </div>
      <TextArea label={t('paper.edit.conditions')} rows={2} maxLength={2000} value={draft.conditions} onChange={(e) => set({ conditions: e.target.value })} />

      <fieldset className="paper-fieldset stack-sm">
        <legend className="field-label">{t('paper.equations.variables')}</legend>
        <p className="small muted" style={{ margin: 0 }}>
          {t('paper.edit.valueHint')}
        </p>
        <div className="paper-var-edit">
          {draft.variables.map((v, i) => (
            <fieldset key={v.key} className="paper-var-card">
              <legend className="small">{t('paper.edit.variableN', { n: i + 1 })}</legend>
              <div className="paper-var-grid">
                <TextField label={t('paper.equations.colSymbol')} maxLength={60} spellCheck={false} value={v.symbol} onChange={(e) => setVar(v.key, { symbol: e.target.value })} />
                <TextField label={t('paper.equations.colUnit')} maxLength={40} value={v.unit} onChange={(e) => setVar(v.key, { unit: e.target.value })} />
                <TextField
                  className="paper-var-wide"
                  label={t('paper.equations.colMeaning')}
                  maxLength={2000}
                  value={v.meaning}
                  onChange={(e) => setVar(v.key, { meaning: e.target.value })}
                />
                <TextField
                  label={t('paper.equations.colValue')}
                  inputMode="decimal"
                  maxLength={40}
                  value={v.value}
                  error={errors[v.key]}
                  onChange={(e) =>
                    setVar(v.key, {
                      value: e.target.value,
                      provenance: v.provenance === 'document' || v.provenance === 'unknown' ? 'user' : v.provenance,
                    })
                  }
                />
                <SelectField
                  label={t('paper.equations.colProvenance')}
                  options={provenanceOptions}
                  value={v.provenance}
                  onChange={(e) => setVar(v.key, { provenance: e.target.value })}
                />
              </div>
              <Button size="sm" variant="ghost" icon={Trash2} onClick={() => set({ variables: draft.variables.filter((x) => x.key !== v.key) })}>
                {t('paper.edit.removeVariable', { symbol: v.symbol || i + 1 })}
              </Button>
            </fieldset>
          ))}
        </div>
        <div>
          <Button
            size="sm"
            icon={Plus}
            disabled={draft.variables.length >= 30}
            onClick={() => set({ variables: [...draft.variables, { key: nextKey('nv'), symbol: '', meaning: '', unit: '', value: '', provenance: 'user' }] })}
          >
            {t('paper.edit.addVariable')}
          </Button>
        </div>
      </fieldset>

      <fieldset className="paper-fieldset stack-sm">
        <legend className="field-label">{t('paper.equations.missing')}</legend>
        {draft.missing.map((m, i) => (
          <div key={m.key} className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
            <TextField
              className="paper-grow"
              label={t('paper.edit.missingN', { n: i + 1 })}
              maxLength={2000}
              value={m.text}
              onChange={(e) => set({ missing: draft.missing.map((x) => (x.key === m.key ? { ...x, text: e.target.value } : x)) })}
            />
            <IconButton icon={Trash2} label={t('paper.edit.removeMissing', { n: i + 1 })} bordered onClick={() => set({ missing: draft.missing.filter((x) => x.key !== m.key) })} />
          </div>
        ))}
        <div>
          <Button size="sm" icon={Plus} disabled={draft.missing.length >= 10} onClick={() => set({ missing: [...draft.missing, { key: nextKey('nm'), text: '' }] })}>
            {t('paper.edit.addMissing')}
          </Button>
        </div>
      </fieldset>

      {Object.keys(errors).length ? (
        <Alert tone="danger" role="alert">
          {t('paper.edit.fixErrors')}
        </Alert>
      ) : null}
      <div className="row">
        <Button type="submit" variant="primary" icon={Check}>
          {t('paper.edit.save')}
        </Button>
        <Button onClick={() => onDone(false)}>{t('common.actions.cancel')}</Button>
      </div>
    </form>
  )
}

/** Live preview of an AI-proposed block, rendered like learners will see it (mode "view"). */
function BlockPreview({ block, added, onAdd }) {
  const { t } = useT()
  const ws = useWorkspace()
  const studioEnv = useBlockEnv()
  const [askOpen, setAskOpen] = useState(false)
  const states = useRef({})
  const { showRef } = ws
  const env = useMemo(
    () => ({
      ...studioEnv,
      mode: 'view',
      openSource: (ref) => showRef(ref, block.title),
      ask: () => setAskOpen(true),
      reportState: (id, state) => {
        states.current[id] = state
      },
    }),
    [studioEnv, showRef, block.title],
  )
  const selection = [block.title, block.description].filter(Boolean).join(': ').slice(0, 2000)
  return (
    <div className="paper-preview stack">
      <div className="row" style={{ gap: 'var(--space-2xs)' }}>
        <span className="badge badge-warning">{t('paper.preview.label')}</span>
        <AIBadge />
      </div>
      <BlockEnvProvider value={env}>
        <BlockRenderer block={block} mode="view" />
      </BlockEnvProvider>
      <p className="ai-note" style={{ margin: 0 }}>
        <Info size={16} aria-hidden="true" />
        <span>{t('paper.caption')}</span>
      </p>
      {added ? (
        <AddedNotice addedKey={added} />
      ) : (
        <div className="row">
          <Button variant="paper" icon={Plus} onClick={onAdd}>
            {t('paper.preview.add')}
          </Button>
          <span className="small muted">{t('paper.preview.addNote')}</span>
        </div>
      )}
      <Dialog open={askOpen} onClose={() => setAskOpen(false)} title={t('paper.preview.askTitle')} size="wide">
        <PaperItemChat
          labId={ws.lab.id}
          aiAvailable={ws.aiAvailable}
          context={{ selection, state: states.current[block.id] || undefined }}
          onCite={(c) => {
            setAskOpen(false)
            ws.cite(c)
          }}
          openLabel={t('paper.preview.askTitle')}
          defaultOpen
          closable={false}
        />
      </Dialog>
    </div>
  )
}

function ExploreResult({ eq, state, onEdit }) {
  const { t } = useT()
  const ws = useWorkspace()
  const [applied, setApplied] = useState(false)
  const { result, block } = state
  const aiEq = result?.equation || null
  const addedKey = `explore:${eq.id}`
  const explainKey = `explain:${eq.id}`
  const genBusy = ws.gen?.status === 'loading'
  const missing = (Array.isArray(aiEq?.missing) && aiEq.missing.length ? aiEq.missing : eq.missing || []).filter(Boolean)
  return (
    <div className="stack" role="region" aria-label={t('paper.explore.resultLabel')}>
      {result?.notes ? (
        <div className="card-muted stack-sm">
          <span className="small muted row" style={{ gap: '0.35rem' }}>
            <Bot size={16} aria-hidden="true" />
            {t('paper.explore.notes')}
          </span>
          <RichText text={result.notes} />
        </div>
      ) : null}
      {aiEq?.variables?.length ? (
        <details className="paper-details">
          <summary>{t('paper.explore.variablesFromAi', { count: aiEq.variables.length })}</summary>
          <div className="stack-sm" style={{ marginBlockStart: '0.5rem' }}>
            <VariablesTable eq={aiEq} variables={aiEq.variables} caption={t('paper.explore.variablesFromAi', { count: aiEq.variables.length })} />
            <div className="row">
              <Button
                size="sm"
                icon={Check}
                disabled={applied}
                onClick={() => {
                  ws.applyAiEquation(eq.id, aiEq)
                  setApplied(true)
                }}
              >
                {applied ? t('paper.explore.applied') : t('paper.explore.applyVariables')}
              </Button>
              <span className="small muted">{t('paper.explore.applyHint')}</span>
            </div>
          </div>
        </details>
      ) : null}
      {block ? (
        <BlockPreview block={block} added={ws.added[addedKey] ? addedKey : null} onAdd={() => ws.addPreviewBlock(eq.id)} />
      ) : (
        <Alert tone="warning" title={t('paper.explore.noBlockTitle')}>
          <p style={{ margin: '0 0 0.4rem' }}>{t('paper.explore.noBlockBody')}</p>
          {missing.length ? (
            <ul style={{ margin: '0 0 0.5rem', paddingInlineStart: '1.1rem' }}>
              {missing.slice(0, 8).map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          ) : null}
          <div className="row">
            <Button
              size="sm"
              icon={Workflow}
              loading={genBusy && ws.gen?.key === explainKey}
              disabled={!ws.aiAvailable || (genBusy && ws.gen?.key !== explainKey)}
              onClick={() => ws.generate(['flow'], explainKey)}
            >
              {t('paper.explore.makeDiagram')}
            </Button>
            <Button size="sm" icon={Pencil} onClick={onEdit}>
              {t('paper.explore.fillValues')}
            </Button>
          </div>
        </Alert>
      )}
      <GenerateResult genKey={explainKey} />
    </div>
  )
}

function ExploreSection({ eq, onEdit, editing = false }) {
  const { t } = useT()
  const ws = useWorkspace()
  const headingId = useId()
  const state = ws.exploreState[eq.id]
  const controlled = ws.controlled[eq.id] || []
  const loading = state?.status === 'loading'
  const attention = isAttentionRelated(eq)
  const templateKey = `eq:${eq.id}`
  return (
    <section className="paper-explore stack" aria-labelledby={headingId}>
      <div className="stack-sm">
        <h4 id={headingId} className="panel-title" style={{ margin: 0 }}>
          <WandSparkles size={18} aria-hidden="true" />
          {t('paper.explore.title')}
        </h4>
        <p className="small muted" style={{ margin: 0 }}>
          {t('paper.explore.intro')}
        </p>
      </div>
      {!ws.aiAvailable ? <Alert tone="info">{t('paper.aiOff')}</Alert> : null}
      <div className="row">
        <Button variant={editing || state?.status === 'done' ? undefined : 'paper'} icon={WandSparkles} loading={loading} disabled={!ws.aiAvailable && !loading} onClick={() => ws.explore(eq)}>
          {state?.status === 'done' ? t('paper.explore.again') : t('paper.explore.run')}
        </Button>
        {attention ? (
          <Button icon={Plus} disabled={Boolean(ws.added[templateKey])} onClick={() => ws.addAttention(templateKey, eq)}>
            {t('paper.explore.attentionTemplate')}
          </Button>
        ) : null}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {controlled.length ? t('paper.explore.controlled', { list: controlled.join(', ') }) : t('paper.explore.noControlled')}
      </p>
      {attention ? (
        <p className="small muted" style={{ margin: 0 }}>
          <Sparkles size={14} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> {t('paper.explore.attentionNote')}
        </p>
      ) : null}
      <AddedNotice addedKey={templateKey} />
      {loading ? (
        <div className="paper-working row-between" role="status">
          <span className="row" style={{ gap: '0.5rem', flexWrap: 'nowrap' }}>
            <LoaderCircle className="spin" size={18} aria-hidden="true" />
            <span>{t('paper.explore.working')}</span>
          </span>
          {ws.cancelExplore ? (
            <Button size="sm" icon={X} onClick={() => ws.cancelExplore(eq.id)}>
              {t('common.actions.cancel')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {state?.status === 'canceled' ? (
        <p className="small muted" role="status" style={{ margin: 0 }}>
          {t('paper.explore.canceled')}
        </p>
      ) : null}
      {state?.status === 'error' ? <ErrorMessage error={state.error} onRetry={() => ws.explore(eq)} /> : null}
      {state?.status === 'done' ? <ExploreResult eq={eq} state={state} onEdit={onEdit} /> : null}
    </section>
  )
}

/** Equation detail (spec §9.2): recognized formula, variables, values, conditions, source, explore. */
export function EquationDetail({ eq }) {
  const { t } = useT()
  const ws = useWorkspace()
  const headingId = useId()
  const [editing, setEditing] = useState(false)
  const [savedNote, setSavedNote] = useState(false)
  const topRef = useRef(null)
  const ref = firstRef(eq)
  const label = itemLabel('equations', eq, t)
  const startEdit = () => {
    setSavedNote(false)
    setEditing(true)
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ block: 'nearest' }))
  }
  return (
    <article className="card stack paper-detail" aria-labelledby={headingId} ref={topRef}>
      <header className="paper-detail-head">
        <div style={{ minInlineSize: 0 }}>
          <h3 id={headingId} className="break">
            {label}
          </h3>
        </div>
        <div className="row" style={{ gap: '0.4rem' }}>
          {eq.explorable ? (
            <Badge tone="paper" icon={Sparkles}>
              {t('paper.explorable')}
            </Badge>
          ) : null}
          <PageChip refObj={ref} label={label} short={eq.label} />
          <AIBadge label={t('paper.aiRead')} />
        </div>
      </header>
      <div className="paper-formula">{eq.latex ? <MathTex tex={eq.latex} display /> : <p className="muted">{t('paper.equations.noLatex')}</p>}</div>
      {eq.context ? <RichText text={eq.context} /> : null}
      {savedNote ? (
        <Alert tone="success" role="status">
          {t('paper.edit.saved')}
        </Alert>
      ) : null}
      {editing ? (
        <EquationEditor
          eq={eq}
          onDone={(saved) => {
            setEditing(false)
            setSavedNote(Boolean(saved))
          }}
        />
      ) : (
        <EquationFacts eq={eq} onEdit={startEdit} />
      )}
      <SamePage kind="equations" item={eq} />
      <ExploreSection eq={eq} onEdit={startEdit} editing={editing} />
      <PaperItemChat
        key={eq.id}
        labId={ws.lab.id}
        aiAvailable={ws.aiAvailable}
        context={{ item_id: eq.id, selection: selectionText('equations', eq), source_ref: ref || undefined }}
        onCite={ws.cite}
        openLabel={t('paper.equations.ask')}
        suggestions={[t('paper.equations.q1'), t('paper.equations.q2'), t('paper.equations.q3')]}
      />
    </article>
  )
}
