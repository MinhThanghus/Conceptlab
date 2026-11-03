import { useEffect, useId, useRef, useState } from 'react'
import { Link, Plus, Workflow } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { Alert, Button, ConfirmDialog, EmptyState, Segmented, SelectField, TextArea, TextField } from '../../../components/ui/index.js'
import { BlockMetaFields, EditorItem, SourceRefsEditor } from '../steps/LessonEditorKit.jsx'
import { LIMITS, moveItem, uniqueId } from '../steps/lessonKit.js'
import { FlowDiagram, nodeName } from './FlowDiagram.jsx'
import { sequentialEdges } from './flowLayout.js'
import '../steps/lesson.css'
import './flow.css'

/** Teacher editor for a flow block: layout, nodes, arrows, live preview. */
export default function FlowEditor({ block, onChange }) {
  const { t } = useT()
  const nodes = block.nodes || []
  const edges = block.edges || []
  const nodesTitleId = useId()
  const edgesTitleId = useId()
  const domId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [openNode, setOpenNode] = useState(null)
  const [openEdge, setOpenEdge] = useState(null)
  const [pendingRemove, setPendingRemove] = useState(null)
  const [notice, setNotice] = useState('')
  const labelInputs = useRef({})
  const focusNode = useRef(null)

  useEffect(() => {
    if (focusNode.current && labelInputs.current[focusNode.current]) {
      labelInputs.current[focusNode.current].focus()
      focusNode.current = null
    }
  })

  const set = (patch) => onChange({ ...block, ...patch })
  const updateNode = (id, patch) => set({ nodes: nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) })
  const updateEdge = (id, patch) => set({ edges: edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) })
  const takenIds = () => [...nodes.map((n) => n.id), ...edges.map((e) => e.id)]

  const addNode = () => {
    if (nodes.length >= LIMITS.flowNodes) return
    const id = uniqueId('n', takenIds())
    set({ nodes: [...nodes, { id, label: '', description: '', source_refs: [] }] })
    setOpenNode(id)
    focusNode.current = id
  }
  const removeNode = (id) => {
    set({ nodes: nodes.filter((n) => n.id !== id), edges: edges.filter((e) => e.source !== id && e.target !== id) })
    if (openNode === id) setOpenNode(null)
  }
  const addEdge = () => {
    if (edges.length >= LIMITS.flowEdges || nodes.length < 2) return
    const id = uniqueId('e', takenIds())
    const last = nodes[nodes.length - 1]
    const before = nodes[nodes.length - 2]
    set({ edges: [...edges, { id, source: before.id, target: last.id, label: '', description: '', source_refs: [] }] })
    setOpenEdge(id)
  }
  const connectInOrder = () => {
    const taken = new Set(takenIds())
    const added = sequentialEdges(nodes, edges, block.layout, () => {
      const id = uniqueId('e', taken)
      taken.add(id)
      return id
    }).slice(0, Math.max(0, LIMITS.flowEdges - edges.length))
    if (added.length) set({ edges: [...edges, ...added] })
    setNotice(added.length ? t('flow.edit.connected', { count: added.length }) : t('flow.edit.nothingToConnect'))
  }

  const nodeOptions = nodes.map((n, i) => ({ value: n.id, label: `${i + 1}. ${nodeName(n, i, t)}` }))
  const nameOf = (id) => {
    const i = nodes.findIndex((n) => n.id === id)
    return i >= 0 ? nodeName(nodes[i], i, t) : t('flow.edit.missingNode')
  }

  const openFromPreview = (item) => {
    if (item.type === 'node') setOpenNode(item.id)
    else setOpenEdge(item.id)
    requestAnimationFrame(() => document.getElementById(`${domId}-${item.type}-${item.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }

  const edgeCount = (id) => edges.filter((e) => e.source === id || e.target === id).length

  return (
    <div className="lk-editor">
      <BlockMetaFields block={block} onChange={onChange}>
        <div className="field">
          <span className="field-label" id={`${domId}-layout`}>
            {t('flow.edit.layout')}
          </span>
          <div>
            <Segmented
              label={t('flow.edit.layout')}
              value={block.layout === 'cycle' ? 'cycle' : 'linear'}
              onChange={(layout) => set({ layout })}
              options={[
                { value: 'linear', label: t('flow.edit.layoutLinear') },
                { value: 'cycle', label: t('flow.edit.layoutCycle') },
              ]}
            />
          </div>
          <span className="field-hint">{block.layout === 'cycle' ? t('flow.edit.layoutCycleHint') : t('flow.edit.layoutLinearHint')}</span>
        </div>
      </BlockMetaFields>

      <section className="lk-section" aria-labelledby={nodesTitleId}>
        <h3 id={nodesTitleId} className="lk-section-title">
          {t('flow.edit.nodesTitle', { count: nodes.length })}
        </h3>
        <p className="lk-hint">{t('flow.edit.nodesHint')}</p>
        {nodes.length ? (
          <ol className="list-reset stack-sm">
            {nodes.map((node, i) => (
              <EditorItem
                key={node.id}
                id={`${domId}-node-${node.id}`}
                index={i}
                count={nodes.length}
                title={node.label?.trim()}
                emptyTitle={t('flow.edit.untitledNode', { n: i + 1 })}
                open={openNode === node.id}
                onToggle={() => setOpenNode(openNode === node.id ? null : node.id)}
                onMove={(delta) => set({ nodes: moveItem(nodes, i, i + delta) })}
                onRemove={() => (edgeCount(node.id) || node.description?.trim() || node.label?.trim() ? setPendingRemove(node) : removeNode(node.id))}
              >
                <TextField
                  ref={(el) => {
                    labelInputs.current[node.id] = el
                  }}
                  label={t('flow.edit.nodeLabel')}
                  hint={t('flow.edit.nodeLabelHint')}
                  value={node.label || ''}
                  maxLength={LIMITS.short}
                  onChange={(e) => updateNode(node.id, { label: e.target.value })}
                />
                <TextArea
                  label={t('flow.edit.nodeDescription')}
                  hint={t('flow.edit.descriptionHint')}
                  rows={3}
                  maxLength={LIMITS.medium}
                  value={node.description || ''}
                  onChange={(e) => updateNode(node.id, { description: e.target.value })}
                />
                <SourceRefsEditor refs={node.source_refs || []} max={LIMITS.stepRefs} onChange={(source_refs) => updateNode(node.id, { source_refs })} />
              </EditorItem>
            ))}
          </ol>
        ) : (
          <EmptyState icon={Workflow} title={t('flow.edit.emptyNodesTitle')}>
            {t('flow.edit.emptyNodesBody')}
          </EmptyState>
        )}
        <Button icon={Plus} className="lk-add" onClick={addNode} disabled={nodes.length >= LIMITS.flowNodes}>
          {t('flow.edit.addNode')}
        </Button>
        {nodes.length >= LIMITS.flowNodes ? <p className="lk-limit">{t('flow.edit.nodesLimit', { max: LIMITS.flowNodes })}</p> : null}
      </section>

      <section className="lk-section" aria-labelledby={edgesTitleId}>
        <h3 id={edgesTitleId} className="lk-section-title">
          {t('flow.edit.edgesTitle', { count: edges.length })}
        </h3>
        <p className="lk-hint">{t('flow.edit.edgesHint')}</p>
        {nodes.length >= 2 ? (
          <div className="row">
            <Button size="sm" icon={Link} onClick={connectInOrder} disabled={edges.length >= LIMITS.flowEdges}>
              {block.layout === 'cycle' ? t('flow.edit.connectCycle') : t('flow.edit.connectLinear')}
            </Button>
            <span className="small muted" role="status">
              {notice}
            </span>
          </div>
        ) : null}
        {edges.length ? (
          <ol className="list-reset stack-sm">
            {edges.map((edge, i) => {
              const broken = !nodes.some((n) => n.id === edge.source) || !nodes.some((n) => n.id === edge.target)
              const self = edge.source === edge.target
              const title = `${nameOf(edge.source)} → ${nameOf(edge.target)}${edge.label?.trim() ? ` (${edge.label.trim()})` : ''}`
              return (
                <EditorItem
                  key={edge.id}
                  id={`${domId}-edge-${edge.id}`}
                  index={i}
                  count={edges.length}
                  title={title}
                  emptyTitle={title}
                  open={openEdge === edge.id}
                  onToggle={() => setOpenEdge(openEdge === edge.id ? null : edge.id)}
                  onMove={(delta) => set({ edges: moveItem(edges, i, i + delta) })}
                  onRemove={() => set({ edges: edges.filter((e) => e.id !== edge.id) })}
                  flags={broken || self ? <span className="badge badge-warning">{t('flow.edit.needsFix')}</span> : null}
                >
                  <div className="lk-grid-2">
                    <SelectField
                      label={t('flow.edit.edgeFrom')}
                      value={nodes.some((n) => n.id === edge.source) ? edge.source : ''}
                      placeholder={t('flow.edit.chooseNode')}
                      options={nodeOptions}
                      onChange={(e) => updateEdge(edge.id, { source: e.target.value })}
                      error={self ? t('flow.edit.selfLoop') : undefined}
                    />
                    <SelectField
                      label={t('flow.edit.edgeTo')}
                      value={nodes.some((n) => n.id === edge.target) ? edge.target : ''}
                      placeholder={t('flow.edit.chooseNode')}
                      options={nodeOptions}
                      onChange={(e) => updateEdge(edge.id, { target: e.target.value })}
                      error={self ? t('flow.edit.selfLoop') : undefined}
                    />
                  </div>
                  <TextField
                    label={t('flow.edit.edgeLabel')}
                    hint={t('flow.edit.edgeLabelHint')}
                    value={edge.label || ''}
                    maxLength={LIMITS.short}
                    onChange={(e) => updateEdge(edge.id, { label: e.target.value })}
                  />
                  <TextArea
                    label={t('flow.edit.edgeDescription')}
                    hint={t('flow.edit.descriptionHint')}
                    rows={3}
                    maxLength={LIMITS.medium}
                    value={edge.description || ''}
                    onChange={(e) => updateEdge(edge.id, { description: e.target.value })}
                  />
                  <SourceRefsEditor refs={edge.source_refs || []} max={LIMITS.stepRefs} onChange={(source_refs) => updateEdge(edge.id, { source_refs })} />
                </EditorItem>
              )
            })}
          </ol>
        ) : (
          <p className="lk-hint">{nodes.length >= 2 ? t('flow.edit.emptyEdges') : t('flow.edit.needTwoNodes')}</p>
        )}
        <Button icon={Plus} className="lk-add" onClick={addEdge} disabled={nodes.length < 2 || edges.length >= LIMITS.flowEdges}>
          {t('flow.edit.addEdge')}
        </Button>
        {edges.length >= LIMITS.flowEdges ? <p className="lk-limit">{t('flow.edit.edgesLimit', { max: LIMITS.flowEdges })}</p> : null}
      </section>

      <section className="lk-section">
        <h3 className="lk-section-title">{t('flow.edit.previewTitle')}</h3>
        {nodes.length ? (
          <>
            <p className="lk-hint">{t('flow.edit.previewHint')}</p>
            <FlowDiagram block={block} selected={null} onSelect={openFromPreview} label={t('flow.edit.previewTitle')} />
          </>
        ) : (
          <Alert tone="neutral">{t('flow.edit.previewEmpty')}</Alert>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(pendingRemove)}
        onClose={() => setPendingRemove(null)}
        onConfirm={() => {
          removeNode(pendingRemove.id)
          setPendingRemove(null)
        }}
        tone="danger"
        title={t('flow.edit.removeNodeTitle')}
        confirmLabel={t('common.actions.delete')}
      >
        <p style={{ margin: 0 }}>
          {pendingRemove && edgeCount(pendingRemove.id)
            ? t('flow.edit.removeNodeWithEdges', { name: nameOf(pendingRemove.id), count: edgeCount(pendingRemove.id) })
            : t('flow.edit.removeNodeBody', { name: pendingRemove ? nameOf(pendingRemove.id) : '' })}
        </p>
      </ConfirmDialog>
    </div>
  )
}
