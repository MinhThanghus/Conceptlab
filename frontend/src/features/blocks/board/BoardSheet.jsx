import { useEffect, useMemo, useState } from 'react'
import { useT } from '../../../i18n/index.jsx'
import { MathTex } from '../../../components/ui/index.js'
import { bulletText, cropStyle, itemText, oneLine, sheetParts, sheetTex } from './boardModel.js'

// Pixel sizes learned by loading a picture once (PDF pages: the server does not know them).
const learned = new Map()

/** The picture's pixel size: the one the server knows, else learned once by loading it. */
function useNaturalSize(src, known) {
  const knownW = known?.width || 0
  const knownH = known?.height || 0
  const [size, setSize] = useState(() => (knownW && knownH ? { width: knownW, height: knownH } : learned.get(src) || null))
  useEffect(() => {
    if (knownW && knownH) {
      setSize((prev) => (prev?.width === knownW && prev?.height === knownH ? prev : { width: knownW, height: knownH }))
      return undefined
    }
    if (!src) return undefined
    if (learned.has(src)) {
      setSize(learned.get(src))
      return undefined
    }
    let alive = true
    const img = new Image()
    img.onload = () => {
      const next = { width: img.naturalWidth, height: img.naturalHeight }
      if (!next.width || !next.height) return
      learned.set(src, next)
      if (alive) setSize(next)
    }
    img.src = src
    return () => {
      alive = false
    }
  }, [src, knownW, knownH])
  return size
}

/**
 * A drawing cut from the original photo: the photo is a background scaled so the drawing's box
 * fills the crop, then cleaned up (grey, more contrast, multiplied into the sheet so a white board
 * or a page becomes the sheet's paper; a blackboard is inverted first, board.css).
 */
function DiagramCrop({ src, size, bbox, label }) {
  const natural = useNaturalSize(src, size)
  const style = cropStyle(bbox, natural)
  if (!src || !style) return null
  return <div className="bd-crop" role="img" aria-label={label} style={{ ...style, backgroundImage: `url(${JSON.stringify(src)})` }} />
}

function MathLine({ item }) {
  const latex = String(item.latex || '').trim()
  const lead = oneLine(item.lead)
  return (
    <div className="bd-sheet-math" data-kind={item.kind}>
      {lead ? <span className="bd-sheet-lead">{lead}</span> : null}
      {latex ? <MathTex tex={sheetTex(latex)} className="bd-sheet-tex" /> : <span className="bd-sheet-mathtext">{itemText(item)}</span>}
    </div>
  )
}

function Drawing({ item, photo }) {
  const { t } = useT()
  const text = oneLine(item.text)
  const labels = (item.labels || []).map(oneLine).filter(Boolean)
  return (
    <figure className="bd-sheet-fig">
      {photo?.src && item.bbox ? <DiagramCrop src={photo.src} size={photo.size} bbox={item.bbox} label={t('board.view.cropAlt')} /> : null}
      {text || labels.length ? (
        <figcaption>
          {text ? <span className="bd-sheet-caption">{text}</span> : null}
          {labels.length ? (
            <ul className="bd-sheet-labels" aria-label={t('board.item.labels')}>
              {labels.map((label, i) => (
                <li key={`${label}-${i}`}>{label}</li>
              ))}
            </ul>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  )
}

/** The sheet's parts without its title: the part's own heading (the card's or the slide's) says it. */
export function sheetBody(block) {
  return sheetParts(block).parts.filter((part) => part.kind !== 'title')
}

function SheetPart({ part, photo }) {
  const { item } = part
  switch (part.kind) {
    case 'heading':
      return (
        <h3 className="bd-sheet-h">
          <span>{itemText(item)}</span>
        </h3>
      )
    case 'bullets':
      return (
        <ul className="bd-sheet-ul">
          {part.items.map((bullet) => (
            <li key={bullet.id}>{bulletText(itemText(bullet))}</li>
          ))}
        </ul>
      )
    case 'formula':
    case 'equation':
      return <MathLine item={item} />
    case 'note':
      return <p className="bd-sheet-note">{itemText(item)}</p>
    case 'diagram':
      return <Drawing item={item} photo={photo} />
    default:
      return <p className="bd-sheet-p">{itemText(item)}</p>
  }
}

/**
 * The Text view: the transcription typeset on a paper sheet. Always matches what the teacher
 * checked, is real text (selectable, read aloud, translated) and never shows crossed-out lines.
 * The title is written once: the block's heading (h2 on the card, the slide's heading in the
 * deck) already shows it, so the sheet starts with the lines and its headings are h3.
 * `photo` is the resolved original { src, size } for the drawings' crops. With `columns` (a lesson
 * slide) the drawings make a column of their own beside the lines, as they sit beside the writing
 * on a board; board.css lays the two side by side only on a wide slide.
 */
export function BoardSheet({ block, photo, columns = false }) {
  const parts = useMemo(() => sheetBody(block), [block])
  const figures = columns ? parts.filter((part) => part.kind === 'diagram') : []
  const split = figures.length > 0 && figures.length < parts.length
  const render = (part) => <SheetPart key={part.id} part={part} photo={photo} />
  return (
    <article className={split ? 'bd-sheet has-cols' : 'bd-sheet'} data-surface={block.surface || 'other'}>
      {split ? (
        <>
          <div className="bd-sheet-main">{parts.filter((part) => part.kind !== 'diagram').map(render)}</div>
          <div className="bd-sheet-side">{figures.map(render)}</div>
        </>
      ) : (
        parts.map(render)
      )}
    </article>
  )
}
