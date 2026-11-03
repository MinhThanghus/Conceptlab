import { ArrowLeft, BookOpen, FileText, Image, Maximize2, MessageCircle, NotebookText, Ruler, Video } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { Button, EmptyState } from '../../components/ui/index.js'
import SourceViewer from '../sources/SourceViewer.jsx'

const KIND_ICONS = { pdf: FileText, image: Image, video: Video, data: Ruler, note: NotebookText }

function sourceMeta(source, t, fmt) {
  const parts = [t(`common.sourceKinds.${source.kind}`)]
  if (source.kind === 'pdf' && source.page_count) parts.push(t('explorer.sources.pages', { count: source.page_count }))
  if (source.kind === 'video' && source.duration_ms) parts.push(fmt.duration(source.duration_ms))
  if (source.kind === 'data' && Array.isArray(source.data)) parts.push(t('explorer.sources.values', { count: source.data.length }))
  return parts.join(', ')
}

/**
 * "Nguồn" tab: the lesson's material. With `activeRef` it shows the source at that
 * page/region (SourceViewer says honestly when a location is unknown).
 */
export default function SourcesPanel({ sources, sourceById, activeRef, origin, onOpen, onBack, onBackToTutor, onEnlarge }) {
  const { t, fmt } = useT()
  if (activeRef) {
    const source = sourceById(activeRef.source_id)
    return (
      <div className="xp-sources">
        <div className="xp-sources-bar">
          <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={onBack}>
            {t('explorer.sources.back')}
          </Button>
          <div className="xp-sources-bar-end">
            {origin === 'tutor' && onBackToTutor ? (
              <Button size="sm" variant="ghost" icon={MessageCircle} onClick={onBackToTutor}>
                {t('explorer.sources.backToTutor')}
              </Button>
            ) : null}
            {source ? (
              <Button size="sm" variant="ghost" icon={Maximize2} onClick={onEnlarge}>
                {t('explorer.sources.enlarge')}
              </Button>
            ) : null}
          </div>
        </div>
        <SourceViewer source={source} sourceRef={activeRef} />
      </div>
    )
  }
  if (!sources.length) {
    return (
      <EmptyState icon={BookOpen} title={t('explorer.sources.emptyTitle')}>
        <p>{t('explorer.sources.emptyBody')}</p>
      </EmptyState>
    )
  }
  return (
    <div className="xp-sources">
      <p className="xp-sources-intro">{t('explorer.sources.intro')}</p>
      <ul className="list-reset xp-source-list">
        {sources.map((source) => {
          const Icon = KIND_ICONS[source.kind] || FileText
          return (
            <li key={source.id}>
              <button type="button" className="xp-source-item" onClick={() => onOpen({ source_id: source.id, page: source.kind === 'pdf' ? 1 : null })}>
                <Icon className="xp-source-kind" aria-hidden="true" />
                <span className="xp-source-text">
                  <span className="xp-source-title break">{source.title}</span>
                  <span className="xp-source-meta">{sourceMeta(source, t, fmt)}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
