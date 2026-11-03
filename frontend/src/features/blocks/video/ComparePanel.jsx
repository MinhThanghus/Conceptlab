import { useEffect, useRef, useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { Alert, Button, Dialog, Spinner, Switch } from '../../../components/ui/index.js'
import { useBlockEnv } from '../BlockEnv.jsx'
import { compareMedia } from './videoUtils.js'

/**
 * Side-by-side reference next to the practice video (spec §8.3, Demo 2): a textbook page
 * (PDF page render), a reference image, or the teacher's model video. Stacks on phones.
 * A model video can follow the main player's play/pause and speed.
 */
export default function ComparePanel({ compare, mainPlaying = false, mainRate = 1 }) {
  const { t } = useT()
  const env = useBlockEnv()
  const media = compareMedia(compare, env.sourceById, env.assetById)
  const [zoom, setZoom] = useState(false)
  const [sync, setSync] = useState(false)
  const videoRef = useRef(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !sync) return
    video.playbackRate = mainRate
    if (mainPlaying && video.paused) {
      const p = video.play()
      if (p && typeof p.catch === 'function') p.catch(() => {})
    } else if (!mainPlaying && !video.paused) {
      video.pause()
    }
  }, [sync, mainPlaying, mainRate])

  if (!media) return null
  if (media.kind === 'missing') return <Alert tone="warning">{t('video.compare.missing')}</Alert>
  if (media.kind === 'processing') return <Spinner label={t('video.compare.processing')} />
  if (media.kind === 'failed') return <Alert tone="danger">{t('video.compare.failed')}</Alert>

  const title = media.source?.title || t('video.compare.savedImage')
  const heading =
    media.kind === 'page'
      ? t('video.compare.pageTitle', { n: media.page })
      : media.kind === 'video'
        ? t('video.compare.videoTitle')
        : t('video.compare.imageTitle')
  const alt = media.kind === 'page' ? t('video.compare.pageAlt', { title, n: media.page }) : t('video.compare.imageAlt', { title })

  return (
    <figure className="vb-compare">
      <figcaption>
        <span className="vb-compare-title">
          <span className="vb-compare-heading">{heading}</span>
          <span className="vb-compare-source">{title}</span>
        </span>
        {media.kind !== 'video' ? (
          <Button size="sm" variant="ghost" icon={Maximize2} onClick={() => setZoom(true)}>
            {t('video.compare.zoom')}
          </Button>
        ) : null}
      </figcaption>
      <div className="vb-compare-media">
        {media.kind === 'video' ? (
          <video ref={videoRef} src={media.url} poster={media.poster || undefined} controls preload="none" playsInline aria-label={t('video.compare.videoLabel', { title })}>
            {t('video.player.unsupported')}
          </video>
        ) : (
          <img src={media.url} alt={alt} loading="lazy" decoding="async" />
        )}
      </div>
      {media.kind === 'video' ? <Switch label={t('video.compare.sync')} checked={sync} onChange={(e) => setSync(e.target.checked)} /> : null}
      <Dialog open={zoom} onClose={() => setZoom(false)} title={heading} size="full">
        <img className="vb-zoom-img" src={media.url} alt={alt} />
      </Dialog>
    </figure>
  )
}
