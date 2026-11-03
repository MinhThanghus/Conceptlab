import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, CircleCheck, CircleX, EyeOff, ImageOff, LogOut, MessageCircleQuestion, MoveRight, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { Alert, Button, EmptyState, IconButton, LoadingBlock, RichText, Segmented, Switch } from '../../../components/ui/index.js'
import { BlockFrame } from '../BlockRenderer.jsx'
import { useBlockEnv } from '../BlockEnv.jsx'
import { SourceRefChips } from '../../sources/SourceRefChips.jsx'
import { useCanAsk, useReportState } from '../steps/lessonHooks.js'
import { DiagramCanvas } from './DiagramCanvas.jsx'
import { canSelfTest, labelChoices, selfTestOrder } from './diagramLogic.js'
import { partName, usePicture } from './usePicture.js'
import '../steps/lesson.css'
import './diagram.css'

const DiagramEditor = lazy(() => import('./DiagramEditor.jsx'))
const ZOOMS = [1, 1.5, 2, 3]
// Beside the picture a slide's side column holds about five parts with their simple descriptions
// (some 300 characters) at 1366x768; more parts become a grid of names, the chosen one in a well.
const ROWS_FIT = { parts: 5, chars: 300 }

/** Interactive labelled picture (spec §5.2): click parts, simple/detailed, hide labels to self-test. */
export default function DiagramBlock({ block, mode, onChange }) {
  if (mode === 'edit') {
    return (
      <Suspense fallback={<LoadingBlock lines={4} height="14rem" />}>
        <DiagramEditor block={block} onChange={onChange} />
      </Suspense>
    )
  }
  return <DiagramView block={block} />
}

function description(h, level) {
  const simple = h?.description_simple?.trim()
  const detailed = h?.description_detailed?.trim()
  return level === 'detailed' ? detailed || simple : simple || detailed
}

