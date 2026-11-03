import { useState } from 'react'
import BookletCover from './BookletCover.jsx'
import './labs.css'
import '../public/cover.css'

/**
 * Sample labs with a capture of their 3D view in public/covers/<CODE>.webp (scripts/capture_shots.py
 * keeps the two lists equal). The 2D samples (ATTN24, PARAB3, SAVE25, SWAP42) take the booklet cover.
 */
export const DEMO_COVER_CODES = ['TPEND6', 'JUMP45', 'WATER6', 'HEART8', 'VBPASS', 'SPFTBA', 'SPFUTS', 'SPBASK', 'SPBDMT']
/** Paper-study samples with their model's capture in public/paper-previews/<CODE>.png (scripts/capture_visual_previews.py). */
const PAPER_STUDY_CODES = ['AGWATR', 'AGFARM', 'AGMAZE', 'PCWAVS', 'PCPARE', 'CHNASH', 'CHNWRE', 'CHCMPS', 'CHMSTE', 'CHMEMS']

/**
 * Pictures to try for a lab, best first: its own cover image (an uploaded or AI cover asset),
 * then, for a sample lab, the capture of its learner view. A compact cover (a 60px thumbnail)
 * skips the capture: a whole screen shrunk that far reads as noise, the title's letter does not.
 */
export function coverSources(lab, compact = false) {
  const out = []
  if (lab?.cover_url) out.push(lab.cover_url)
  const code = String(lab?.share_code || '').toUpperCase()
  if (lab?.is_demo && PAPER_STUDY_CODES.includes(code)) out.push(`/paper-previews/${code}.png`)
  if (!compact && lab?.is_demo && DEMO_COVER_CODES.includes(code)) out.push(`/covers/${code}.webp`)
  return out
}

/**
 * Card cover. A real picture when the lab has one, otherwise its booklet cover: the subject's
 * colour field, a seeded pattern and the title set large (the title's first letter on a
 * thumbnail). The root keeps the class .lab-cover and its child fills it in both directions, so
 * a parent may give it any box (16:9 card, 16:10 tile, square thumbnail, a tall deck panel).
 * Decorative: the card title next to it carries the meaning.
 * Props are shared with My labs: { lab, compact }. `eager` (optional) loads the picture at once,
 * for covers in the first screen of a list (the largest paint there).
 */
export default function LabCover({ lab, compact = false, eager = false }) {
  const [failed, setFailed] = useState(() => new Set())
  const src = coverSources(lab, compact).find((s) => !failed.has(s))
  const classes = ['lab-cover', 'cv', compact && 'compact cv-compact', lab?.space === 'paper2explorer' && 'cv-paper'].filter(Boolean)

  if (src) {
    // A cover picture (AI or uploaded) is framed a little above its centre, where its hero
    // sits; a screen capture keeps its top, where the lesson starts.
    const photo = src === lab?.cover_url
    return (
      <div className={classes.join(' ')}>
        <img
          key={src}
          src={src}
          alt=""
          className={photo ? 'cv-photo' : 'cv-capture'}
          width={compact ? 120 : 960}
          height={compact ? 120 : 540}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : undefined}
          decoding="async"
          onError={() => setFailed((prev) => new Set(prev).add(src))}
        />
      </div>
    )
  }

  return (
    <div className={[...classes, 'cv-type'].join(' ')} aria-hidden="true">
      <BookletCover lab={lab} compact={compact} />
    </div>
  )
}
