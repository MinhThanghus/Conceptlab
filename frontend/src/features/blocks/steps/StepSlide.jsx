import { useId, useState } from 'react'
import { MessageCircleQuestion, TriangleAlert } from 'lucide-react'
import { Button, RichText } from '../../../components/ui/index.js'
import { useT } from '../../../i18n/index.jsx'
import { useBlockEnv } from '../BlockEnv.jsx'
import { SourceRefChips } from '../../sources/SourceRefChips.jsx'
import { useCanAsk } from './lessonHooks.js'
import { mediaUrl } from './lessonKit.js'
import { CheckQuestion, StepHighlight } from './StepsBlock.jsx'
import papers from '../../../../../shared/paper_study_batch.json'
import './stepSlide.css'

// The body's first sentence is the slide's lead when more follows and it is this short (characters).
const LEAD_LIMIT = 150
// With no figure beside it, a body longer than this (characters) reads in two columns across the
// sheet instead of one narrow column on its left; beside a figure it takes half the sheet.
const COLUMNS_FROM = 360
const LONG_FROM = 300
// Past about 75 tiếng beside a figure (a formula, its legend and an example) the words take seven
// columns of twelve, as on a question page, so the body and its actions stay on the sheet at 1366x768.
const DENSE_FROM = 360

/**
 * The body's first sentence and the rest, when the body opens with a plain sentence (no list,
 * heading, quote, table or display math) of at most LEAD_LIMIT characters and more follows.
 * Inline math ($...$) never ends a sentence. Otherwise everything stays in `rest`.
 */
function splitLead(body) {
  const text = String(body || '').trim()
  const none = { lead: '', rest: text }
  if (!text || /^([-*+]\s|\d+[.)]\s|#|>|\||\$\$)/.test(text)) return none
  const paragraph = text.split(/\n\s*\n/)[0]
  // math spans keep their length but cannot end a sentence
  const masked = paragraph.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]*\$/g, (math) => 'x'.repeat(math.length))
  const stop = /[.!?…]["”’)\]]*(?=\s|$)/.exec(masked)
  const end = stop ? stop.index + stop[0].length : paragraph.length
  const lead = text.slice(0, end).trim()
  const rest = text.slice(end).trim()
  if (!rest || lead.length > LEAD_LIMIT || lead.includes('$$') || lead.includes('\n')) return none
  // a sentence cut through bold or math would break its markup
  if ((lead.match(/\*\*/g) || []).length % 2 || (lead.match(/\$/g) || []).length % 2) return none
  return { lead, rest }
}

// An actual image/PDF citation is only used when a specific page is known.
// A whole-page source view is never presented as an exact selected region.
function sourceFigure(step, env) {
  if (step.highlight?.source_id) return step.highlight
  for (const ref of step.source_refs || []) {
    const source = env.sourceById(ref.source_id)
    if (source?.kind === 'pdf' && !ref.page) continue
    if (source && mediaUrl({ source, page: ref.page })) return { ...ref, bbox: null, located: 'none' }
  }
  return null
}

function paperPreview(env) {
  const byCode = papers.find((paper) => paper.share_code === env.shareCode)
  if (byCode) return byCode
  // The teacher preview has a lab ID rather than a share code. Only use a
  // known topic when the original paper DOI appears in its own source note.
  if (env.space !== 'paper2explorer') return null
  return papers.find((paper) => (env.sources || []).some((source) =>
    source.kind === 'note' && String(source.text || '').includes(paper.doi))) || null
}

/**
 * One deck page. The parent controls navigation; this component never auto-advances.
 * In the lesson deck (`inDeck`) the deck's heading is this step's own title, so the page shows no
 * title or position of its own and names its article for assistive technology instead.
 * Layout (stepSlide.css): the source figure fills a well on the left, zoomed on the step's region;
 * the words column on the right is top-aligned and keeps its actions at its foot. A page that
 * asks a question gives the words the larger share and the coral bead. Text is never enlarged to
 * fill the sheet: the body is at body size, its first sentence at lead size when more follows
 * (and nothing else on the page is at lead size); with no figure a long body takes two columns.
 */
