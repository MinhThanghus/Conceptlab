import { useId } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen,
  Cpu,
  FileText,
  Image,
  Lightbulb,
  ListOrdered,
  LoaderCircle,
  MapPinOff,
  Plus,
  RefreshCw,
  Sigma,
  Sparkles,
  Table2,
  WandSparkles,
  Workflow,
  X,
} from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { AIBadge, Alert, Button, EmptyState, ErrorMessage, LinkButton, MathTex, RichText } from '../../components/ui/index.js'
import PaperItemChat from './PaperItemChat.jsx'
import { KIND_ICONS } from './PaperSetup.jsx'
import { useWorkspace } from './workspaceContext.js'
import { candidateTarget, firstRef, isAttentionRelated, itemPage, samePageItems, selectionText, tocRanges } from './paperUtils.js'

const CANDIDATE_ICONS = { equation: Sigma, figure: Image, table: Table2, method: Workflow, algorithm: Cpu }
const GENERATE_FOR = { flow: ['flow'], steps: ['steps'], diagram: ['flow'] }

/** Short human label of an item ("Phương trình (1)", "Figure 2", a section title…). */
export function itemLabel(kind, item, t) {
  if (!item) return ''
  if (kind === 'sections' || kind === 'methods' || kind === 'candidates') return item.title || t(`paper.kindsOne.${kind}`)
  if (kind === 'equations') return item.label ? t('paper.equationWithLabel', { label: item.label }) : t('paper.kindsOne.equations')
  return item.label || t(`paper.kindsOne.${kind}`)
}

/** Opens the item's page in the viewer (or says honestly that the location is unknown). */
export function PageChip({ refObj, label, short }) {
  const { t } = useT()
  const ws = useWorkspace()
  const page = Number(refObj?.page) >= 1 ? Number(refObj.page) : null
  const located = refObj?.located || 'none'
  return (
    <button
      type="button"
      className="chip"
      onClick={() => ws.showRef(refObj || null, label, short)}
      title={page ? t(`common.located.${located}`) : t('paper.noLocationHint')}
    >
      {page ? <FileText size={14} aria-hidden="true" /> : <MapPinOff size={14} aria-hidden="true" />}
      {page ? t('paper.showPage', { page }) : t('paper.noLocation')}
    </button>
  )
}

/** All citations of an item as page chips. */
export function RefChips({ refs, label }) {
  const { t } = useT()
  const list = (Array.isArray(refs) ? refs : []).filter(Boolean)
  if (!list.length) {
    return (
      <div className="row" style={{ gap: '0.4rem' }}>
        <span className="small muted">{t('paper.sourcesLabel')}</span>
        <PageChip refObj={null} label={label} />
      </div>
    )
  }
  return (
    <div className="row" style={{ gap: '0.4rem' }}>
      <span className="small muted">{t('paper.sourcesLabel')}</span>
      {list.slice(0, 8).map((ref, i) => (
        <PageChip key={`${ref.page || 'x'}-${i}`} refObj={ref} label={label} />
      ))}
    </div>
  )
}

