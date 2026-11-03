import { useState } from 'react'
import { useT } from '../../../i18n/index.jsx'
import { RichText, TextArea, TextField } from '../../../components/ui/index.js'
import { BlockFrame } from '../BlockRenderer.jsx'
import { useBlockEnv } from '../BlockEnv.jsx'
import GuidedVisual from '../../visuals/GuidedVisual.jsx'
import { VISUAL_CATALOG, visualCopy, visualName } from '../../visuals/catalog.js'

/** Teacher-written note. Supports the RichText "markdown-lite" syntax and $math$. */
export default function TextBlock({ block, mode, onChange }) {
  const { t, lang } = useT()
  const [preview, setPreview] = useState(false)
  const w = visualCopy(lang)
  if (mode === 'edit') {
    return (
      <div className="stack">
        <TextField label={t('blocks.titleLabel')} value={block.title || ''} maxLength={200} onChange={(e) => onChange({ ...block, title: e.target.value })} />
        <TextArea
          label={t('text.bodyLabel')}
          hint={t('text.bodyHint')}
          rows={8}
          value={block.body || ''}
          maxLength={12000}
          onChange={(e) => onChange({ ...block, body: e.target.value })}
        />
        <label className="stack-sm">{w.label}
          <select className="select" value={block.visual3d || ''} onChange={(e) => onChange({ ...block, visual3d: e.target.value || null, visual_mode: null, visual_geometry: null })}>
            <option value="">{w.none}</option>
            {VISUAL_CATALOG.map((item) => <option key={item.id} value={item.id}>{visualName(item, lang)}</option>)}
          </select>
        </label>
        {block.visual3d ? <><p className="small muted">{VISUAL_CATALOG.find((item) => item.id === block.visual3d)?.scope[lang] || w.note}</p>
          <button type="button" className="btn" aria-expanded={preview} onClick={() => setPreview((v) => !v)}>{w.preview}</button>
          {block.visual3d === 'semiconductor_chip' ? <>
            <label>{lang === 'en' ? 'Starting view' : 'Góc nhìn ban đầu'}<select className="select" value={block.visual_mode || 'device'} onChange={(e) => onChange({ ...block, visual_mode: e.target.value })}>
              {Object.entries(lang === 'en' ? { device: 'Transistor structure', cmos: 'CMOS inverter', stack: 'Chip layers', memristor: 'Memory element' } : { device: 'Cấu tạo transistor', cmos: 'Mạch đảo CMOS', stack: 'Các lớp chip', memristor: 'Phần tử nhớ' }).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select></label>
            <label>{lang === 'en' ? 'Device geometry' : 'Hình dạng thiết bị'}<select className="select" value={block.visual_geometry || 'planar'} onChange={(e) => onChange({ ...block, visual_geometry: e.target.value })}>
              {Object.entries(lang === 'en' ? { planar: 'Planar', nanosheet: 'Nanosheet', nanowire: 'Nanowire' } : { planar: 'Phẳng', nanosheet: 'Tấm nano', nanowire: 'Dây nano' }).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select></label>
          </> : null}
          {preview ? <GuidedVisual kind={block.visual3d} initialMode={block.visual_mode || undefined} initialGeometry={block.visual_geometry || undefined} /> : null}</> : null}
        {block.body ? (
          <div className="card-muted text-preview">
            <p className="small muted" style={{ marginBlockStart: 0 }}>
              {t('text.preview')}
            </p>
            <RichText text={block.body} className="lesson-text" />
          </div>
        ) : null}
      </div>
    )
  }
  return <TextView block={block} />
}

/**
 * Learner view. A marker like [1] in the note points at the part's sources in order
 * (source_refs[0] and so on): it opens that exact page or region, like a citation in the AI tutor.
 * Markers without a matching source stay plain text.
 */
function TextView({ block }) {
  const env = useBlockEnv()
  const citations = (block.source_refs || [])
    .map((ref, i) => (ref?.source_id ? { n: i + 1, title: env.sourceById?.(ref.source_id)?.title || '', ref } : null))
    .filter(Boolean)
  const canOpen = citations.length > 0 && typeof env.openSource === 'function'
  return (
    <BlockFrame block={block}>
      <RichText text={block.body} className="lesson-text" citations={canOpen ? citations : undefined} onCite={canOpen ? (cite) => env.openSource(cite.ref) : undefined} />
      {block.visual3d ? <GuidedVisual kind={block.visual3d} initialMode={block.visual_mode || undefined} initialGeometry={block.visual_geometry || undefined} /> : null}
    </BlockFrame>
  )
}
