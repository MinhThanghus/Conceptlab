import { useEffect, useState } from 'react'
import { MessageCircleQuestion, MoveRight } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { Button, EmptyState, RichText } from '../../../components/ui/index.js'
import { useBlockEnv } from '../BlockEnv.jsx'
import { SourceRefChips } from '../../sources/SourceRefChips.jsx'
import { useCanAsk, useReportState } from '../steps/lessonHooks.js'
import { CoverCrop, CropPreview } from '../steps/MediaStage.jsx'
import { knownSize, mediaUrl } from '../steps/lessonKit.js'
import { FlowDiagram, nodeName } from './FlowDiagram.jsx'
import FlowIllustration from './FlowIllustration.jsx'
import papers from '../../../../../shared/paper_study_batch.json'
import { validEdges } from './flowLayout.js'
import './flow.css'

function paperPreview(env) {
  return papers.find((paper) => paper.share_code === env.shareCode)
    || (env.space === 'paper2explorer' ? papers.find((paper) => (env.sources || []).some((source) =>
      source.kind === 'note' && String(source.text || '').includes(paper.doi))) : null)
}

function sourcePicture(node, env) {
  return (node?.source_refs || []).map((ref) => {
    if (!ref || !ref.located || ref.located === 'none') return null
    const source = ref.source_id ? env.sourceById(ref.source_id) : null
    if (!source || (source.kind !== 'image' && (source.kind !== 'pdf' || !ref.page))) return null
    const url = mediaUrl({ source, page: ref.page })
    return url ? { ref, source, url } : null
  }).find(Boolean)
}

/** The stages before and after one stage: its links in and out, else its neighbours in the list. */
function neighboursOf(node, nodes, edges) {
  if (!node) return { before: [], after: [] }
  if (edges.length) {
    const unique = (ids) => [...new Set(ids)].filter((id) => id !== node.id)
    return { before: unique(edges.filter((edge) => edge.target === node.id).map((edge) => edge.source)),
      after: unique(edges.filter((edge) => edge.source === node.id).map((edge) => edge.target)) }
  }
  const i = nodes.findIndex((item) => item.id === node.id)
  return { before: i > 0 ? [nodes[i - 1].id] : [], after: i >= 0 && i < nodes.length - 1 ? [nodes[i + 1].id] : [] }
}

/**
 * One learner slide. The parent owns navigation; IDs always refer to the authored flow.
 * In the lesson deck (`inDeck`) the deck's heading names the slide (the group's stages), so the
 * slide adds no heading of its own.
 *  - flow-overview: the whole diagram fills a paper-2 well at lead size; a node opens its group.
 *  - flow-group: the picture of the chosen stage (its located region, zoomed to fill the well; the
 *    topic render on the first group of a paper; else the diagram) beside a numbered list on
 *    hairlines where every stage shows its explanation and where it leads (an arrow, the next
 *    stage, the link's own words). Choosing a row only chooses what the picture shows. A slide of
 *    one stage also names the stages before and after it.
 */
