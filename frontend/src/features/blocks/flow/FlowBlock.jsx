import { lazy, Suspense, useEffect, useId, useMemo, useState } from 'react'
import { ArrowDown, GitBranch, MessageCircleQuestion, MoveRight, Play, RotateCcw, Square } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { Button, EmptyState, LoadingBlock, RichText } from '../../../components/ui/index.js'
import { BlockFrame } from '../BlockRenderer.jsx'
import { useBlockEnv } from '../BlockEnv.jsx'
import { SourceRefChips } from '../../sources/SourceRefChips.jsx'
import { useCanAsk, useReducedMotion, useReportState } from '../steps/lessonHooks.js'
import { FlowDiagram, nodeName } from './FlowDiagram.jsx'
import { runSequence, validEdges } from './flowLayout.js'
import FlowIllustration from './FlowIllustration.jsx'
import '../steps/lesson.css'
import './flow.css'

const FlowEditor = lazy(() => import('./FlowEditor.jsx'))

const NODE_MS = 6500
const EDGE_MS = 4000

/** Process / cycle diagram (spec §5.2; water cycle, carbon cycle…). */
export default function FlowBlock({ block, mode, onChange }) {
  if (mode === 'edit') {
    return (
      <Suspense fallback={<LoadingBlock lines={4} height="10rem" />}>
        <FlowEditor block={block} onChange={onChange} />
      </Suspense>
    )
  }
  return <FlowView block={block} />
}

