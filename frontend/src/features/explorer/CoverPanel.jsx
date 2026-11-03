import { useRef, useState } from 'react'
import { ImagePlus, Sparkles } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { post } from '../../lib/api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { AIBadge, Alert, Button, ErrorMessage, TextArea, useToast } from '../../components/ui/index.js'
import LabCover from '../labs/LabCover.jsx'
import './studio-steps.css'

/** The cover media the server knows (backend ai/cover_prompt.py PRESETS); `auto` picks one from the subject. */
export const COVER_STYLES = ['auto', 'clay', 'papercut', 'riso', 'specimen', 'cyanotype']
/** The studio keeps the teacher's idea to what the prompt always uses in full. */
const IDEA_MAX = 250

/**
 * Optional decorative cover made with Muse Image (spec §12: never evidence or a technique model).
 * The preview is the real card cover (LabCover): the 16:9 card crop and the square thumbnail crop,
 * or the subject's booklet cover while there is no picture.
 */
export default function CoverPanel({ lab, flush, reload }) {
  const { t } = useT()
  const { ai } = useAuth()
  const toast = useToast()
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [fresh, setFresh] = useState(null)
  // the shared version a new cover is waiting for: set when a cover is made on a shared lab
  const [sharedAt, setSharedAt] = useState(undefined)
  const coverAsset = fresh || (lab.assets || []).find((a) => a.kind === 'cover' && a.url === lab.cover_url) || null
  const coverUrl = fresh?.url || lab.cover_url
  const [style, setStyle] = useState(() => (COVER_STYLES.includes(coverAsset?.meta?.style) ? coverAsset.meta.style : 'auto'))
  const [peek, setPeek] = useState(null)
  const chips = useRef({})
  const enabled = Boolean(ai?.configured && ai?.image_enabled !== false)
  const shared = lab.status === 'published' && Boolean(lab.share_code)
  const needsShare = Boolean(fresh && shared && sharedAt !== undefined && lab.published_at === sharedAt)
  const previewLab = { ...lab, cover_url: coverUrl || null }

  const generate = async () => {
    setBusy(true)
    setError(null)
    try {
      await flush()
      const body = { style }
      if (prompt.trim()) body.prompt = prompt.trim().slice(0, IDEA_MAX)
      const asset = await post(`/api/labs/${lab.id}/ai/cover`, body)
      setFresh(asset)
      setSharedAt(shared ? lab.published_at : undefined)
      toast.success(t('publish.cover.done'))
      reload?.()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  // a radio group: arrows, Home and End move the choice, and the focus with it
  const onStyleKey = (event) => {
    const index = COVER_STYLES.indexOf(style)
    const next = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: COVER_STYLES.length - 1 }[event.key]
    if (next === undefined) return
    event.preventDefault()
    const id = COVER_STYLES[(next + COVER_STYLES.length) % COVER_STYLES.length]
    setStyle(id)
    chips.current[id]?.focus()
  }

  return (
    <section className="card stack pub-side-card" aria-labelledby="pub-cover-title">
      <h2 id="pub-cover-title" className="pub-card-title">
        <ImagePlus aria-hidden="true" />
        {t('publish.cover.title')}
      </h2>
      <p className="pub-hint">{t('publish.cover.lead')}</p>

      <figure className="pub-cover" aria-label={t('publish.cover.alt', { title: lab.title })} aria-busy={busy || undefined}>
        <div className="pub-cover-frame">{busy ? <div className="skeleton pub-cover-skeleton" /> : <LabCover lab={previewLab} eager />}</div>
        <figcaption className="pub-cover-caption">
          <div className="pub-cover-thumb">{busy ? <div className="skeleton pub-cover-skeleton is-square" /> : <LabCover lab={previewLab} compact />}</div>
          {busy ? (
            <p className="pub-cover-note" role="status">
              <span className="pub-cover-busy">{t('publish.cover.generating')}</span>
              <span>{t('publish.cover.generatingHint')}</span>
            </p>
          ) : coverUrl ? (
            <p className="pub-cover-note">
              {coverAsset?.ai_generated !== false ? <AIBadge label={t('publish.cover.aiBadge')} /> : null}
              <span>{t('common.ai.imageDisclaimer')}</span>
            </p>
          ) : (
            <p className="pub-cover-note">{t('publish.cover.none')}</p>
          )}
        </figcaption>
      </figure>
      {needsShare ? <Alert tone="info" role="status">{t('publish.cover.republish')}</Alert> : null}

      <div className="pub-cover-style">
        <p id="pub-cover-style-label" className="field-label">{t('publish.cover.style')}</p>
        <div className="pub-cover-styles" role="radiogroup" aria-labelledby="pub-cover-style-label" onKeyDown={onStyleKey} onMouseLeave={() => setPeek(null)}>
          {COVER_STYLES.map((id) => (
            <button
              key={id}
              ref={(node) => { chips.current[id] = node }}
              type="button"
              role="radio"
              className="chip"
              aria-checked={style === id}
              aria-describedby={`pub-cover-hint-${id}`}
              tabIndex={style === id ? 0 : -1}
              disabled={busy}
              onClick={() => setStyle(id)}
              onMouseEnter={() => setPeek(id)}
              onFocus={() => setPeek(id)}
              onBlur={() => setPeek(null)}
            >
              {t(`publish.cover.styles.${id}`)}
            </button>
          ))}
        </div>
        {/* each option's hint, for assistive technology; the line below shows the one in view */}
        {COVER_STYLES.map((id) => (
          <span key={id} id={`pub-cover-hint-${id}`} hidden>{t(`publish.cover.styleHints.${id}`)}</span>
        ))}
        <p className="pub-hint pub-cover-style-hint" aria-hidden="true">{t(`publish.cover.styleHints.${peek || style}`)}</p>
      </div>

      <TextArea label={t('publish.cover.prompt')} hint={t('publish.cover.promptHint')} rows={2} maxLength={IDEA_MAX} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      {!ai?.configured ? <Alert tone="info">{t('common.ai.notConfigured')}</Alert> : ai?.image_enabled === false ? <Alert tone="info">{t('publish.cover.disabled')}</Alert> : null}
      <Button icon={Sparkles} onClick={generate} loading={busy} disabled={!enabled || busy}>
        {busy ? t('publish.cover.generating') : coverUrl ? t('publish.cover.regenerate') : t('publish.cover.generate')}
      </Button>
      <ErrorMessage error={error} />
    </section>
  )
}
