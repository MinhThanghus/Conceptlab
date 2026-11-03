import { useState } from 'react'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { pageImageUrl, sourceIcon } from './sourceMeta.js'
import './SourceThumb.css'

/**
 * Small visual of a source: photo, first PDF page, video poster, a few measured values or the
 * start of a note. Images load lazily (slow networks); failures fall back to the kind icon.
 */
export function SourceThumb({ source, localUrl, className }) {
  const { t, fmt } = useT()
  const [failed, setFailed] = useState(false)
  const Icon = sourceIcon(source?.kind)
  if (!source) return null

  let url = null
  if (localUrl) url = localUrl
  else if (source.status === 'ready') {
    if (source.kind === 'image') url = source.urls?.file
    else if (source.kind === 'pdf') url = pageImageUrl(source, 1, 0.5)
    else if (source.kind === 'video') url = source.urls?.poster
  }

  let content
  if (source.status === 'processing' && !localUrl) {
    content = (
      <span className="src-thumb-fallback">
        <LoaderCircle className="spin" aria-hidden="true" />
      </span>
    )
  } else if (source.status === 'failed') {
    content = (
      <span className="src-thumb-fallback is-failed">
        <TriangleAlert aria-hidden="true" />
      </span>
    )
  } else if (url && !failed) {
    content = <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
  } else if (source.kind === 'data' && Array.isArray(source.data) && source.data.length) {
    content = (
      <span className="src-thumb-data" aria-hidden="true">
        {source.data.slice(0, 3).map((row, i) => (
          <span key={i}>
            <span className="mono">{row.symbol}</span> = {fmt.number(row.value, 4)} {row.unit}
          </span>
        ))}
        {source.data.length > 3 ? <span className="muted">+{source.data.length - 3}</span> : null}
      </span>
    )
  } else if (source.kind === 'note' && source.text) {
    content = (
      <span className="src-thumb-note" aria-hidden="true">
        {source.text.slice(0, 160)}
      </span>
    )
  } else {
    content = (
      <span className="src-thumb-fallback">
        <Icon aria-hidden="true" />
      </span>
    )
  }

  return (
    <span className={['src-thumb', `is-${source.kind}`, className].filter(Boolean).join(' ')} title={t(`common.sourceKinds.${source.kind}`)}>
      {content}
    </span>
  )
}