function DiagramView({ block }) {
  const { t } = useT()
  const env = useBlockEnv()
  const hotspots = useMemo(() => (block.hotspots || []).filter((h) => Array.isArray(h.bbox)), [block.hotspots])
  const relations = block.relations || []
  const picture = usePicture(block.image)
  const slides = env.presentation === 'slides'
  // On a slide the first part is chosen on arrival, so its explanation is on screen, and the
  // chosen part reads at the detailed level (the list beside it gives every part's simple one).
  const arrival = slides && hotspots[0] ? { type: 'part', id: hotspots[0].id } : null
  const [selected, setSelected] = useState(arrival)
  const [hover, setHover] = useState(null)
  const hasDetailed = hotspots.some((h) => h.description_detailed?.trim())
  // many parts: a grid of names and one well that gives the chosen part's simple and detailed text
  const simpleChars = hotspots.reduce((sum, h) => sum + (h.description_simple?.trim() || h.description_detailed?.trim() || '').length, 0)
  const compact = slides && (hotspots.length > ROWS_FIT.parts || simpleChars > ROWS_FIT.chars)
  const startLevel = env.level === 'detailed' || (slides && hasDetailed) ? 'detailed' : 'simple'
  const [level, setLevel] = useState(startLevel)
  // the lesson-wide explanation level switches the diagram too (its own toggle can still override it)
  useEffect(() => {
    setLevel(startLevel)
  }, [startLevel])
  const [zoom, setZoom] = useState(1)
  const [testing, setTesting] = useState(false)
  const [questionId, setQuestionId] = useState(null)
  const [testState, setTestState] = useState(null)
  // words printed in the picture itself would give the answers away: blur them while testing
  const [masked, setMasked] = useState(true)
  const testable = canSelfTest(hotspots)

  const selectedPart = selected?.type === 'part' ? hotspots.find((h) => h.id === selected.id) : null
  const selectedRelation = selected?.type === 'relation' ? relations.find((r) => r.id === selected.id) : null
  useReportState(block.id, {
    mode: testing ? 'self_test' : 'explore',
    level,
    selected_part: !testing && selectedPart ? selectedPart.label : null,
    selected_relation: !testing && selectedRelation ? selectedRelation.label || selectedRelation.id : null,
    self_test: testing ? testState : null,
  })

  if (!picture.src) {
    return (
      <BlockFrame block={block}>
        <EmptyState icon={ImageOff} title={t('diagram.view.noPictureTitle')}>
          {t('diagram.view.noPictureBody')}
        </EmptyState>
      </BlockFrame>
    )
  }

  const zoomIndex = ZOOMS.indexOf(zoom)
  const numberOf = (id) => hotspots.findIndex((h) => h.id === id) + 1
  const tools = (
    <>
      {!testing && !compact ? (
        <Segmented
          label={t('diagram.view.levelLabel')}
          value={level}
          onChange={setLevel}
          options={[
            { value: 'simple', label: t('common.levels.simple') },
            { value: 'detailed', label: t('common.levels.detailed') },
          ]}
        />
      ) : null}
      {testable ? (
        <Button
          size="sm"
          className="dg-test-toggle"
          icon={testing ? LogOut : EyeOff}
          aria-pressed={testing}
          onClick={() => {
            setTesting((v) => !v)
            setSelected(testing ? arrival : null)
            setQuestionId(null)
          }}
        >
          {testing ? t('diagram.view.exitTest') : t('diagram.view.startTest')}
        </Button>
      ) : null}
      {testing ? <Switch className="dg-mask-switch" label={t('diagram.view.maskPicture')} checked={masked} onChange={(e) => setMasked(e.target.checked)} /> : null}
    </>
  )
  const zoomTools = (
    <span className="dg-zoom" role="group" aria-label={t('diagram.view.zoomLabel')}>
      <IconButton icon={ZoomOut} size="sm" bordered label={t('diagram.view.zoomOut')} disabled={zoomIndex <= 0} onClick={() => setZoom(ZOOMS[Math.max(0, zoomIndex - 1)])} />
      <span className="dg-zoom-value" aria-live="polite">
        {Math.round(zoom * 100)}%
      </span>
      <IconButton icon={ZoomIn} size="sm" bordered label={t('diagram.view.zoomIn')} disabled={zoomIndex >= ZOOMS.length - 1} onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, zoomIndex + 1)])} />
    </span>
  )
  // On a lesson slide the picture fills a well on the left at the body's full height, its zoom on
  // the well's corner; the level, the self-test and the parts sit beside it (diagram.css .dg-slide).
  // A landscape picture with a short list of parts (names only) takes 8 of 12 columns instead of 7;
  // parts that carry their descriptions keep the side its 5, and a grid of names with its well takes half.
  const described = hotspots.some((h) => h.description_simple?.trim() || h.description_detailed?.trim())
  const wide = slides && picture.size?.width > 0 && picture.size.width / picture.size.height >= 1.2 && hotspots.length <= 8 && !described
  return (
    <BlockFrame block={block}>
      <div className={slides ? 'dg dg-slide' : 'dg'} data-shape={wide ? 'wide' : compact ? 'compact' : undefined}>
        {!slides ? (
          <div className="dg-toolbar">
            {tools}
            {zoomTools}
          </div>
        ) : null}

        <div className="dg-layout">
          <div className={['dg-stage-col', testing && masked ? 'is-masked' : ''].filter(Boolean).join(' ')}>
            <DiagramCanvas
              src={picture.src}
              alt={t('diagram.view.pictureAlt', { title: block.title || t('blocks.types.diagram'), count: hotspots.length })}
              size={picture.size}
              hotspots={hotspots}
              relations={relations}
              selectedId={!testing ? selectedPart?.id : null}
              highlightId={!testing ? hover : null}
              questionId={testing ? questionId : null}
              selectedRelationId={!testing ? selectedRelation?.id : null}
              onSelectPart={testing ? undefined : (id) => setSelected({ type: 'part', id })}
              onSelectRelation={testing ? undefined : (id) => setSelected({ type: 'relation', id })}
              onHover={testing ? undefined : setHover}
              mode={testing ? 'test' : 'explore'}
              zoom={zoom}
              // a slide's picture takes the well's height (the well's scroller is a size container)
              maxBlock={slides ? '100cqh' : undefined}
              numberOf={numberOf}
            />
            {slides ? zoomTools : null}
            {zoom > 1 ? <p className="lk-hint">{t('diagram.view.zoomHint')}</p> : null}
          </div>
          <div className="dg-side">
            {slides ? <div className="dg-toolbar">
              {tools}
              {compact && !testing ? <RelationsList hotspots={hotspots} relations={relations} selectedId={selectedRelation?.id} onSelect={(id) => setSelected({ type: 'relation', id })} folded="always" /> : null}
            </div> : null}
            {testing ? (
              <SelfTest
                hotspots={hotspots}
                onQuestion={setQuestionId}
                onState={setTestState}
                onExit={() => {
                  setTesting(false)
                  setSelected(arrival)
                  setQuestionId(null)
                }}
              />
            ) : (
              <>
                {/* without the block's description in the byline, one quiet line says what to do */}
                {slides && !block.description?.trim() ? <p className="lk-hint dg-hint">{hotspots.length ? t('diagram.view.hint') : t('diagram.view.noParts')}</p> : null}
                {compact ? <>
                  {/* many parts: a grid of names, the chosen part or relation explained in one well under it */}
                  <PartsList hotspots={hotspots} selectedId={selectedPart?.id} onSelect={(id) => setSelected({ type: 'part', id })} onHover={setHover} grid />
                  <PartDetail block={block} hotspots={hotspots} relations={relations} part={selectedPart} relation={selectedRelation} level={level} onSelect={setSelected} slides well />
                </> : <>
                  {/* on a slide a chosen part opens in place, in its row of the list */}
                  <PartDetail
                    block={block}
                    hotspots={hotspots}
                    relations={relations}
                    part={slides ? null : selectedPart}
                    relation={selectedRelation}
                    level={level}
                    onSelect={setSelected}
                    slides={slides}
                  />
                  <PartsList hotspots={hotspots} selectedId={selectedPart?.id} onSelect={(id) => setSelected({ type: 'part', id })} onHover={setHover} described={slides}
                    detail={slides && selectedPart ? <PartDetail block={block} hotspots={hotspots} relations={relations} part={selectedPart} level={level} onSelect={setSelected} slides inline /> : null} />
                </>}
                {!compact ? <RelationsList hotspots={hotspots} relations={relations} selectedId={selectedRelation?.id} onSelect={(id) => setSelected({ type: 'relation', id })} folded={slides} /> : null}
              </>
            )}
          </div>
        </div>
      </div>
    </BlockFrame>
  )
}