export default function FlowSlide({ block, kind, itemId, nodeIds, edgeIds, focusItem, onSelect, inDeck = false }) {
  const { t } = useT()
  const env = useBlockEnv()
  const canAsk = useCanAsk()
  const [groupFocus, setGroupFocus] = useState(null)
  const [failedPreview, setFailedPreview] = useState(null)
  const requestedType = typeof focusItem === 'string' ? 'node' : focusItem?.type
  const requestedId = typeof focusItem === 'string' ? focusItem : focusItem?.id
  useEffect(() => {
    if (requestedId && (requestedType === 'node' || requestedType === 'edge')) setGroupFocus({ type: requestedType, id: requestedId })
  }, [requestedType, requestedId])
  const nodes = block.nodes || []
  const edges = validEdges(nodes, block.edges || [])
  const index = nodes.findIndex((node) => node.id === itemId)
  const node = index >= 0 ? nodes[index] : null
  const edge = edges.find((item) => item.id === itemId)
  const selected = kind === 'flow-group' ? groupFocus : kind === 'flow-node' && node ? { type: 'node', id: node.id }
    : kind === 'flow-edge' && edge ? { type: 'edge', id: edge.id } : null
  useReportState(block.id, { view: 'flow_slide', selected })
  const name = (id) => {
    const i = nodes.findIndex((item) => item.id === id)
    return nodeName(nodes[i], i, t)
  }
  const ask = (id, edgeItem = false) => canAsk ? <Button variant="soft" icon={MessageCircleQuestion} onClick={() => env.ask({ block_id: block.id, item_id: id })}>
    {t(edgeItem ? 'flow.view.askEdge' : 'flow.view.askNode')}
  </Button> : null
  const diagramLabel = t('flow.view.diagramLabel', { title: block.title || t('blocks.types.flow') })
  // "Trước: Bốc hơi. Sau: Mưa." under a slide that shows one stage
  const around = (item) => {
    const { before, after } = neighboursOf(item, nodes, edges)
    if (!before.length && !after.length) return null
    const list = (ids) => ids.map(name).join(t('flow.slide.listSep'))
    return <p className="flow-around">
      {before.length ? <span>{t('flow.slide.before', { names: list(before) })}</span> : null}
      {before.length && after.length ? ' ' : null}
      {after.length ? <span>{t('flow.slide.after', { names: list(after) })}</span> : null}
    </p>
  }

  if (kind === 'flow-group') {
    const members = Array.isArray(nodeIds) ? nodeIds.map((id) => nodes.find((item) => item.id === id)).filter(Boolean) : nodes
    const memberIds = new Set(members.map((item) => item.id))
    const connections = Array.isArray(edgeIds) ? edgeIds.map((id) => edges.find((item) => item.id === id)).filter(Boolean)
      : edges.filter((item) => memberIds.has(item.source) && memberIds.has(item.target))
    const focusBelongs = groupFocus && (groupFocus.type === 'node' ? memberIds.has(groupFocus.id) : connections.some((item) => item.id === groupFocus.id))
    const visibleSelection = focusBelongs ? groupFocus : (members[0] ? { type: 'node', id: members[0].id } : null)
    // the stage the picture shows: the chosen one, or where the chosen connection starts
    const focusId = visibleSelection?.type === 'edge' ? connections.find((item) => item.id === visibleSelection.id)?.source : visibleSelection?.id
    const focus = members.find((item) => item.id === focusId) || members[0]
    const focusNumber = focus ? nodes.findIndex((item) => item.id === focus.id) + 1 : null
    const citedImage = sourcePicture(focus, env)
    // A topic render is not a figure of these stages: it opens the flow once, on its first group.
    const firstGroup = !members.length || members[0].id === nodes[0]?.id
    const preview = firstGroup ? paperPreview(env) : null
    const previewCode = preview && failedPreview !== preview.share_code ? preview.share_code : null
    const pick = (target) => {
      const inGroup = target.type === 'node' ? memberIds.has(target.id) : connections.some((item) => item.id === target.id)
      if (inGroup) setGroupFocus(target)
      else onSelect?.(target)
    }
    const groupTitle = members.map((item) => nodeName(item, nodes.indexOf(item), t)).join(', ')
    const visual = citedImage ? 'picture' : previewCode ? 'topic' : 'diagram'
    return <article className={`flow-slide flow-group has-${visual}`} aria-label={inDeck ? groupTitle : undefined}>
      <div className="flow-group-grid">
        <div className="flow-group-visual" role={visual === 'diagram' ? undefined : 'region'} aria-label={visual === 'picture' ? t('flow.slide.figure') : visual === 'topic' ? t('flow.slide.image') : undefined}>
          {citedImage ? <figure className="flow-slide-source-figure flow-group-figure">
            <CoverCrop src={citedImage.url} alt={citedImage.source.title || name(focus.id)} bbox={citedImage.ref.bbox} size={knownSize({ source: citedImage.source })} badge={focusNumber} />
            {!env.sourcesAtTop ? <figcaption>{citedImage.source.title}</figcaption> : null}
          </figure> : previewCode ? <figure className="flow-group-topic">
            <div className="flow-group-image-frame"><img src={'/paper-previews/' + previewCode + '.png'} alt={t('flow.slide.image')} onError={() => setFailedPreview(previewCode)} /></div>
            <figcaption>{t('flow.slide.concept')}</figcaption>
          </figure> : <>
            <p className="flow-group-diagram-hint">{t('flow.slide.choose')}</p>
            <FlowDiagram block={block} selected={visibleSelection} onSelect={pick} label={diagramLabel} fill />
          </>}
        </div>
        <div className="flow-group-copy">
          <ol className="flow-group-nodes">{members.map((item, row) => {
            const i = nodes.findIndex((entry) => entry.id === item.id)
            const pressed = visibleSelection?.type === 'node' && visibleSelection.id === item.id
            // every link the stage starts; one with no words of its own that only leads to the next
            // row adds nothing the list does not already say
            const links = connections.filter((link) => link.source === item.id
              && (link.label?.trim() || link.description?.trim() || link.target !== members[row + 1]?.id))
            return <li key={item.id} className={item.id === focus?.id ? 'is-active' : undefined}>
              <button type="button" aria-pressed={pressed} onClick={() => pick({ type: 'node', id: item.id })}>
                <span className="flow-group-number" aria-hidden="true">{i + 1}</span><span className="flow-group-label">{nodeName(item, i, t)}</span>
              </button>
              <div className="flow-group-detail">
                <div className="flow-group-detail-body">
                  {item.description ? <RichText text={item.description} /> : null}
                  {item.source_refs?.length ? <SourceRefChips refs={item.source_refs} /> : null}
                  {links.length ? <ul className="flow-group-links" aria-label={t('flow.slide.relations')}>{links.map((link) => {
                    const chosen = visibleSelection?.type === 'edge' && visibleSelection.id === link.id
                    return <li key={link.id} className={chosen ? 'flow-group-connection is-active' : 'flow-group-connection'}>
                      <MoveRight className="flow-group-arrow" aria-hidden="true" />
                      <div className="flow-group-connection-body">
                        <p className="flow-group-connection-head">
                          <span className="visually-hidden">{t('flow.slide.leadsTo', { name: name(link.target) })}</span>
                          <strong aria-hidden="true">{name(link.target)}</strong>
                          {link.label?.trim() ? <span className="flow-group-connection-label">{link.label.trim()}</span> : null}
                        </p>
                        {link.description ? <RichText text={link.description} /> : null}
                        {link.source_refs?.length ? <SourceRefChips refs={link.source_refs} /> : null}
                      </div>
                    </li>
                  })}</ul> : null}
                </div>
              </div>
            </li>
          })}</ol>
          {members.length === 1 ? around(members[0]) : null}
          {visibleSelection && canAsk ? <div className="flow-group-foot">{ask(visibleSelection.id, visibleSelection.type === 'edge')}</div> : null}
        </div>
      </div>
    </article>
  }

  if (kind === 'flow-overview') {
    if (!nodes.length) return <EmptyState title={t('flow.view.emptyTitle')}>{t('flow.view.emptyBody')}</EmptyState>
    // in the lesson deck the byline under the slide's heading carries this hint
    return <div className="flow-slide flow-slide-overview">
      {onSelect && !inDeck ? <p className="flow-hint">{t('flow.view.hintShort')}</p> : null}
      <FlowDiagram block={block} onSelect={onSelect} label={diagramLabel} large fill />
    </div>
  }

  if (kind === 'flow-node' && node) {
    const title = nodeName(node, index, t)
    // Only use a source picture when its location was actually identified.
    // An arbitrary citation without a location must not become an invented figure.
    const citedImage = sourcePicture(node, env)
    const curatedImage = env.shareCode === 'CHNWRE' && env.visualContext?.visual3d === 'semiconductor_chip' && ['n1', 'n2', 'n3', 'n4'].includes(node.id)
    const hasVisual = Boolean(curatedImage || citedImage)
    return <article className={'flow-slide flow-slide-node' + (hasVisual ? ' has-visual' : '')}>
      {hasVisual ? <div className="flow-slide-visual">
        {curatedImage ? <FlowIllustration nodeId={node.id} title={title} /> : <figure className="flow-slide-source-figure">
          <CropPreview src={citedImage.url} alt={citedImage.source.title || title} bbox={citedImage.ref.bbox} size={knownSize({ source: citedImage.source })} maxBlock="24rem" />
          {!env.sourcesAtTop ? <figcaption>{citedImage.source.title}</figcaption> : null}
        </figure>}
      </div> : null}
      <div className="flow-slide-copy">
        <div className="flow-detail-head"><span className="flow-detail-num" aria-hidden="true">{index + 1}</span><h3>{title}</h3></div>
        {node.description ? <RichText text={node.description} /> : <p className="flow-hint">{t('flow.view.noDescription')}</p>}
        {node.source_refs?.length ? <SourceRefChips refs={node.source_refs} /> : null}
        {around(node)}
        {canAsk ? <div>{ask(node.id)}</div> : null}
      </div>
    </article>
  }

  if (kind === 'flow-edge' && edge) return <article className="flow-slide flow-slide-edge">
    <h3 className="flow-edge-title"><span>{name(edge.source)}</span><MoveRight aria-hidden="true" /><span>{name(edge.target)}</span>
      <span className="visually-hidden">{t('flow.view.edgeAria', { from: name(edge.source), to: name(edge.target) })}</span>
    </h3>
    {edge.label?.trim() ? <p className="flow-edge-name">{edge.label.trim()}</p> : null}
    {edge.description ? <RichText text={edge.description} /> : <p className="flow-hint">{t('flow.view.noDescription')}</p>}
    {edge.source_refs?.length ? <SourceRefChips refs={edge.source_refs} /> : null}
    {canAsk ? <div>{ask(edge.id, true)}</div> : null}
  </article>

  return <p className="flow-hint">{t('flow.view.emptyBody')}</p>
}