export default function StepSlide({ block, step, index = 0, total = 1, phase = 'explain', inDeck = false }) {
  const { t } = useT()
  const env = useBlockEnv()
  const canAsk = useCanAsk()
  const headingId = useId()
  const [failedPreview, setFailedPreview] = useState(null)
  const [answers, setAnswers] = useState({})
  if (!step) return null
  const figure = sourceFigure(step, env)
  // A topic render is not a figure of this step: it opens the part once and is never repeated.
  const preview = figure || index > 0 ? null : paperPreview(env)
  const showPreview = Boolean(preview && failedPreview !== preview.share_code)
  const title = step.title?.trim() || t('steps.view.untitled', { n: index + 1 })
  const hasFigure = Boolean(figure || showPreview)
  const question = phase === 'question'
  const combined = phase === 'combined'
  const asks = question || (combined && Boolean(step.check_question))
  const askStep = canAsk && !question && (!combined || !step.check_question)
  // the part's first page says when nobody has confirmed the order of its steps
  const unconfirmed = index === 0 && !question && !block.sequence_confirmed
  const answerKey = `${block.id}:${step.id}`
  // a question on the page is its one lead-size line; otherwise the body's first sentence may be
  const { lead, rest } = !question && !asks ? splitLead(step.body) : { lead: '', rest: String(step.body || '').trim() }
  const columns = !hasFigure && !asks && !question && rest.length > COLUMNS_FROM
  const long = hasFigure && phase === 'explain' && lead.length + rest.length > LONG_FROM
  const dense = long && lead.length + rest.length > DENSE_FROM
  const classes = [
    'step-slide',
    hasFigure ? 'has-visual' : 'no-visual',
    question ? 'is-question' : combined ? 'is-combined' : 'is-explain',
    asks ? 'has-check' : '',
    columns ? 'has-columns' : '',
    long ? 'is-long' : '',
    dense ? 'is-dense' : '',
    inDeck ? 'in-deck' : '',
  ].filter(Boolean).join(' ')
  const named = inDeck ? { 'aria-label': title } : { 'aria-labelledby': headingId }

  return <article className={classes} {...named}><div className="step-slide-grid">
    {hasFigure ? <div className="step-slide-visual" role="region" aria-label={figure ? t('steps.slide.figure') : t('steps.slide.image')}>
      {figure ? <StepHighlight key={step.id} highlight={figure} step={step} index={index} fill /> :
        <figure className="step-slide-topic">
          <div className="step-slide-topic-frame">
            <img src={`/paper-previews/${preview.share_code}.png`} alt={t('steps.slide.image')} onError={() => setFailedPreview(preview.share_code)} />
          </div>
          <figcaption>{t('steps.slide.concept')}</figcaption>
        </figure>}
    </div> : null}
    <div className="step-slide-content" role="region" aria-label={t('steps.slide.content')} tabIndex={0}>
      {!inDeck && !combined ? <div className="step-slide-meta"><span>{question ? t('steps.slide.question') : t('steps.slide.explanation')}</span><span>{index + 1} / {total}</span></div> : null}
      {!inDeck ? <h3 id={headingId}>{title}</h3> : null}
      {!question && lead ? <RichText text={lead} className="step-slide-lead" /> : null}
      {!question && rest ? <RichText text={rest} className="step-slide-body" /> : null}
      {asks ? <CheckQuestion key={step.id} block={block} step={step} canAsk={canAsk} env={env} compact={combined} slide
        answer={answers[answerKey] || ''} onAnswerChange={(answer) => setAnswers((previous) => ({ ...previous, [answerKey]: answer }))} /> : null}
      {question && !step.check_question ? <p className="step-slide-body">{t('steps.slide.noQuestion')}</p> : null}
      {step.source_refs?.length || askStep || unconfirmed ? <div className="step-slide-foot">
        {unconfirmed ? <p className="step-slide-notice">
          <TriangleAlert aria-hidden="true" />
          <span>{block.ai_generated ? t('steps.view.unconfirmedAiTitle') : t('steps.view.unconfirmedTitle')}</span>
        </p> : null}
        {step.source_refs?.length ? <SourceRefChips refs={step.source_refs} /> : null}
        {askStep ? <Button icon={MessageCircleQuestion} className="step-slide-ask" onClick={() => env.ask({ block_id: block.id, item_id: step.id })}>
          {t('steps.view.askStep')}
        </Button> : null}
      </div> : null}
    </div>
  </div></article>
}
