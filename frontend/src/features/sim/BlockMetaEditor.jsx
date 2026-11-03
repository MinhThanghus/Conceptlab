import { useT } from '../../i18n/index.jsx'
import { TextArea, TextField } from '../../components/ui/index.js'
import { SourceRefChips } from '../sources/SourceRefChips.jsx'

/**
 * Common header of the interactive block editors: title, short description and the
 * block's citations. The review status (AI label, "checked" switch) lives in the studio's
 * block card header, so it is not repeated here.
 */
export function BlockMetaEditor({ block, onChange }) {
  const { t } = useT()
  const set = (patch) => onChange({ ...block, ...patch })
  return (
    <div className="ix-meta">
      <TextField label={t('blocks.titleLabel')} value={block.title || ''} maxLength={200} onChange={(e) => set({ title: e.target.value })} />
      <TextArea label={t('blocks.descriptionLabel')} rows={2} maxLength={2000} value={block.description || ''} onChange={(e) => set({ description: e.target.value })} />
      {block.source_refs?.length ? <SourceRefChips refs={block.source_refs} /> : <p className="small muted" style={{ margin: 0 }}>{t('sim.meta.noSources')}</p>}
    </div>
  )
}
