import { useEffect, useId, useRef, useState } from 'react'
import { Crop, Eraser, ImageOff, MoveRight, Plus, ScanSearch, Sparkles, SquareDashed, Tag, WandSparkles, X } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { post } from '../../../lib/api.js'
import { normalizedBox, normalizedMaskPath } from '../../../lib/sam.js'
import { newId } from '../../lab/specUtils.js'
import { Alert, Badge, Button, Checkbox, ConfirmDialog, EmptyState, ErrorMessage, SelectField, Spinner, TextArea, TextField } from '../../../components/ui/index.js'
import { useBlockEnv } from '../BlockEnv.jsx'
import { BlockMetaFields, EditorItem, PicturePicker, SourceRefsEditor } from '../steps/LessonEditorKit.jsx'
import { DrawLayer } from '../steps/MediaStage.jsx'
import { LIMITS, moveItem, normBox, pictureValue, uniqueId } from '../steps/lessonKit.js'
import { useLatest, useOptionalLab } from '../steps/lessonHooks.js'
import { DiagramCanvas } from './DiagramCanvas.jsx'
import { applyProposal, nextPartLabel, proposalFromAi, removeHotspot } from './diagramLogic.js'
import { partName, usePicture } from './usePicture.js'
import '../steps/lesson.css'
import './diagram.css'

const samePicture = (a, b) => pictureValue(a) === pictureValue(b) && (a?.page ?? null) === (b?.page ?? null)

