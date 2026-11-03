import { Fragment, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MoveRight } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { useElementSize } from '../steps/lessonHooks.js'
import { edgePaths, layoutFlow, validEdges } from './flowLayout.js'
import './flow.css'

export function nodeName(node, index, t) {
  return node?.label?.trim() || t('flow.view.untitledNode', { n: index + 1 })
}

/**
 * Process diagram: HTML buttons for nodes (readable text, keyboard order = node order, each
 * node followed by its outgoing arrows) over an SVG layer of arrows.
 * selected / active: { type: 'node'|'edge', id } — `active` is the item highlighted by "Run".
 * On a lesson slide: `large` sets the boxes for labels at lead size and heavier arrows; `fill`
 * lets the diagram take the height its well is given (the well's size never follows its content).
 */
export function FlowDiagram({ block, selected, active, onSelect, label, panelId, large = false, fill = false }) {
  const { t } = useT()
  const nodes = useMemo(() => block.nodes || [], [block.nodes])
  const edges = useMemo(() => validEdges(nodes, block.edges || []), [nodes, block.edges])
  const wrapRef = useRef(null)
  const { width, height: wrapHeight } = useElementSize(wrapRef)
  const [sizes, setSizes] = useState({})
  const nodeRefs = useRef({})
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const room = fill ? Math.max(0, Math.floor(wrapHeight) - 2) : 0
  const head = large ? 13 : 9

  const layout = useMemo(() => layoutFlow({ layout: block.layout, nodes, edges, width, sizes, large, room }), [block.layout, nodes, edges, width, sizes, large, room])
  const paths = useMemo(() => edgePaths({ ...layout, nodes, edges, sizes, width }), [layout, nodes, edges, sizes, width])
  const pathById = useMemo(() => new Map(paths.map((p) => [p.id, p])), [paths])
  const nodeIndex = useMemo(() => new Map(nodes.map((n, i) => [n.id, i])), [nodes])

  // measure the rendered boxes so arrows start and end exactly at their borders
  useLayoutEffect(() => {
    const next = {}
    let changed = false
    for (const node of nodes) {
      const el = nodeRefs.current[node.id]
      if (!el) continue
      const w = el.offsetWidth
      const h = el.offsetHeight
      next[node.id] = { w, h }
      if (sizes[node.id]?.w !== w || sizes[node.id]?.h !== h) changed = true
    }
    if (changed || Object.keys(sizes).length !== Object.keys(next).length) setSizes(next)
  })

  const isOn = (item, type, id) => item?.type === type && item?.id === id
  const describeEdge = (edge) => {
    const from = nodeName(nodes[nodeIndex.get(edge.source)], nodeIndex.get(edge.source), t)
    const to = nodeName(nodes[nodeIndex.get(edge.target)], nodeIndex.get(edge.target), t)
    return edge.label?.trim() ? t('flow.view.edgeAriaLabel', { from, to, label: edge.label.trim() }) : t('flow.view.edgeAria', { from, to })
  }

  return (
    <div ref={wrapRef} className={['flow-wrap', large ? 'is-large' : '', fill ? 'is-fill' : ''].filter(Boolean).join(' ')} role="group" aria-label={label}>
      {width ? (
        <div className={`flow-canvas mode-${layout.mode}`} style={{ blockSize: `${Math.ceil(layout.height)}px` }}>
          <svg className="flow-svg" width={width} height={Math.ceil(layout.height)} viewBox={`0 0 ${width} ${Math.ceil(layout.height)}`} aria-hidden="true" focusable="false">
            <defs>
              <marker id={`${uid}-a`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth={head} markerHeight={head} markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" className="flow-head" />
              </marker>
              <marker id={`${uid}-b`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth={head + 2} markerHeight={head + 2} markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" className="flow-head is-active" />
              </marker>
            </defs>
            {paths.map((p) => {
              const on = isOn(selected, 'edge', p.id) || isOn(active, 'edge', p.id)
              return <path key={p.id} d={p.d} className={['flow-edge', on ? 'is-active' : '', isOn(active, 'edge', p.id) ? 'is-running' : ''].join(' ')} markerEnd={`url(#${uid}-${on ? 'b' : 'a'})`} />
            })}
            {onSelect
              ? paths.map((p) => <path key={`hit-${p.id}`} d={p.d} className="flow-edge-hit" onClick={() => onSelect({ type: 'edge', id: p.id })} />)
              : null}
          </svg>
          {nodes.map((node, i) => {
            const c = layout.centres[node.id]
            if (!c) return null
            const on = isOn(selected, 'node', node.id)
            const running = isOn(active, 'node', node.id)
            const descId = `${uid}-d-${i}`
            return (
              <Fragment key={node.id}>
                <button
                  ref={(el) => {
                    nodeRefs.current[node.id] = el
                  }}
                  type="button"
                  className={['flow-node', on ? 'is-selected' : '', running ? 'is-running' : ''].join(' ')}
                  style={{ left: `${c.x}px`, top: `${c.y}px`, inlineSize: `${layout.nodeWidth}px` }}
                  aria-pressed={onSelect ? on : undefined}
                  aria-controls={panelId}
                  aria-describedby={node.description ? descId : undefined}
                  disabled={!onSelect}
                  onClick={() => onSelect?.({ type: 'node', id: node.id })}
                >
                  <span className="flow-node-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="flow-node-label">{nodeName(node, i, t)}</span>
                </button>
                {node.description ? (
                  <span id={descId} className="visually-hidden">
                    {node.description}
                  </span>
                ) : null}
                {edges
                  .filter((e) => e.source === node.id)
                  .map((edge) => {
                    const p = pathById.get(edge.id)
                    if (!p) return null
                    const edgeOn = isOn(selected, 'edge', edge.id) || isOn(active, 'edge', edge.id)
                    const text = edge.label?.trim()
                    const rowRoom = layout.mode === 'row' ? Math.max(56, (layout.gap || 80) - 6) : null
                    // a word that cannot fit between two nodes would break mid-word: show the arrow, the words stay in the name and the detail
                    const tooLong = rowRoom !== null && Boolean(text) && Math.max(...text.split(/\s+/).map((w) => w.length)) * (large ? 9 : 7.2) + 24 > rowRoom
                    const compact = p.compact || !text || tooLong
                    return (
                      <button
                        key={edge.id}
                        type="button"
                        className={['flow-edge-label', compact ? 'is-compact' : '', edgeOn ? 'is-active' : ''].join(' ')}
                        style={{ left: `${p.labelX}px`, top: `${p.labelY}px`, maxInlineSize: rowRoom !== null ? `${rowRoom}px` : undefined }}
                        aria-label={describeEdge(edge)}
                        title={describeEdge(edge)}
                        aria-pressed={onSelect ? isOn(selected, 'edge', edge.id) : undefined}
                        aria-controls={panelId}
                        disabled={!onSelect}
                        onClick={() => onSelect?.({ type: 'edge', id: edge.id })}
                      >
                        {compact ? <MoveRight aria-hidden="true" style={p.angle ? { rotate: `${p.angle}deg` } : undefined} /> : <span aria-hidden="true">{text}</span>}
                      </button>
                    )
                  })}
              </Fragment>
            )
          })}
        </div>
      ) : (
        <div className="skeleton" style={{ blockSize: '14rem' }} aria-hidden="true" />
      )}
    </div>
  )
}
