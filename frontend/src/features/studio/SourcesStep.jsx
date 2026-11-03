import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Camera, FileText, Layers, NotebookPen, Ruler, ScanText, ShieldCheck, Upload, Video } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { post } from '../../lib/api.js'
import { Alert, Button, EmptyState, Tabs, useToast } from '../../components/ui/index.js'
import { useLab } from '../lab/LabContext.jsx'
import { blankBlock } from '../lab/specUtils.js'
import { useStudio } from './LabStudioLayout.jsx'
import { NextStepCard, StepHeader } from './authoring/StepHeader.jsx'
import { upsertById, useLabSync, withoutId } from './authoring/useLabSync.js'
import { UploadPanel } from './authoring/sources/UploadPanel.jsx'
import { SourceCard } from './authoring/sources/SourceCard.jsx'
import { DataSourceForm, NoteSourceForm } from './authoring/sources/SourceForms.jsx'
import { useSourcePolling } from './authoring/sources/useSourcePolling.js'
import './authoring/authoring.css'

const TAB_PREFIX = 'au-add'

/** "Recipe" of a good lab, shown before anything is uploaded (spec §3 Bước 2, §4.1). */
function ExampleCard({ space, subject }) {
  const { t } = useT()
  const paper = space === 'paper2explorer'
  const sport = !paper && subject === 'pe'
  const items = paper
    ? [
        { icon: FileText, label: t('sources.example.paperPdf') },
        { icon: Ruler, label: t('sources.example.paperData') },
        { icon: NotebookPen, label: t('sources.example.paperQuestion') },
      ]
    : sport
      ? [
          { icon: BookOpen, label: t('sources.example.sportPage') },
          { icon: Video, label: t('sources.example.sportVideo') },
          { icon: NotebookPen, label: t('sources.example.sportNote') },
        ]
      : [
          { icon: BookOpen, label: t('sources.example.schoolPage') },
          { icon: Camera, label: t('sources.example.schoolPhoto') },
          { icon: Ruler, label: t('sources.example.schoolLength') },
        ]
  return (
    <section className="au-example" aria-labelledby="au-example-title">
      <h3 className="au-example-title" id="au-example-title">
        {paper ? t('sources.example.paperTitle') : t('sources.example.schoolTitle')}
      </h3>
      <ol className="au-recipe list-reset">
        {items.map(({ icon: Icon, label }, i) => (
          <li key={label} className="au-recipe-step">
            {i > 0 ? (
              <span className="au-recipe-plus" aria-hidden="true">
                +
              </span>
            ) : null}
            <span className="au-recipe-item">
              <Icon aria-hidden="true" />
              {label}
            </span>
          </li>
        ))}
      </ol>
      <p className="au-example-body">{paper ? t('sources.example.paperBody') : sport ? t('sources.example.sportBody') : t('sources.example.schoolBody')}</p>
    </section>
  )
}

/** The board block (handwriting clean-up) already made from this source, if any. */
function boardForSource(blocks, sourceId) {
  return (Array.isArray(blocks) ? blocks : []).find((b) => b?.type === 'board' && b.image?.source_id === sourceId) || null
}