/** Honest "also on this page" links (same page of the same PDF, not a claimed semantic link). */
export function SamePage({ kind, item }) {
  const { t } = useT()
  const ws = useWorkspace()
  const ref = firstRef(item)
  const others = samePageItems(ws.paper, ref?.source_id, ref?.page, { kind, id: item.id })
  if (!others.length) return null
  return (
    <div className="row" style={{ gap: '0.4rem' }}>
      <span className="small muted">{t('paper.samePage', { page: ref.page })}</span>
      {others.slice(0, 8).map(({ kind: otherKind, item: other }) => {
        const Icon = KIND_ICONS[otherKind]
        return (
          <button key={`${otherKind}-${other.id}`} type="button" className="chip" onClick={() => ws.select(otherKind, other.id)}>
            <Icon size={14} aria-hidden="true" />
            <span className="break">{itemLabel(otherKind, other, t)}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Result of POST /ai/generate started from the control identified by `genKey`. */
export function GenerateResult({ genKey }) {
  const { t } = useT()
  const ws = useWorkspace()
  const gen = ws.gen
  if (!gen || gen.key !== genKey) return null
  if (gen.status === 'loading') {
    return (
      <div className="paper-working row-between" role="status">
        <span className="row" style={{ gap: '0.5rem', flexWrap: 'nowrap' }}>
          <LoaderCircle className="spin" size={18} aria-hidden="true" />
          <span>{t('paper.generate.working')}</span>
        </span>
        {ws.cancelGenerate ? (
          <Button size="sm" icon={X} onClick={ws.cancelGenerate}>
            {t('common.actions.cancel')}
          </Button>
        ) : null}
      </div>
    )
  }
  if (gen.status === 'canceled') {
    return (
      <p className="small muted" role="status" style={{ margin: 0 }}>
        {t('paper.generate.canceled')}
      </p>
    )
  }
  if (gen.status === 'error') return <ErrorMessage error={gen.error} onRetry={() => ws.generate(gen.types, gen.key)} />
  const count = gen.blocks.length
  return (
    <Alert
      tone={count ? 'success' : 'warning'}
      role="status"
      title={count ? t('paper.generate.done', { count }) : t('paper.generate.none')}
      action={
        count ? (
          <LinkButton size="sm" to={ws.buildPath}>
            {t('paper.openBuild')}
          </LinkButton>
        ) : null
      }
    >
      {count ? (
        <ul style={{ margin: '0.25rem 0', paddingInlineStart: '1.1rem' }}>
          {gen.blocks.map((b) => (
            <li key={b.id}>{b.title || t(`blocks.types.${b.type}`)}</li>
          ))}
        </ul>
      ) : null}
      {gen.warnings?.length ? (
        <ul className="small" style={{ margin: '0.25rem 0', paddingInlineStart: '1.1rem' }}>
          {gen.warnings.slice(0, 6).map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      ) : null}
      {count ? <p className="small" style={{ margin: 0 }}>{t('paper.generate.reviewNote')}</p> : null}
    </Alert>
  )
}

/** Confirmation after a block was added to the Lab from this page. */
export function AddedNotice({ addedKey }) {
  const { t } = useT()
  const ws = useWorkspace()
  if (!ws.added[addedKey]) return null
  return (
    <Alert
      tone="success"
      role="status"
      title={t('paper.added.title')}
      action={
        <LinkButton size="sm" to={ws.buildPath}>
          {t('paper.openBuild')}
        </LinkButton>
      }
    >
      {t('paper.added.body')}
    </Alert>
  )
}

export function KindEmpty({ kind }) {
  const { t } = useT()
  const ws = useWorkspace()
  return (
    <EmptyState
      icon={KIND_ICONS[kind]}
      title={t(`paper.empty.${kind}`)}
      action={
        <Button size="sm" icon={RefreshCw} onClick={ws.openRerun}>
          {t('paper.rerun')}
        </Button>
      }
    >
      <p>{t('paper.empty.hint')}</p>
    </EmptyState>
  )
}

/** Selectable list of equations / figures / tables / methods. */
export function ItemList({ kind, items, selectedId }) {
  const { t } = useT()
  const ws = useWorkspace()
  return (
    <ul className={['paper-items', 'list-reset', items.length > 4 && 'is-scroll'].filter(Boolean).join(' ')} aria-label={t(`paper.listLabel.${kind}`)}>
      {items.map((item) => {
        const page = itemPage(kind, item)
        const selected = item.id === selectedId
        let primary = itemLabel(kind, item, t)
        let secondary = null
        if (kind === 'equations') {
          primary = item.label || t('paper.kindsOne.equations')
          secondary = item.latex ? (
            <span className="paper-item-math">
              <MathTex tex={item.latex} />
            </span>
          ) : null
        } else if (kind === 'figures' || kind === 'tables') {
          secondary = item.caption || null
        } else if (kind === 'methods') {
          secondary = item.summary || null
        }
        return (
          <li key={item.id}>
            <button type="button" className="paper-item" aria-current={selected ? 'true' : undefined} onClick={() => ws.select(kind, item.id)}>
              <span className="paper-item-main">
                <span className="paper-item-title">{primary}</span>
                {secondary ? <span className="paper-item-sub">{secondary}</span> : null}
              </span>
              <span className="paper-item-meta">
                {kind === 'equations' && item.explorable ? (
                  <span className="badge badge-paper">
                    <Sparkles aria-hidden="true" />
                    {t('paper.explorable')}
                  </span>
                ) : null}
                <span className="badge badge-outline">{page ? t('paper.pageShort', { page }) : t('paper.noPageShort')}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function SectionPages({ section }) {
  const { t } = useT()
  const start = Number(section.page_start) || null
  const end = Number(section.page_end) || null
  if (!start) return <span className="badge badge-outline">{t('paper.noPageShort')}</span>
  return <span className="badge badge-outline">{t('paper.pagesShort', { pages: end && end !== start ? `${start}-${end}` : `${start}` })}</span>
}

/** Table of contents found by the AI (or the PDF's own outline when the AI found none). */
export function SectionsPanel({ sections, selectedId, source }) {
  const { t } = useT()
  const ws = useWorkspace()
  if (!sections.length) {
    const toc = tocRanges(source?.toc, source?.page_count)
    if (!toc.length) return <KindEmpty kind="sections" />
    return (
      <div className="stack-sm">
        <Alert tone="neutral">{t('paper.sections.fromToc')}</Alert>
        <ol className="paper-toc list-reset">
          {toc.map((r) => (
            <li key={`${r.title}-${r.from}`}>
              <button type="button" className="paper-toc-item" onClick={() => ws.showSection(r.from, r.title)}>
                <span className="paper-toc-title break">{r.title}</span>
                <span className="badge badge-outline">{t('paper.pagesShort', { pages: r.from === r.to ? `${r.from}` : `${r.from}-${r.to}` })}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    )
  }
  return (
    <div className="stack-sm">
      <p className="small muted" style={{ margin: 0 }}>
        {t('paper.sections.intro')}
      </p>
      <ol className="paper-toc list-reset">
        {sections.map((s) => {
          const selected = s.id === selectedId
          return (
            <li key={s.id} className={selected ? 'is-selected' : undefined}>
              <button type="button" className="paper-toc-item" aria-current={selected ? 'true' : undefined} onClick={() => ws.select('sections', s.id)}>
                <span className="paper-toc-title break">{s.title}</span>
                <SectionPages section={s} />
              </button>
              {selected && s.summary ? (
                <div className="paper-toc-summary">
                  <RichText text={s.summary} />
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function DetailHead({ kind, item, headingId, extra }) {
  const { t } = useT()
  const label = itemLabel(kind, item, t)
  const ref = firstRef(item)
  return (
    <header className="paper-detail-head">
      <div style={{ minInlineSize: 0 }}>
        <h3 id={headingId} className="break">
          {label}
        </h3>
      </div>
      <div className="row" style={{ gap: '0.4rem' }}>
        {extra}
        <PageChip refObj={ref} label={label} short={kind === 'equations' ? item.label : ''} />
        <AIBadge label={t('paper.aiRead')} />
      </div>
    </header>
  )
}

export function FigureDetail({ fig }) {
  const { t } = useT()
  const ws = useWorkspace()
  const headingId = useId()
  const ref = firstRef(fig)
  return (
    <article className="card stack paper-detail" aria-labelledby={headingId}>
      <DetailHead kind="figures" item={fig} headingId={headingId} />
      {fig.caption ? (
        <figure className="paper-caption">
          <figcaption>
            <span className="small muted">{t('paper.figures.caption')}</span>
            <RichText text={fig.caption} />
          </figcaption>
        </figure>
      ) : (
        <p className="small muted">{t('paper.figures.noCaption')}</p>
      )}
      {fig.description ? (
        <div className="stack-sm">
          <h4 style={{ margin: 0 }}>{t('paper.figures.description')}</h4>
          <RichText text={fig.description} />
        </div>
      ) : null}
      <Alert tone="info" title={t('paper.figures.dataTitle')}>
        {t('paper.figures.dataBody')}{' '}
        <Link to={ws.sourcesPath}>{t('paper.figures.addData')}</Link>
      </Alert>
      <SamePage kind="figures" item={fig} />
      <PaperItemChat
        key={fig.id}
        labId={ws.lab.id}
        aiAvailable={ws.aiAvailable}
        context={{ item_id: fig.id, selection: selectionText('figures', fig), source_ref: ref || undefined }}
        onCite={ws.cite}
        openLabel={t('paper.figures.ask')}
        suggestions={[t('paper.figures.q1'), t('paper.figures.q2'), t('paper.figures.q3')]}
      />
    </article>
  )
}

export function TableDetail({ table }) {
  const { t } = useT()
  const ws = useWorkspace()
  const headingId = useId()
  const ref = firstRef(table)
  const columns = Array.isArray(table.columns) ? table.columns : []
  const rows = Array.isArray(table.rows) ? table.rows.filter(Array.isArray) : []
  const width = Math.max(columns.length, ...rows.map((r) => r.length), 0)
  return (
    <article className="card stack paper-detail" aria-labelledby={headingId}>
      <DetailHead kind="tables" item={table} headingId={headingId} />
      {table.caption ? <RichText text={table.caption} /> : null}
      {rows.length || columns.length ? (
        <div className="table-wrap" tabIndex={0} role="region" aria-label={itemLabel('tables', table, t)}>
          <table className="table">
            {columns.length ? (
              <thead>
                <tr>
                  {Array.from({ length: width }, (_, i) => (
                    <th key={i} scope="col">
                      {columns[i] ?? ''}
                    </th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {Array.from({ length: width }, (_, i) => (
                    <td key={i}>{row[i] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Alert tone="neutral">{t('paper.tables.noRows')}</Alert>
      )}
      <p className="ai-note" style={{ margin: 0 }}>
        <Table2 size={16} aria-hidden="true" />
        <span>{t('paper.tables.note')}</span>
      </p>
      <SamePage kind="tables" item={table} />
      <PaperItemChat
        key={table.id}
        labId={ws.lab.id}
        aiAvailable={ws.aiAvailable}
        context={{ item_id: table.id, selection: selectionText('tables', table), source_ref: ref || undefined }}
        onCite={ws.cite}
        openLabel={t('paper.tables.ask')}
        suggestions={[t('paper.tables.q1'), t('paper.tables.q2')]}
      />
    </article>
  )
}

export function MethodDetail({ method }) {
  const { t } = useT()
  const ws = useWorkspace()
  const headingId = useId()
  const ref = firstRef(method)
  const label = itemLabel('methods', method, t)
  const genKey = `method:${method.id}`
  const busy = ws.gen?.status === 'loading'
  return (
    <article className="card stack paper-detail" aria-labelledby={headingId}>
      <DetailHead kind="methods" item={method} headingId={headingId} />
      {method.summary ? <RichText text={method.summary} /> : <p className="small muted">{t('paper.methods.noSummary')}</p>}
      <RefChips refs={method.source_refs} label={label} />
      <div className="stack-sm paper-actions">
        <h4 style={{ margin: 0 }}>{t('paper.methods.turnInto')}</h4>
        <div className="row">
          <Button
            size="sm"
            variant="paper"
            icon={Workflow}
            loading={busy && ws.gen?.key === genKey && ws.gen?.types?.[0] === 'flow'}
            disabled={!ws.aiAvailable || (busy && ws.gen?.key !== genKey)}
            onClick={() => ws.generate(['flow'], genKey)}
          >
            {t('paper.methods.makeFlow')}
          </Button>
          <Button
            size="sm"
            icon={ListOrdered}
            loading={busy && ws.gen?.key === genKey && ws.gen?.types?.[0] === 'steps'}
            disabled={!ws.aiAvailable || (busy && ws.gen?.key !== genKey)}
            onClick={() => ws.generate(['steps'], genKey)}
          >
            {t('paper.methods.makeSteps')}
          </Button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {t('paper.generate.scopeNote')}
        </p>
        {!ws.aiAvailable ? <Alert tone="info">{t('paper.aiOff')}</Alert> : null}
        <GenerateResult genKey={genKey} />
      </div>
      <PaperItemChat
        key={method.id}
        labId={ws.lab.id}
        aiAvailable={ws.aiAvailable}
        context={{ item_id: method.id, selection: selectionText('methods', method), source_ref: ref || undefined }}
        onCite={ws.cite}
        openLabel={t('paper.methods.ask')}
        suggestions={[t('paper.methods.q1'), t('paper.methods.q2')]}
      />
    </article>
  )
}

function CandidateCard({ candidate }) {
  const { t } = useT()
  const ws = useWorkspace()
  const headingId = useId()
  const target = candidateTarget(ws.paper, candidate)
  const isEquation = target?.kind === 'equations'
  const canExplore = isEquation && ['graph', 'simulation', 'algorithm'].includes(candidate.suggestion)
  const attention = (candidate.suggestion === 'algorithm' || candidate.kind === 'algorithm') && isAttentionRelated(candidate, target?.item)
  const genTypes = GENERATE_FOR[candidate.suggestion]
  const genBusy = ws.gen?.status === 'loading'
  const exploreBusy = isEquation && ws.exploreState[target.item.id]?.status === 'loading'
  return (
    <article className="paper-candidate stack-sm" aria-labelledby={headingId}>
      <div className="stack-sm" style={{ minInlineSize: 0, gap: 'var(--space-2xs)' }}>
        <h4 id={headingId} className="break" style={{ margin: 0 }}>
          {candidate.title}
        </h4>
        <div className="row" style={{ gap: 'var(--space-2xs)' }}>
          <span className="badge">
            <CandidateIcon kind={candidate.kind} />
            {t(`paper.candidateKinds.${candidate.kind}`)}
          </span>
          <span className="badge badge-outline">
            <Sparkles aria-hidden="true" />
            {t('paper.suggestionLabel', { type: t(`paper.suggestion.${candidate.suggestion}`) })}
          </span>
        </div>
      </div>
      {candidate.reason ? (
        <p className="small" style={{ margin: 0 }}>
          {candidate.reason}
        </p>
      ) : null}
      <div className="row" style={{ gap: '0.5rem' }}>
        {canExplore ? (
          <Button
            size="sm"
            icon={WandSparkles}
            loading={exploreBusy}
            disabled={!ws.aiAvailable}
            onClick={() => {
              ws.select('equations', target.item.id)
              ws.explore(target.item)
            }}
          >
            {t('paper.candidates.explore')}
          </Button>
        ) : null}
        {attention ? (
          <Button size="sm" icon={Plus} disabled={Boolean(ws.added[candidate.id])} onClick={() => ws.addAttention(candidate.id, target?.item)}>
            {t('paper.candidates.addAttention')}
          </Button>
        ) : null}
        {genTypes ? (
          <Button
            size="sm"
            icon={candidate.suggestion === 'steps' ? ListOrdered : Workflow}
            loading={genBusy && ws.gen?.key === candidate.id}
            disabled={!ws.aiAvailable || (genBusy && ws.gen?.key !== candidate.id)}
            onClick={() => ws.generate(genTypes, candidate.id)}
          >
            {t(`paper.candidates.generate.${candidate.suggestion}`)}
          </Button>
        ) : null}
        {target ? (
          <Button size="sm" variant="ghost" onClick={() => ws.select(target.kind, target.item.id)}>
            {t('paper.candidates.view')}
          </Button>
        ) : null}
      </div>
      <GenerateResult genKey={candidate.id} />
      <AddedNotice addedKey={candidate.id} />
    </article>
  )
}

/** "What can I explore?": AI-suggested starting points with one-click actions. */
function CandidateIcon({ kind }) {
  const Icon = CANDIDATE_ICONS[kind] || Lightbulb
  return <Icon aria-hidden="true" />
}

export function CandidatesPanel({ candidates }) {
  const { t } = useT()
  const ws = useWorkspace()
  if (!candidates.length) return <KindEmpty kind="candidates" />
  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>
        {t('paper.candidates.intro')}
      </p>
      {!ws.aiAvailable ? <Alert tone="info">{t('paper.aiOff')}</Alert> : null}
      <ul className="paper-candidates list-reset">
        {candidates.map((c) => (
          <li key={c.id}>
            <CandidateCard candidate={c} />
          </li>
        ))}
      </ul>
      <p className="small muted" style={{ margin: 0 }}>
        <BookOpen size={14} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> {t('paper.candidates.honest')}
      </p>
    </div>
  )
}