/** Teacher editor for a diagram: picture, AI part detection (Muse + SAM 3.1), parts, relations. */
export default function DiagramEditor({ block, onChange }) {
  const { t } = useT()
  const env = useBlockEnv()
  const lab = useOptionalLab()
  const blockRef = useLatest(block)
  const hotspots = block.hotspots || []
  const relations = block.relations || []
  const picture = usePicture(block.image)
  const domId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const partsTitleId = useId()
  const relTitleId = useId()
  const [openId, setOpenId] = useState(null)
  const [openRel, setOpenRel] = useState(null)
  const [drawMode, setDrawMode] = useState(null) // null | 'new' | 'box'
  const [ai, setAi] = useState({ loading: false, error: null, notice: null })
  const [proposal, setProposal] = useState(null)
  const [pendingPicture, setPendingPicture] = useState(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [pendingRemove, setPendingRemove] = useState(null)
  const [notice, setNotice] = useState('')
  const labelInputs = useRef({})
  const focusPart = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    if (focusPart.current && labelInputs.current[focusPart.current]) {
      labelInputs.current[focusPart.current].focus()
      focusPart.current = null
    }
  })

  const set = (patch) => onChange({ ...blockRef.current, ...patch })
  const updatePart = (id, patch) => set({ hotspots: (blockRef.current.hotspots || []).map((h) => (h.id === id ? { ...h, ...patch } : h)) })
  const updateRel = (id, patch) => set({ relations: (blockRef.current.relations || []).map((r) => (r.id === id ? { ...r, ...patch } : r)) })
  const taken = () => [...hotspots.map((h) => h.id), ...relations.map((r) => r.id)]
  const openPart = (id) => {
    setOpenId(id)
    requestAnimationFrame(() => document.getElementById(`${domId}-part-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }

  const choosePicture = (pic) => {
    if (samePicture(pic, block.image)) return
    if (hotspots.length) setPendingPicture(pic || { source_id: null, page: null, asset_id: null })
    else applyPicture(pic)
  }
  const applyPicture = (pic) => {
    setProposal(null)
    setDrawMode(null)
    set({ image: pic ? { source_id: pic.source_id ?? null, page: pic.page ?? null, asset_id: pic.asset_id ?? null } : { source_id: null, page: null, asset_id: null } })
  }

  const addPart = (bbox) => {
    if (hotspots.length >= LIMITS.hotspots) return
    const id = uniqueId('h', taken())
    const part = { id, label: nextPartLabel(hotspots, t('diagram.edit.partPrefix')), description_simple: '', description_detailed: '', bbox: normBox(bbox), mask_path: null, source_refs: [] }
    set({ hotspots: [...hotspots, part] })
    setDrawMode(null)
    setOpenId(id)
    focusPart.current = id
    setNotice(t('diagram.edit.partAdded', { name: part.label }))
  }

  const runAi = async () => {
    const image = block.image
    if (!image?.source_id || !env.aiPath('diagram')) return
    setAi({ loading: true, error: null, notice: null })
    setProposal(null)
    setDrawMode(null)
    try {
      await lab?.flush?.()
      const res = await post(env.aiPath('diagram'), { source_id: image.source_id, page: image.page ?? null, refine_with_sam: true })
      if (!samePicture(blockRef.current.image, image)) {
        setAi({ loading: false, error: null, notice: t('diagram.edit.aiStale') })
        return
      }
      const parts = proposalFromAi(res, normalizedMaskPath, normalizedBox)
      if (!parts.length) {
        setAi({ loading: false, error: null, notice: res?.notes?.trim() || t('diagram.edit.aiNothing') })
        return
      }
      setProposal({ image, hotspots: parts, relations: res.relations || [], notes: res.notes || '', include: new Set(parts.map((p) => p.id)) })
      setAi({ loading: false, error: null, notice: null })
    } catch (err) {
      setAi({ loading: false, error: err, notice: null })
    }
  }

  const applyAi = (replace) => {
    if (!proposal) return
    const current = blockRef.current
    const result = applyProposal(current, proposal, { replace, include: proposal.include }, (prefix) => newId(prefix))
    onChange({ ...current, hotspots: result.hotspots, relations: result.relations, ai_generated: true, confirmed: false })
    setProposal(null)
    setConfirmReplace(false)
    setNotice(result.truncated ? t('diagram.edit.aiAppliedLimit', { count: result.added, max: LIMITS.hotspots }) : t('diagram.edit.aiApplied', { count: result.added }))
  }

  const openPartObj = hotspots.find((h) => h.id === openId) || null
  const aiPossible = Boolean(block.image?.source_id && !block.image?.asset_id && picture.source && ['image', 'pdf'].includes(picture.source.kind))
  const partOptions = hotspots.map((h, i) => ({ value: h.id, label: `${i + 1}. ${partName(h, i, t)}` }))
  const nameOf = (id) => {
    const i = hotspots.findIndex((h) => h.id === id)
    return i >= 0 ? partName(hotspots[i], i, t) : t('diagram.edit.missingPart')
  }

  let drawLayer = null
  if (drawMode === 'new') {
    drawLayer = <DrawLayer value={null} onChange={(bbox) => bbox && addPart(bbox)} clearable={false} label={t('diagram.edit.drawNewLabel')} />
  } else if (drawMode === 'box' && openPartObj) {
    drawLayer = (
      <DrawLayer
        value={openPartObj.bbox}
        clearable={false}
        label={t('diagram.edit.drawBoxLabel', { name: partName(openPartObj, hotspots.indexOf(openPartObj), t) })}
        onChange={(bbox) => bbox && updatePart(openPartObj.id, { bbox, mask_path: null })}
      />
    )
  }

  return (
    <div className="lk-editor">
      <BlockMetaFields block={block} onChange={onChange} />

      <section className="lk-section">
        <h3 className="lk-section-title">
          <ScanSearch aria-hidden="true" />
          {t('diagram.edit.pictureTitle')}
        </h3>
        <PicturePicker value={block.image} onChange={choosePicture} label={t('diagram.edit.picture')} hint={t('diagram.edit.pictureHint')} />
        {!env.sources?.length && !env.assets?.length ? <p className="lk-hint">{t('steps.kit.noSources')}</p> : null}
      </section>

      {picture.src ? (
        <section className="lk-section">
          <div className="dg-ai">
            <div className="dg-ai-text">
              <p className="lk-subcard-title">
                <WandSparkles aria-hidden="true" />
                {t('diagram.edit.aiTitle')}
              </p>
              <p className="lk-hint">{t('diagram.edit.aiHint')}</p>
            </div>
            <Button variant="paper" icon={Sparkles} loading={ai.loading} disabled={!aiPossible || !env.aiAvailable || Boolean(drawMode)} onClick={runAi}>
              {hotspots.length ? t('diagram.edit.aiRunMore') : t('diagram.edit.aiRun')}
            </Button>
          </div>
          {!env.aiAvailable ? <p className="lk-hint">{t('common.ai.notConfigured')}</p> : null}
          {env.aiAvailable && !aiPossible ? <p className="lk-hint">{t('diagram.edit.aiNeedsSource')}</p> : null}
          {ai.loading ? <Spinner label={t('diagram.edit.aiWorking')} /> : null}
          <ErrorMessage error={ai.error} onRetry={runAi} title={t('diagram.edit.aiFailed')} />
          {ai.notice ? <Alert tone="info">{ai.notice}</Alert> : null}
          {proposal ? (
            <ProposalPanel
              proposal={proposal}
              hasParts={hotspots.length > 0}
              onToggle={(id) =>
                setProposal((p) => {
                  const include = new Set(p.include)
                  if (include.has(id)) include.delete(id)
                  else include.add(id)
                  return { ...p, include }
                })
              }
              onMerge={() => applyAi(false)}
              onReplace={() => (hotspots.length ? setConfirmReplace(true) : applyAi(true))}
              onDiscard={() => setProposal(null)}
            />
          ) : null}

          <div className="dg-edit-toolbar" ref={canvasRef}>
            {drawMode ? (
              <>
                <span className="dg-draw-hint" role="status">
                  <Crop aria-hidden="true" size={16} />
                  {drawMode === 'new' ? t('diagram.edit.drawNewHint') : t('diagram.edit.drawBoxHint')}
                </span>
                <Button size="sm" icon={X} onClick={() => setDrawMode(null)}>
                  {drawMode === 'new' ? t('common.actions.cancel') : t('common.actions.done')}
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" icon={SquareDashed} onClick={() => setDrawMode('new')} disabled={hotspots.length >= LIMITS.hotspots || Boolean(proposal)}>
                  {t('diagram.edit.drawNew')}
                </Button>
                <span className="small muted">{t('diagram.edit.canvasHint')}</span>
              </>
            )}
          </div>
          <DiagramCanvas
            src={picture.src}
            alt={t('diagram.edit.canvasAlt')}
            size={picture.size}
            hotspots={hotspots}
            relations={relations}
            proposals={proposal ? proposal.hotspots.filter((h) => proposal.include.has(h.id)) : []}
            selectedId={openId}
            onSelectPart={drawMode ? undefined : openPart}
            mode="edit"
            maxBlock="65vh"
          >
            {drawLayer}
          </DiagramCanvas>
          <p className="visually-hidden" role="status">
            {notice}
          </p>
          {notice ? (
            <p className="lk-hint" aria-hidden="true">
              {notice}
            </p>
          ) : null}
        </section>
      ) : (
        <EmptyState icon={ImageOff} title={t('diagram.edit.noPictureTitle')}>
          {t('diagram.edit.noPictureBody')}
        </EmptyState>
      )}

      <section className="lk-section" aria-labelledby={partsTitleId}>
        <h3 id={partsTitleId} className="lk-section-title">
          <Tag aria-hidden="true" />
          {t('diagram.edit.partsTitle', { count: hotspots.length })}
        </h3>
        {hotspots.length ? (
          <ol className="list-reset stack-sm">
            {hotspots.map((h, i) => (
              <EditorItem
                key={h.id}
                id={`${domId}-part-${h.id}`}
                index={i}
                count={hotspots.length}
                title={h.label?.trim()}
                emptyTitle={t('diagram.view.partN', { n: i + 1 })}
                open={openId === h.id}
                onToggle={() => {
                  setOpenId(openId === h.id ? null : h.id)
                  if (drawMode === 'box') setDrawMode(null)
                }}
                onMove={(delta) => set({ hotspots: moveItem(hotspots, i, i + delta) })}
                onRemove={() => setPendingRemove(h)}
                flags={
                  h.mask_path ? (
                    <Badge tone="paper" icon={Sparkles}>
                      {t('diagram.edit.maskBadge')}
                    </Badge>
                  ) : null
                }
              >
                <TextField
                  ref={(el) => {
                    labelInputs.current[h.id] = el
                  }}
                  label={t('diagram.edit.partLabel')}
                  value={h.label || ''}
                  maxLength={LIMITS.short}
                  onChange={(e) => updatePart(h.id, { label: e.target.value })}
                />
                <TextArea
                  label={t('diagram.edit.simple')}
                  hint={t('diagram.edit.simpleHint')}
                  rows={2}
                  maxLength={LIMITS.medium}
                  value={h.description_simple || ''}
                  onChange={(e) => updatePart(h.id, { description_simple: e.target.value })}
                />
                <TextArea
                  label={t('diagram.edit.detailed')}
                  hint={t('diagram.edit.detailedHint')}
                  rows={4}
                  maxLength={LIMITS.long}
                  value={h.description_detailed || ''}
                  onChange={(e) => updatePart(h.id, { description_detailed: e.target.value })}
                />
                <div className="lk-subcard">
                  <p className="lk-subcard-title">
                    <Crop aria-hidden="true" />
                    {t('diagram.edit.shapeTitle')}
                  </p>
                  <p className="lk-hint">{h.mask_path ? t('diagram.edit.shapeMask') : t('diagram.edit.shapeBox')}</p>
                  <div className="row">
                    <Button
                      size="sm"
                      icon={Crop}
                      aria-pressed={drawMode === 'box' && openId === h.id}
                      disabled={!picture.src}
                      onClick={() => {
                        setOpenId(h.id)
                        setDrawMode(drawMode === 'box' && openId === h.id ? null : 'box')
                        requestAnimationFrame(() => canvasRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
                      }}
                    >
                      {drawMode === 'box' && openId === h.id ? t('diagram.edit.editBoxDone') : t('diagram.edit.editBox')}
                    </Button>
                    {h.mask_path ? (
                      <Button size="sm" variant="ghost" icon={Eraser} onClick={() => updatePart(h.id, { mask_path: null })}>
                        {t('diagram.edit.dropMask')}
                      </Button>
                    ) : null}
                  </div>
                </div>
                <SourceRefsEditor refs={h.source_refs || []} max={LIMITS.stepRefs} onChange={(source_refs) => updatePart(h.id, { source_refs })} />
              </EditorItem>
            ))}
          </ol>
        ) : (
          <p className="lk-hint">{picture.src ? t('diagram.edit.noParts') : t('diagram.edit.noPartsNoPicture')}</p>
        )}
        {hotspots.length >= LIMITS.hotspots ? <p className="lk-limit">{t('diagram.edit.partsLimit', { max: LIMITS.hotspots })}</p> : null}
      </section>

      <section className="lk-section" aria-labelledby={relTitleId}>
        <h3 id={relTitleId} className="lk-section-title">
          <MoveRight aria-hidden="true" />
          {t('diagram.edit.relationsTitle', { count: relations.length })}
        </h3>
        <p className="lk-hint">{t('diagram.edit.relationsHint')}</p>
        {relations.length ? (
          <ol className="list-reset stack-sm">
            {relations.map((r, i) => {
              const self = r.source === r.target
              const title = `${nameOf(r.source)} → ${nameOf(r.target)}${r.label?.trim() ? ` (${r.label.trim()})` : ''}`
              return (
                <EditorItem
                  key={r.id}
                  index={i}
                  count={relations.length}
                  title={title}
                  emptyTitle={title}
                  open={openRel === r.id}
                  onToggle={() => setOpenRel(openRel === r.id ? null : r.id)}
                  onMove={(delta) => set({ relations: moveItem(relations, i, i + delta) })}
                  onRemove={() => set({ relations: relations.filter((x) => x.id !== r.id) })}
                  flags={self ? <span className="badge badge-warning">{t('diagram.edit.needsFix')}</span> : null}
                >
                  <div className="lk-grid-2">
                    <SelectField
                      label={t('diagram.edit.relFrom')}
                      value={hotspots.some((h) => h.id === r.source) ? r.source : ''}
                      placeholder={t('diagram.edit.choosePart')}
                      options={partOptions}
                      onChange={(e) => updateRel(r.id, { source: e.target.value })}
                      error={self ? t('diagram.edit.selfRelation') : undefined}
                    />
                    <SelectField
                      label={t('diagram.edit.relTo')}
                      value={hotspots.some((h) => h.id === r.target) ? r.target : ''}
                      placeholder={t('diagram.edit.choosePart')}
                      options={partOptions}
                      onChange={(e) => updateRel(r.id, { target: e.target.value })}
                      error={self ? t('diagram.edit.selfRelation') : undefined}
                    />
                  </div>
                  <TextField label={t('diagram.edit.relLabel')} hint={t('diagram.edit.relLabelHint')} value={r.label || ''} maxLength={LIMITS.short} onChange={(e) => updateRel(r.id, { label: e.target.value })} />
                  <TextArea label={t('diagram.edit.relDescription')} rows={3} maxLength={LIMITS.medium} value={r.description || ''} onChange={(e) => updateRel(r.id, { description: e.target.value })} />
                </EditorItem>
              )
            })}
          </ol>
        ) : null}
        <Button
          icon={Plus}
          className="lk-add"
          disabled={hotspots.length < 2 || relations.length >= LIMITS.relations}
          onClick={() => {
            const id = uniqueId('r', taken())
            set({ relations: [...relations, { id, source: hotspots[0].id, target: hotspots[1].id, label: '', description: '' }] })
            setOpenRel(id)
          }}
        >
          {t('diagram.edit.addRelation')}
        </Button>
        {hotspots.length < 2 ? <p className="lk-hint">{t('diagram.edit.relationsNeedTwo')}</p> : null}
      </section>

      <ConfirmDialog
        open={Boolean(pendingPicture)}
        onClose={() => setPendingPicture(null)}
        onConfirm={() => {
          applyPicture(pendingPicture)
          setPendingPicture(null)
        }}
        title={t('diagram.edit.changePictureTitle')}
        confirmLabel={t('diagram.edit.changePictureConfirm')}
      >
        <p style={{ margin: 0 }}>{t('diagram.edit.changePictureBody', { count: hotspots.length })}</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmReplace}
        onClose={() => setConfirmReplace(false)}
        onConfirm={() => applyAi(true)}
        tone="danger"
        title={t('diagram.edit.replaceTitle')}
        confirmLabel={t('diagram.edit.replaceConfirm')}
      >
        <p style={{ margin: 0 }}>{t('diagram.edit.replaceBody', { count: hotspots.length })}</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={Boolean(pendingRemove)}
        onClose={() => setPendingRemove(null)}
        onConfirm={() => {
          const next = removeHotspot(blockRef.current, pendingRemove.id)
          onChange(next)
          if (openId === pendingRemove.id) {
            setOpenId(null)
            setDrawMode(null)
          }
          setPendingRemove(null)
        }}
        tone="danger"
        title={t('diagram.edit.removeTitle')}
        confirmLabel={t('common.actions.delete')}
      >
        <p style={{ margin: 0 }}>
          {t('diagram.edit.removeBody', {
            name: pendingRemove ? nameOf(pendingRemove.id) : '',
            count: pendingRemove ? relations.filter((r) => r.source === pendingRemove.id || r.target === pendingRemove.id).length : 0,
          })}
        </p>
      </ConfirmDialog>
    </div>
  )
}

function ProposalPanel({ proposal, hasParts, onToggle, onMerge, onReplace, onDiscard }) {
  const { t } = useT()
  const chosen = proposal.hotspots.filter((h) => proposal.include.has(h.id)).length
  const masks = proposal.hotspots.filter((h) => h.mask_path).length
  return (
    <div className="dg-proposal" role="region" aria-label={t('diagram.edit.proposalTitle')}>
      <p className="lk-subcard-title">
        <Sparkles aria-hidden="true" />
        {t('diagram.edit.proposalTitle')}
      </p>
      <p className="lk-hint">{t('diagram.edit.proposalHint', { count: proposal.hotspots.length, masks })}</p>
      {proposal.notes?.trim() ? <Alert tone="info">{proposal.notes.trim()}</Alert> : null}
      <ul className="dg-proposal-list">
        {proposal.hotspots.map((h, i) => (
          <li key={h.id}>
            <Checkbox
              checked={proposal.include.has(h.id)}
              onChange={() => onToggle(h.id)}
              label={
                <span>
                  <strong>
                    {t('diagram.edit.proposalMarker', { n: i + 1 })}: {h.label || t('diagram.view.partN', { n: i + 1 })}
                  </strong>
                  {h.mask_path ? <span className="muted small"> ({t('diagram.edit.maskBadge')})</span> : null}
                  {h.description_simple ? <span className="small muted" style={{ display: 'block' }}>{h.description_simple}</span> : null}
                </span>
              }
            />
          </li>
        ))}
      </ul>
      <div className="row">
        <Button variant="primary" onClick={onMerge} disabled={!chosen}>
          {hasParts ? t('diagram.edit.proposalMerge', { count: chosen }) : t('diagram.edit.proposalUse', { count: chosen })}
        </Button>
        {hasParts ? (
          <Button onClick={onReplace} disabled={!chosen}>
            {t('diagram.edit.proposalReplace')}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onDiscard}>
          {t('diagram.edit.proposalDiscard')}
        </Button>
      </div>
      <p className="lk-hint">{t('diagram.edit.proposalReview')}</p>
    </div>
  )
}