/** Step 1: add the material of the lab (PDFs, photos, videos, measured values, notes). */
export default function SourcesStep() {
  const { t } = useT()
  const toast = useToast()
  const navigate = useNavigate()
  const { lab, updateFields, addBlock } = useLab()
  const { openSource } = useStudio()
  const syncLab = useLabSync()
  const [tab, setTab] = useState('files')
  const [formKeys, setFormKeys] = useState({ data: 0, note: 0 })
  const [queued, setQueued] = useState(0)
  const sources = lab.sources || []
  const paper = lab.space === 'paper2explorer'

  const upsert = useCallback((source) => syncLab((l) => ({ ...l, sources: upsertById(l.sources, source) })), [syncLab])
  const remove = useCallback((id) => syncLab((l) => ({ ...l, sources: withoutId(l.sources, id) })), [syncLab])
  useSourcePolling(sources, { onSettled: upsert, onGone: remove })

  const open = (source) => openSource?.({ source_id: source.id, page: 1, located: 'none' })
  // Handwriting shortcut: a board block for this photo or PDF page, opened in the Build step,
  // where its editor starts reading at once (router state `boardAutoRead`). One board a source.
  const cleanUpHandwriting = (source) => {
    let block = boardForSource(lab.spec?.blocks, source.id)
    if (!block) {
      block = { ...blankBlock('board', t), image: { source_id: source.id, page: source.kind === 'pdf' ? 1 : null, asset_id: null } }
      addBlock(block)
      toast.success(t('build.add.added', { type: t('blocks.types.board') }))
    }
    const unread = !(Array.isArray(block.items) && block.items.length) && !block.visual
    navigate(`/app/labs/${lab.id}/build#block-${encodeURIComponent(block.id)}`, { state: unread ? { boardAutoRead: block.id } : null })
  }
  const withPeople = sources.filter((s) => s.contains_people)
  const needConsent = withPeople.filter((s) => !s.consent_confirmed)
  const ready = sources.filter((s) => s.status === 'ready')
  const processing = sources.filter((s) => s.status === 'processing')
  const nextStep = paper ? 'paper' : 'analyze'

  const tabs = [
    { id: 'files', label: t('sources.tabs.files'), icon: Upload },
    { id: 'data', label: t('sources.tabs.data'), icon: Ruler },
    { id: 'note', label: t('sources.tabs.note'), icon: NotebookPen },
  ]

  return (
    <div className="container page au-page">
      <StepHeader step="sources" title={t('sources.step.title')} description={paper ? t('sources.step.descPaper') : t('sources.step.desc')} />

      {!sources.length ? <ExampleCard space={lab.space} subject={lab.subject} /> : null}

      {withPeople.length && lab.ai_mode === 'contributor' ? (
        <Alert tone="warning" title={t('sources.privacy.modeTitle')}>
          <p className="au-alert-text">{t('sources.privacy.modeBody', { count: withPeople.length })}</p>
          <div className="au-alert-action">
            <Button
              size="sm"
              icon={ShieldCheck}
              onClick={() => {
                updateFields({ ai_mode: 'standard' })
                toast.success(t('sources.privacy.switched'))
              }}
            >
              {t('sources.privacy.switch')}
            </Button>
          </div>
        </Alert>
      ) : null}
      {needConsent.length ? (
        <Alert tone="warning" title={t('sources.privacy.consentMissingTitle', { count: needConsent.length })}>
          {t('sources.privacy.consentMissingBody')}
        </Alert>
      ) : null}

      <section className="card au-add" aria-labelledby="au-add-title">
        <h3 id="au-add-title">{t('sources.add.title')}</h3>
        <Tabs tabs={tabs} value={tab} onChange={setTab} label={t('sources.add.tabsLabel')} idPrefix={TAB_PREFIX} />
        <div role="tabpanel" id={`${TAB_PREFIX}-panel-files`} aria-labelledby={`${TAB_PREFIX}-tab-files`} hidden={tab !== 'files'} className="au-tabpanel">
          <UploadPanel labId={lab.id} onUploaded={upsert} hasSources={sources.length > 0} onQueueChange={setQueued} />
        </div>
        <div role="tabpanel" id={`${TAB_PREFIX}-panel-data`} aria-labelledby={`${TAB_PREFIX}-tab-data`} hidden={tab !== 'data'} className="au-tabpanel">
          <p className="au-tab-intro">{t('sources.data.intro')}</p>
          <DataSourceForm
            key={`data-${formKeys.data}`}
            initialTitle={t('sources.data.defaultTitle')}
            onSubmit={async ({ title, values, note }) => {
              const created = await post(`/api/labs/${lab.id}/sources/data`, { title, values, note: note || undefined })
              await upsert(created)
              setFormKeys((k) => ({ ...k, data: k.data + 1 }))
              toast.success(t('sources.data.created'))
            }}
          />
        </div>
        <div role="tabpanel" id={`${TAB_PREFIX}-panel-note`} aria-labelledby={`${TAB_PREFIX}-tab-note`} hidden={tab !== 'note'} className="au-tabpanel">
          <p className="au-tab-intro">{t('sources.note.intro')}</p>
          <NoteSourceForm
            key={`note-${formKeys.note}`}
            initialTitle={t('sources.note.defaultTitle')}
            onSubmit={async ({ title, text }) => {
              const created = await post(`/api/labs/${lab.id}/sources/note`, { title, text })
              await upsert(created)
              setFormKeys((k) => ({ ...k, note: k.note + 1 }))
              toast.success(t('sources.note.created'))
            }}
          />
        </div>
      </section>

      <section className="card stack" aria-labelledby="au-list-title">
        <div className="au-sources-head">
          <h3 id="au-list-title">{t('sources.list.title', { count: sources.length })}</h3>
          {processing.length ? <span className="small muted">{t('sources.list.processing', { count: processing.length })}</span> : null}
        </div>
        {sources.length ? (
          <ul className="list-reset au-source-grid">
            {sources.map((source) => {
              const handwriting = ['image', 'pdf'].includes(source.kind) && source.status === 'ready'
              const board = handwriting ? boardForSource(lab.spec?.blocks, source.id) : null
              return (
                <SourceCard key={source.id} source={source} lab={lab} onOpen={open} onChanged={upsert} onDeleted={remove}>
                  {handwriting ? (
                    <Button
                      size="sm"
                      className="btn-wrap"
                      icon={ScanText}
                      onClick={() => cleanUpHandwriting(source)}
                      aria-label={t(board ? 'sources.board.openNamed' : 'sources.board.createNamed', { title: source.title })}
                    >
                      {board ? t('sources.board.open') : t('sources.board.create')}
                    </Button>
                  ) : null}
                </SourceCard>
              )
            })}
          </ul>
        ) : (
          <EmptyState icon={Layers} title={t('sources.list.emptyTitle')}>
            <p>{paper ? t('sources.list.emptyPaper') : t('sources.list.empty')}</p>
          </EmptyState>
        )}
      </section>

      <NextStepCard
        to={`/app/labs/${lab.id}/${nextStep}`}
        step={nextStep}
        description={paper ? t('sources.next.paper') : t('sources.next.analyze')}
        disabled={!ready.length}
        primary={ready.length > 0 && !queued}
        note={!ready.length ? t('sources.next.needSource') : processing.length ? t('sources.next.processing') : null}
      />
    </div>
  )
}
