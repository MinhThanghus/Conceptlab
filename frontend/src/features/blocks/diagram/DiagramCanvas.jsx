import { useId, useMemo, useState } from 'react'
import { useT } from '../../../i18n/index.jsx'
import { ImageStage } from '../steps/MediaStage.jsx'
import { hotspotShape, markerPosition, relationLines } from './diagramLogic.js'
import './diagram.css'

function Shape({ shape, className, onClick, onEnter, onLeave }) {
  const common = { className, onClick, onPointerEnter: onEnter, onPointerLeave: onLeave, vectorEffect: 'non-scaling-stroke' }
  if (shape.kind === 'path') {
    return (
      <>
        <path d={shape.d} className="dg-shape-halo" vectorEffect="non-scaling-stroke" fillRule="evenodd" />
        <path d={shape.d} fillRule="evenodd" {...common} />
      </>
    )
  }
  return (
    <>
      <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx="6" className="dg-shape-halo" vectorEffect="non-scaling-stroke" />
      <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx="6" {...common} />
    </>
  )
}

/**
 * Picture + hotspot shapes (SVG 0..1000, preserveAspectRatio none) + relation arrows (uniform
 * SVG so arrowheads are not stretched) + numbered markers. Pointer only: keyboard users work
 * through the parts list that mirrors these hotspots.
 *
 * mode: 'explore' | 'test' | 'edit'
 */
export function DiagramCanvas({
  src,
  alt,
  size,
  hotspots = [],
  relations = [],
  proposals = [],
  selectedId,
  highlightId,
  questionId,
  selectedRelationId,
  onSelectPart,
  onSelectRelation,
  onHover,
  mode = 'explore',
  zoom = 1,
  maxBlock,
  numberOf,
  children,
}) {
  const { t } = useT()
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [natural, setNatural] = useState(size || null)
  const ratio = natural?.width && natural?.height ? natural.width / natural.height : size?.width && size?.height ? size.width / size.height : 0.75
  const H = 1000 / ratio
  // Learners see arrows only for what they selected (a relation, or the relations of a part):
  // drawing every arrow at once covers the labels of the picture. Editors see them all.
  const shownRelations = useMemo(() => {
    if (mode === 'test') return []
    if (mode === 'edit') return relations
    if (selectedRelationId) return relations.filter((r) => r.id === selectedRelationId)
    if (selectedId) return relations.filter((r) => r.source === selectedId || r.target === selectedId)
    return []
  }, [relations, mode, selectedRelationId, selectedId])
  const lines = useMemo(() => relationLines(shownRelations, hotspots, ratio), [shownRelations, hotspots, ratio])
  const testing = mode === 'test'
  const indexOf = (id) => (numberOf ? numberOf(id) : hotspots.findIndex((h) => h.id === id) + 1)

  return (
    <ImageStage src={src} alt={alt} size={size} onSize={setNatural} zoom={zoom} maxBlock={maxBlock}>
      <svg className="dg-layer" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        {hotspots.map((h) => {
          const shape = hotspotShape(h)
          if (!shape) return null
          const isQuestion = questionId === h.id
          if (testing && !isQuestion) return null
          const cls = [
            'dg-shape',
            selectedId === h.id ? 'is-selected' : '',
            highlightId === h.id ? 'is-hover' : '',
            isQuestion ? 'is-question' : '',
            onSelectPart ? 'is-clickable' : '',
          ].join(' ')
          return (
            <Shape
              key={h.id}
              shape={shape}
              className={cls}
              onClick={onSelectPart ? () => onSelectPart(h.id) : undefined}
              onEnter={onHover ? () => onHover(h.id) : undefined}
              onLeave={onHover ? () => onHover(null) : undefined}
            />
          )
        })}
        {proposals.map((h) => {
          const shape = hotspotShape(h)
          return shape ? <Shape key={`p-${h.id}`} shape={shape} className="dg-shape is-proposal" /> : null
        })}
      </svg>

      {lines.length ? (
        <svg className="dg-layer dg-relations" viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <defs>
            <marker id={`${uid}-rel`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" className="dg-rel-head" />
            </marker>
            <marker id={`${uid}-rel-on`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" className="dg-rel-head is-active" />
            </marker>
          </defs>
          {lines.map((l) => {
            const on = selectedRelationId === l.id
            return (
              <g key={l.id}>
                <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className="dg-rel-halo" vectorEffect="non-scaling-stroke" />
                <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className={['dg-rel', on ? 'is-active' : ''].join(' ')} vectorEffect="non-scaling-stroke" markerEnd={`url(#${uid}-rel${on ? '-on' : ''})`} />
                {onSelectRelation ? (
                  <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className="dg-rel-hit" vectorEffect="non-scaling-stroke" onClick={() => onSelectRelation(l.id)} />
                ) : null}
              </g>
            )
          })}
        </svg>
      ) : null}

      {lines.map((l) =>
        l.relation.label?.trim() ? (
          <button
            key={`lbl-${l.id}`}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className={['dg-rel-label', selectedRelationId === l.id ? 'is-active' : ''].join(' ')}
            style={{ left: `${l.mx * 100}%`, top: `${l.my * 100}%` }}
            onClick={onSelectRelation ? () => onSelectRelation(l.id) : undefined}
          >
            {l.relation.label.trim()}
          </button>
        ) : null,
      )}

      {hotspots.map((h) => {
        const pos = markerPosition(h)
        if (!pos) return null
        const isQuestion = questionId === h.id
        if (testing && !isQuestion) return null
        const active = selectedId === h.id || highlightId === h.id
        const showName = !testing && active && h.label?.trim()
        return (
          <span
            key={`m-${h.id}`}
            className={['dg-marker', active ? 'is-active' : '', isQuestion ? 'is-question' : ''].join(' ')}
            style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
            aria-hidden="true"
            onClick={onSelectPart && !testing ? () => onSelectPart(h.id) : undefined}
            onPointerEnter={onHover ? () => onHover(h.id) : undefined}
            onPointerLeave={onHover ? () => onHover(null) : undefined}
          >
            <span className="dg-marker-num">{isQuestion ? '?' : indexOf(h.id)}</span>
            {showName ? <span className="dg-marker-tag">{h.label.trim()}</span> : null}
          </span>
        )
      })}

      {proposals.map((h, i) => {
        const pos = markerPosition(h)
        return pos ? (
          <span key={`pm-${h.id}`} className="dg-marker is-proposal" style={{ left: `${pos.left}%`, top: `${pos.top}%` }} aria-hidden="true">
            <span className="dg-marker-num">{t('diagram.edit.proposalMarker', { n: i + 1 })}</span>
          </span>
        ) : null
      })}

      {children}
    </ImageStage>
  )
}