function FlowView({ block }) {
  const { t } = useT()
  const reduced = useReducedMotion()
  const panelId = useId()
  const nodes = useMemo(() => block.nodes || [], [block.nodes])
  const edges = useMemo(() => validEdges(nodes, block.edges || []), [nodes, block.edges])
  const sequence = useMemo(() => runSequence(nodes, edges), [nodes, edges])
  const [selected, setSelected] = useState(() => sequence[0] || null)
  const [runPos, setRunPos] = useState(-1)
  const [running, setRunning] = useState(false)
  const [announce, setAnnounce] = useState('')
  const current = running ? sequence[runPos] || null : null
  const isReadingFlow = block.layout !== 'cycle' && edges.length === Math.max(0, nodes.length - 1)
    && nodes.slice(1).every((node, i) => edges.some((edge) => edge.source === nodes[i].id && edge.target === node.id))

  const itemName = (item) => {
    if (!item) return ''
    if (item.type === 'node') {
      const i = nodes.findIndex((n) => n.id === item.id)
      return nodeName(nodes[i], i, t)
    }
    const edge = edges.find((e) => e.id === item.id)
    if (!edge) return ''
    const from = nodes.findIndex((n) => n.id === edge.source)
    const to = nodes.findIndex((n) => n.id === edge.target)
    return t('flow.view.edgeAria', { from: nodeName(nodes[from], from, t), to: nodeName(nodes[to], to, t) })
  }

  // sequential highlight ("Run the flow"); each item stays for a moment, then the next one
  useEffect(() => {
    if (!running) return undefined
    const item = sequence[runPos]
    if (!item) {
      setRunning(false)
      setAnnounce(t('flow.view.runDone'))
      return undefined
    }
    setSelected(item)
    setAnnounce(t('flow.view.runStatus', { n: runPos + 1, total: sequence.length, name: itemName(item) }))
    const timer = window.setTimeout(() => setRunPos((p) => p + 1), item.type === 'node' ? NODE_MS : EDGE_MS)
    return () => window.clearTimeout(timer)
  }, [running, runPos, sequence]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setRunning(false)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const selectedLabel = itemName(selected)
  useReportState(block.id, {
    layout: block.layout,
    selected: selected ? { type: selected.type, id: selected.id, name: selectedLabel } : null,
    running,
  })

  // the detail panel changes out of view of a screen reader still on the pressed button: say what it now shows
  const select = (item) => {
    setRunning(false)
    setSelected(item)
    setAnnounce(t('flow.view.selectedStatus', { name: itemName(item) }))
  }
  const toggleRun = () => {
    if (running) {
      setRunning(false)
      setAnnounce(t('flow.view.runStopped'))
      return
    }
    setRunPos(0)
    setRunning(true)
  }

  if (!nodes.length) {
    return (
      <BlockFrame block={block}>
        <EmptyState icon={GitBranch} title={t('flow.view.emptyTitle')}>
          {t('flow.view.emptyBody')}
        </EmptyState>
      </BlockFrame>
    )
  }

  const finished = !running && runPos >= sequence.length && sequence.length > 0
  return (
    <BlockFrame block={block}>
      <div className={['flow', reduced ? 'is-reduced' : ''].join(' ')}>
        <div className="flow-toolbar">
          <Button variant={running ? 'soft' : 'primary'} icon={running ? Square : finished ? RotateCcw : Play} aria-pressed={running} onClick={toggleRun} disabled={!sequence.length}>
            {running ? t('flow.view.stop') : finished ? t('flow.view.runAgain') : t('flow.view.run')}
          </Button>
          <span className="small muted" aria-hidden="true">
            {running ? t('flow.view.runProgress', { n: runPos + 1, total: sequence.length }) : t('flow.view.hintShort')}
          </span>
        </div>
        <div className={isReadingFlow ? 'flow-reading' : 'flow-graph-reading'}>
          {isReadingFlow ? <nav className="flow-step-rail" aria-label={t('flow.view.diagramLabel', { title: block.title || t('blocks.types.flow') })}>
            <ol>{nodes.map((node, i) => {
              const edge = edges.find((item) => item.source === node.id)
              return <li key={node.id}>
                <button type="button" className={`flow-node flow-step-button ${selected?.type === 'node' && selected.id === node.id ? 'is-selected' : ''}`} aria-pressed={selected?.type === 'node' && selected.id === node.id} aria-controls={panelId} onClick={() => select({ type: 'node', id: node.id })}>
                  <span className="flow-node-num">{i + 1}</span>{' '}<span className="flow-node-label">{nodeName(node, i, t)}</span>
                </button>
                {edge ? <button type="button" className={`flow-step-connection ${selected?.type === 'edge' && selected.id === edge.id ? 'is-selected' : ''}`} onClick={() => select({ type: 'edge', id: edge.id })} aria-controls={panelId} aria-label={t('flow.view.edgeAria', { from: nodeName(node, i, t), to: nodeName(nodes[i + 1], i + 1, t) })}><ArrowDown aria-hidden="true" /><span>{edge.label || t('flow.view.edgeKicker')}</span></button> : null}
              </li>
            })}</ol>
          </nav> : <FlowDiagram block={block} selected={selected} active={current} onSelect={select} label={t('flow.view.diagramLabel', { title: block.title || t('blocks.types.flow') })} panelId={panelId} />}
          <FlowDetail block={block} nodes={nodes} edges={edges} selected={selected} onSelect={select} panelId={panelId} reading={isReadingFlow} />
        </div>
        <p className="visually-hidden" aria-live="polite">
          {announce}
        </p>
      </div>
    </BlockFrame>
  )
}

function FlowDetail({ block, nodes, edges, selected, onSelect, panelId, reading }) {
  const { t } = useT()
  const env = useBlockEnv()
  const canAsk = useCanAsk()
  const indexOf = (id) => nodes.findIndex((n) => n.id === id)
  const nameOf = (id) => nodeName(nodes[indexOf(id)], indexOf(id), t)

  if (!selected) {
    return (
      <div className="flow-detail" id={panelId}>
        <p className="flow-hint">{t('flow.view.hint')}</p>
      </div>
    )
  }

  if (selected.type === 'node') {
    const i = indexOf(selected.id)
    const node = nodes[i]
    if (!node) return null
    const outgoing = edges.filter((e) => e.source === node.id)
    const incoming = edges.filter((e) => e.target === node.id)
    return (
      <div className="flow-detail flow-reading-detail" id={panelId}>
        <FlowIllustration nodeId={node.id} title={nodeName(node, i, t)} />
        <div className="flow-detail-copy">
        <div className="flow-detail-head">
          <span className="flow-detail-num" aria-hidden="true">
            {i + 1}
          </span>
          <h3>{nodeName(node, i, t)}</h3>
        </div>
        {node.description ? <RichText text={node.description} /> : <p className="flow-hint">{t('flow.view.noDescription')}</p>}
        {node.source_refs?.length ? <SourceRefChips refs={node.source_refs} /> : null}
        {incoming.length ? (
          <div className="flow-links">
            <span className="small muted">{t('flow.view.comeFrom')}</span>
            {incoming.map((e) => (
              <button key={e.id} type="button" className="chip" onClick={() => onSelect({ type: 'node', id: e.source })}>
                {nameOf(e.source)}
              </button>
            ))}
          </div>
        ) : null}
        {outgoing.length ? (
          <div className="flow-links">
            <span className="small muted">{t('flow.view.goTo')}</span>
            {outgoing.map((e) => (
              <button key={e.id} type="button" className="chip" onClick={() => onSelect(reading ? { type: 'node', id: e.target } : { type: 'edge', id: e.id })}>
                {nameOf(e.target)}
                {e.label?.trim() ? <span className="flow-chip-note">({e.label.trim()})</span> : null}
              </button>
            ))}
          </div>
        ) : null}
        {canAsk ? (
          <div>
            <Button size="sm" variant="soft" icon={MessageCircleQuestion} onClick={() => env.ask({ block_id: block.id, item_id: node.id })}>
              {t('flow.view.askNode')}
            </Button>
          </div>
        ) : null}
        </div>
      </div>
    )
  }

  const edge = edges.find((e) => e.id === selected.id)
  if (!edge) return null
  return (
    <div className="flow-detail" id={panelId}>
      <h3 className="flow-edge-title">
        <span>{nameOf(edge.source)}</span>
        <MoveRight aria-hidden="true" />
        <span>{nameOf(edge.target)}</span>
        <span className="visually-hidden">{t('flow.view.edgeAria', { from: nameOf(edge.source), to: nameOf(edge.target) })}</span>
      </h3>
      {edge.label?.trim() ? <p className="flow-edge-name">{edge.label.trim()}</p> : null}
      {edge.description ? <RichText text={edge.description} /> : <p className="flow-hint">{t('flow.view.noDescription')}</p>}
      {edge.source_refs?.length ? <SourceRefChips refs={edge.source_refs} /> : null}
      <div className="flow-links">
        <span className="small muted">{t('flow.view.comeFrom')}</span>
        <button type="button" className="chip" onClick={() => onSelect({ type: 'node', id: edge.source })}>
          {nameOf(edge.source)}
        </button>
        <span className="small muted">{t('flow.view.goTo')}</span>
        <button type="button" className="chip" onClick={() => onSelect({ type: 'node', id: edge.target })}>
          {nameOf(edge.target)}
        </button>
      </div>
      {canAsk ? (
        <div>
          <Button size="sm" variant="soft" icon={MessageCircleQuestion} onClick={() => env.ask({ block_id: block.id, item_id: edge.id })}>
            {t('flow.view.askEdge')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