/** The chosen part or relation. `inline`: inside the part's row of a slide's list, which already
 *  shows its number, name and simple description, so only the detailed text and the actions.
 *  `well`: under a slide's grid of names, the part's simple and detailed descriptions together. */
function PartDetail({ block, hotspots, relations, part, relation, level, onSelect, slides = false, inline = false, well = false }) {
  const { t } = useT()
  const env = useBlockEnv()
  const canAsk = useCanAsk()
  const indexOf = (id) => hotspots.findIndex((h) => h.id === id)
  const nameOf = (id) => partName(hotspots[indexOf(id)], indexOf(id), t)

  if (part) {
    const i = indexOf(part.id)
    const simple = part.description_simple?.trim()
    const detailed = part.description_detailed?.trim()
    // the well gives the simple description, then the detailed one, whatever the level
    const text = well ? (simple ? detailed : description(part, 'detailed')) : inline ? (level === 'detailed' ? detailed : '') : description(part, level)
    // under a grid of names the deck's own Ask AI (it knows the chosen part) and the folded relations
    // stand in for the part's ask button and links, so the well keeps to its words
    const links = well ? [] : relations.filter((r) => r.source === part.id || r.target === part.id)
    return (
      <div className={inline ? 'dg-detail is-inline' : well ? 'lk-panel dg-detail is-well' : 'lk-panel dg-detail'} aria-live="polite">
        {!inline ? (
          <div className="dg-detail-head">
            <span className="dg-part-num" aria-hidden="true">
              {i + 1}
            </span>
            <h3>{partName(part, i, t)}</h3>
          </div>
        ) : null}
        {well && simple ? <RichText text={simple} className="dg-well-simple" /> : null}
        {text ? <RichText text={text} className="dg-detail-text" /> : !inline && !(well && simple) ? <p className="lk-hint">{t('diagram.view.noDescription')}</p> : null}
        {!inline && !well && level === 'detailed' && !detailed && simple ? <p className="lk-hint">{t('diagram.view.onlySimple')}</p> : null}
        {part.source_refs?.length ? <SourceRefChips refs={part.source_refs} /> : null}
        {links.length ? (
          <div className="dg-links">
            <span className="dg-links-label">{t('diagram.view.linked')}</span>
            {links.map((r) => (
              <button key={r.id} type="button" className="chip" onClick={() => onSelect({ type: 'relation', id: r.id })}>
                {r.source === part.id ? <ArrowRight size={16} aria-hidden="true" /> : <ArrowLeft size={16} aria-hidden="true" />}
                {nameOf(r.source === part.id ? r.target : r.source)}
                {r.label?.trim() ? ` (${r.label.trim()})` : ''}
              </button>
            ))}
          </div>
        ) : null}
        {canAsk && !well ? (
          <div>
            <Button size="sm" icon={MessageCircleQuestion} onClick={() => env.ask({ block_id: block.id, item_id: part.id, selection: part.label })}>
              {t('diagram.view.askPart')}
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  if (relation) {
    return (
      <div className="lk-panel dg-detail" aria-live="polite">
        <h3 className="dg-relation-title">
          <span>{nameOf(relation.source)}</span>
          <MoveRight aria-hidden="true" />
          <span>{nameOf(relation.target)}</span>
        </h3>
        <p className="dg-relation-name">{relation.label?.trim() ? `${t('diagram.view.relationKicker')}: ${relation.label.trim()}` : t('diagram.view.relationKicker')}</p>
        {relation.description?.trim() ? <RichText text={relation.description} className="dg-detail-text" /> : <p className="lk-hint">{t('diagram.view.noDescription')}</p>}
        <div className="dg-links">
          <button type="button" className="chip" onClick={() => onSelect({ type: 'part', id: relation.source })}>
            {nameOf(relation.source)}
          </button>
          <button type="button" className="chip" onClick={() => onSelect({ type: 'part', id: relation.target })}>
            {nameOf(relation.target)}
          </button>
        </div>
        {canAsk ? (
          <div>
            <Button size="sm" icon={MessageCircleQuestion} onClick={() => env.ask({ block_id: block.id, item_id: relation.id })}>
              {t('diagram.view.askRelation')}
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  // On a slide the byline under the heading (or the side's own hint line) already says what to do.
  if (slides) return null
  return (
    <div className="lk-panel dg-detail">
      <p className="lk-hint">{hotspots.length ? t('diagram.view.hint') : t('diagram.view.noParts')}</p>
    </div>
  )
}

/** The parts as buttons. `described` (slides): a table of rows, each name beside its simple
 *  description, the chosen part's `detail` opening under its row. */
function PartsList({ hotspots, selectedId, onSelect, onHover, described = false, grid = false, detail = null }) {
  const { t } = useT()
  // a part chosen on the picture opens in its row: bring the row into view in the side column
  const openRow = useRef(null)
  const shown = useRef(selectedId)
  useEffect(() => {
    if (!described || shown.current === selectedId) return
    shown.current = selectedId
    openRow.current?.scrollIntoView?.({ block: 'nearest' })
  }, [described, selectedId])
  if (!hotspots.length) return null
  // the grid keeps to three rows beside the well: three names a row, four from ten parts on
  const columns = grid ? { '--dg-cols': hotspots.length > 9 ? 4 : 3 } : undefined
  return (
    <div className="dg-list">
      {/* the numbered names under the tools need no visible title; assistive technology keeps it */}
      <h3 className={grid ? 'visually-hidden' : 'dg-list-title'}>{t('diagram.view.partsTitle', { count: hotspots.length })}</h3>
      <ol className={grid ? 'dg-parts is-grid' : described ? 'dg-parts is-described' : 'dg-parts'} style={columns}>
        {hotspots.map((h, i) => (
          <li key={h.id} className={described && selectedId === h.id ? 'is-selected' : undefined} ref={described && selectedId === h.id ? openRow : undefined}>
            <button
              type="button"
              className={['dg-part', selectedId === h.id ? 'is-selected' : ''].join(' ')}
              aria-pressed={selectedId === h.id}
              onClick={() => onSelect(h.id)}
              onFocus={() => onHover(h.id)}
              onBlur={() => onHover(null)}
              onPointerEnter={() => onHover(h.id)}
              onPointerLeave={() => onHover(null)}
            >
              <span className="dg-part-num" aria-hidden="true">
                {i + 1}
              </span>
              <span className="dg-part-label">{partName(h, i, t)}</span>
            </button>
            {described && (h.description_simple?.trim() || h.description_detailed?.trim()) ? <RichText text={h.description_simple?.trim() || h.description_detailed} className="dg-part-desc" /> : null}
            {described && selectedId === h.id && detail ? <div className="dg-part-more">{detail}</div> : null}
          </li>
        ))}
      </ol>
    </div>
  )
}

function RelationsList({ hotspots, relations, selectedId, onSelect, folded = false }) {
  const { t } = useT()
  const ids = new Set(hotspots.map((h) => h.id))
  const valid = relations.filter((r) => ids.has(r.source) && ids.has(r.target) && r.source !== r.target)
  if (!valid.length) return null
  const nameOf = (id) => {
    const i = hotspots.findIndex((h) => h.id === id)
    return partName(hotspots[i], i, t)
  }
  const list = (
    <ul className="dg-parts">
      {valid.map((r) => (
        <li key={r.id}>
          <button type="button" className={['dg-part', selectedId === r.id ? 'is-selected' : ''].join(' ')} aria-pressed={selectedId === r.id} onClick={() => onSelect(r.id)}>
            <span className="dg-part-label">
              {nameOf(r.source)} <MoveRight size={16} aria-hidden="true" className="dg-inline-icon" />
              <span className="visually-hidden">{t('diagram.view.to')}</span> {nameOf(r.target)}
              {r.label?.trim() ? <span className="dg-part-note"> ({r.label.trim()})</span> : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
  // On a slide more than three relations fold under their title so the parts stay in view beside the
  // picture; choosing a relation on the picture opens them. "always": beside a grid of names any number
  // folds, and stays as the learner left it, since the well under the grid explains the chosen one.
  if (folded === 'always' || (folded && valid.length > 3)) {
    return (
      <details className="dg-list dg-more" open={selectedId && folded !== 'always' ? true : undefined}>
        <summary className="dg-more-summary">{t('diagram.view.relationsTitle', { count: valid.length })}</summary>
        {list}
      </details>
    )
  }
  return (
    <div className="dg-list">
      <h3 className="dg-list-title">{t('diagram.view.relationsTitle', { count: valid.length })}</h3>
      {list}
    </div>
  )
}

function SelfTest({ hotspots, onQuestion, onState, onExit }) {
  const { t } = useT()
  const [order, setOrder] = useState(() => selfTestOrder(hotspots))
  const [pos, setPos] = useState(0)
  const [results, setResults] = useState({})
  const currentId = order[pos]
  const current = hotspots.find((h) => h.id === currentId)
  const choices = useMemo(() => (currentId ? labelChoices(hotspots, currentId) : []), [hotspots, currentId])
  const answer = currentId ? results[currentId] : null
  const score = Object.values(results).filter((r) => r.correct).length
  const done = pos >= order.length
  // An answer disables the pressed choice and Next, Finish and Try again unmount theirs, so focus moves on:
  // to Next after an answer, to the new question, or to the result
  const moved = useRef(false)
  const heading = useRef(null)
  const next = useRef(null)
  const result = useRef(null)

  useEffect(() => {
    onQuestion(done ? null : currentId || null)
  }, [currentId, done]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    onState({ question: done ? null : pos + 1, total: order.length, score, finished: done })
  }, [pos, score, done, order.length]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    ;(done ? result : answer ? next : heading).current?.focus()
  }, [pos, order, done, answer])

  const pick = (choice) => {
    moved.current = true
    setResults((r) => ({ ...r, [currentId]: { picked: choice.id, correct: choice.correct } }))
  }
  const advance = () => {
    moved.current = true
    setPos((p) => p + 1)
  }
  const restart = () => {
    moved.current = true
    setOrder(selfTestOrder(hotspots))
    setPos(0)
    setResults({})
  }

  if (done) {
    const all = score === order.length
    return (
      <div className={['lk-panel', 'dg-test', 'is-done', all ? 'is-all' : ''].filter(Boolean).join(' ')} aria-live="polite">
        <p ref={result} tabIndex={-1} className="dg-test-score">{t('diagram.test.score', { score, total: order.length })}</p>
        <p className="dg-test-msg">{all ? t('diagram.test.perfect') : score >= order.length / 2 ? t('diagram.test.good') : t('diagram.test.keepGoing')}</p>
        <div className="dg-test-actions">
          <Button variant="primary" icon={RotateCcw} onClick={restart}>
            {t('diagram.test.again')}
          </Button>
          <Button icon={LogOut} onClick={onExit}>
            {t('diagram.view.exitTest')}
          </Button>
        </div>
      </div>
    )
  }

  if (!current) return null
  return (
    <div className="lk-panel dg-test">
      <div className="dg-test-head">
        <h3 id={`dg-q-${currentId}`} ref={heading} tabIndex={-1}>{t('diagram.test.question')}</h3>
        <span className="dg-test-folio">{t('diagram.test.progress', { n: pos + 1, total: order.length })}</span>
      </div>
      <p className="lk-hint">{t('diagram.test.questionHint')}</p>
      <div className="dg-choices" role="group" aria-labelledby={`dg-q-${currentId}`}>
        {choices.map((c) => {
          const picked = answer?.picked === c.id
          const state = answer ? (c.correct ? 'is-right' : picked ? 'is-wrong' : '') : ''
          return (
            <button
              key={c.id}
              type="button"
              className={['dg-choice', state].join(' ')}
              disabled={Boolean(answer)}
              aria-pressed={picked}
              onClick={() => pick(c)}
            >
              {answer && c.correct ? <CircleCheck aria-hidden="true" /> : null}
              {answer && picked && !c.correct ? <CircleX aria-hidden="true" /> : null}
              <span>{c.label}</span>
            </button>
          )
        })}
      </div>
      <div aria-live="polite">
        {answer ? (
          answer.correct ? (
            <Alert tone="success" title={t('diagram.test.right')}>
              {current.description_simple?.trim() || t('diagram.test.rightBody', { name: current.label.trim() })}
            </Alert>
          ) : (
            <Alert tone="warning" title={t('diagram.test.wrong')}>
              {t('diagram.test.wrongBody', { name: current.label.trim() })}
              {current.description_simple?.trim() ? ` ${current.description_simple.trim()}` : ''}
            </Alert>
          )
        ) : null}
      </div>
      <div className="dg-test-foot">
        <span className="dg-test-tally">{t('diagram.test.correctSoFar', { score })}</span>
        {answer ? (
          <Button ref={next} variant="primary" onClick={advance}>
            {pos + 1 >= order.length ? t('diagram.test.finish') : t('diagram.test.next')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

