import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronDown, Lightbulb, Presentation } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import LessonLanguageNotice from '../explorer/LessonLanguageNotice.jsx'
import { useTranslatedLesson } from '../explorer/useTranslatedLesson.js'
import { get, post } from '../../lib/api.js'
import { ProvenanceBadge } from '../../components/ui/index.js'
import { arrowConditions, bulletText, itemText, normText, oneLine, sheetParts } from '../blocks/board/boardModel.js'
import LiteAsk from './LiteAsk.jsx'
import { deleteCachedLab, isOffline, liteSavedAt, loadCachedLab, saveLabForOffline } from './liteCache.js'
import {
  allAnswered,
  blockParams,
  buildSections,
  fullPath,
  keyFormula,
  liteOrderStart,
  liteQuestions,
  liteReview,
  liteSources,
  plainParagraphs,
  PROJECTOR_KEY,
  quizPayload,
  sourceImageUrl,
} from './liteUtils.js'
import './lite.css'

function Paras({ source }) {
  const paras = plainParagraphs(source)
  if (!paras.length) return null
  return (
    <>
      {paras.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </>
  )
}

function ParamsTable({ block }) {
  const { t } = useT()
  const params = blockParams(block)
  if (!params.length) return null
  return (
    <div>
      <h3>{t('lite.blocks.paramsTitle')}</h3>
      <table className="lite-table">
        <thead>
          <tr>
            <th scope="col">{t('lite.blocks.paramName')}</th>
            <th scope="col">{t('lite.blocks.paramValue')}</th>
            <th scope="col">{t('lite.blocks.paramUnit')}</th>
            <th scope="col">{t('lite.provenanceTitle')}</th>
          </tr>
        </thead>
        <tbody>
          {params.map((p, i) => (
            <tr key={i}>
              <td>
                {p.name || p.symbol} {p.symbol && p.name ? `(${p.symbol})` : ''}
              </td>
              <td>{p.value || t('common.states.none')}</td>
              <td>{p.unit}</td>
              <td>
                <ProvenanceBadge value={p.provenance} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SourceNote({ text }) {
  return <div className="lite-small" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
    {String(text).split(/(https?:\/\/[^\s<>]+)/g).map((part, index) =>
      /^https?:\/\//.test(part) ? <a key={index} href={part} target="_blank" rel="noreferrer">{part}</a> : part)}
  </div>
}

function SourceImage({ url, refInfo, alt }) {
  const { t } = useT()
  const bbox = refInfo?.bbox
  const hasBox = Array.isArray(bbox) && bbox.length === 4 && bbox.every(Number.isFinite) && bbox[0] >= 0 && bbox[1] >= 0 && bbox[2] <= 1 && bbox[3] <= 1 && bbox[2] > bbox[0] && bbox[3] > bbox[1]
  return <figure className="lite-figure">
    <div className="lite-image-frame">
      <img className="lite-img" src={url} alt={alt} loading="lazy" />
      {hasBox ? <span aria-hidden="true" className="lite-highlight" style={{ left: `${bbox[0] * 100}%`, top: `${bbox[1] * 100}%`, width: `${(bbox[2] - bbox[0]) * 100}%`, height: `${(bbox[3] - bbox[1]) * 100}%` }} /> : null}
    </div>
    {hasBox ? <figcaption>{t(`common.located.${refInfo?.located || 'none'}`)}</figcaption> : null}
  </figure>
}

/** A formula's line led by the words written before it, unless the line already says them. */
function formulaLine(item) {
  const line = itemText(item)
  const lead = oneLine(item.lead)
  return lead && !normText(line).startsWith(normText(lead)) ? `${lead} ${line}` : line
}

/**
 * A board block (handwriting made easy to read) as its Text view only, from the same parts as the
 * full Text view: no KaTeX, no picture inline, crossed-out writing never. The section heading
 * already shows the title, so a line that repeats it is not shown again. The redrawn sheet is
 * one link away.
 */
function LiteBoard({ block, lab }) {
  const { t } = useT()
  const parts = sheetParts(block).parts.filter((part) => part.kind !== 'title')
  const visual = block.visual?.asset_id ? sourceImageUrl(lab, block.visual) : ''
  const proof = block.visual_proof

  return (
    <div className="lite-board">
      {!parts.length ? <p className="lite-small">{t('lite.blocks.noContent')}</p> : null}
      {parts.map(({ kind, id, item, items }, index) => {
        const key = id || `${kind}-${index}`
        if (kind === 'bullets') {
          return (
            <ul key={key} className="lite-list">
              {items.map((bullet, i) => (
                <li key={bullet.id || i}>{bulletText(itemText(bullet))}</li>
              ))}
            </ul>
          )
        }
        const line = itemText(item)
        if (kind === 'diagram') {
          const labels = (Array.isArray(item.labels) ? item.labels : []).map(oneLine).filter(Boolean)
          return (
            <div key={key} className="lite-well">
              {line ? (
                <p>
                  <strong>{t('lite.board.drawing')}</strong> {line}
                </p>
              ) : null}
              {labels.length ? <p className="lite-small">{t('lite.board.labels', { labels: labels.join(', ') })}</p> : null}
            </div>
          )
        }
        if (kind === 'heading') return <h3 key={key}>{line}</h3>
        if (kind === 'formula' || kind === 'equation') {
          const shown = formulaLine(item)
          // words over or under the arrow, unless the line already says them
          const said = normText(shown)
          const words = (side) => arrowConditions(item.latex).map((pair) => pair[side]).filter((word) => word && !said.includes(normText(word)))
          const over = words(0) // [over, under] per arrow
          const under = words(1)
          const arrows = [over.length ? t('lite.board.arrowOver', { words: over.join(', ') }) : '', under.length ? t('lite.board.arrowUnder', { words: under.join(', ') }) : '']
          return (
            <div key={key} className="lite-board-formula">
              <p className="lite-formula">{shown}</p>
              {over.length || under.length ? <p className="lite-small">{arrows.filter(Boolean).join(' ')}</p> : null}
            </div>
          )
        }
        if (kind === 'note') {
          return (
            <p key={key} className="lite-board-note">
              <strong>{t('lite.board.note')}</strong> {line}
            </p>
          )
        }
        return <p key={key}>{line}</p>
      })}
      {visual ? (
        <p>
          <a href={visual} target="_blank" rel="noreferrer">
            {t('lite.board.openVisual')}
          </a>
        </p>
      ) : null}
      {visual && proof?.checked && !proof.ok ? <p className="lite-small">{t('lite.board.visualDiffers')}</p> : null}
    </div>
  )
}

function LiteQuiz({ block, code, lab }) {
  const { t, fmt } = useT()
  const questions = liteQuestions(block)
  const [answers, setAnswers] = useState({})
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [failed, setFailed] = useState(false)
  const byId = useMemo(() => new Map((result?.results || []).map((r) => [String(r.question_id), r])), [result])

  if (!questions.length) return <p className="lite-small">{t('lite.quiz.empty')}</p>

  const check = async () => {
    if (busy) return
    if (isOffline()) {
      setFailed(true)
      return
    }
    setBusy(true)
    setFailed(false)
    try {
      const payload = quizPayload(block, answers)
      const display = name.replace(/\s+/g, ' ').trim().slice(0, 60)
      if (display) payload.display_name = display
      const phase = new URLSearchParams(window.location.search).get('phase')
      payload.phase = phase === 'pre' || phase === 'post' ? phase : 'practice'
      const language = lab?.translated_language ? `?lang=${encodeURIComponent(lab.translated_language)}` : ''
      const res = await post(`/api/share/${encodeURIComponent(code)}/quiz-attempts${language}`, payload)
      setResult(res)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lite-quiz">
      <p>{t('lite.quiz.intro', { count: questions.length })}</p>
      {questions.map((q, qi) => {
        const review = result ? byId.get(String(q.id)) : null
        const given = answers[q.id]
        const marked = liteReview(q, review, given, { trueLabel: t('quiz.view.true'), falseLabel: t('quiz.view.false') })
        const order = Array.isArray(given) ? given : liteOrderStart(q)
        const hint = String(q.hint || '').trim()
        return (
          <fieldset key={q.id} className="lite-well lite-question">
            <legend>
              <strong>{t('lite.quiz.questionN', { n: qi + 1, total: questions.length })}</strong>
            </legend>
            {String(q.context || '').trim() ? (
              <div className="lite-context">
                <Paras source={q.context} />
              </div>
            ) : null}
            <div className="lite-prompt">
              <Paras source={q.prompt} />
            </div>
            {q.kind === 'mcq' || q.kind === 'truefalse' ? (
              <div className="lite-options">
                {(q.kind === 'truefalse' ? [t('quiz.view.true'), t('quiz.view.false')] : q.options || []).map((label, oi) => {
                  const right = review && Number.isInteger(review.correct_answer) && review.correct_answer === oi
                  const wrongPick = Boolean(review) && given === oi && !right
                  return (
                    <label key={oi} className={['lite-option', right ? 'is-right' : '', wrongPick ? 'is-wrong' : ''].filter(Boolean).join(' ')}>
                      <input type="radio" name={`lite-${block.id}-${q.id}`} checked={given === oi} disabled={Boolean(result)} onChange={() => setAnswers((a) => ({ ...a, [q.id]: oi }))} />
                      <span>{label}</span>
                    </label>
                  )
                })}
              </div>
            ) : q.kind === 'numeric' ? (
              <div>
                <label htmlFor={`lite-num-${q.id}`}>{t('quiz.view.yourAnswer')} {q.unit ? `(${q.unit})` : ''}</label>
                <input id={`lite-num-${q.id}`} className="lite-input" inputMode="decimal" disabled={Boolean(result)} value={given ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
              </div>
            ) : q.kind === 'order' ? (
              // starts from the server's order, which is never the solved one
              <ol className="lite-list">
                {order.map((optIndex, pos) => (
                  <li key={pos}>
                    <select
                      className="lite-input"
                      disabled={Boolean(result)}
                      value={optIndex}
                      aria-label={t('lite.quiz.positionLabel', { n: pos + 1, total: order.length })}
                      onChange={(e) => {
                        const next = [...order]
                        const chosen = Number(e.target.value)
                        const other = next.indexOf(chosen)
                        if (other >= 0) next[other] = next[pos]
                        next[pos] = chosen
                        setAnswers((a) => ({ ...a, [q.id]: next }))
                      }}
                    >
                      {(q.options || []).map((label, oi) => (
                        <option key={oi} value={oi}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ol>
            ) : null}
            {hint && !review ? (
              <details className="lite-hint">
                <summary>
                  <Lightbulb aria-hidden="true" size={24} />
                  <span>{t('lite.quiz.hint')}</span>
                  <ChevronDown className="lite-hint-chevron" aria-hidden="true" size={24} />
                </summary>
                <div className="lite-hint-body">
                  <Paras source={hint} />
                </div>
              </details>
            ) : null}
            {review ? (
              <div className="lite-review" aria-live="polite">
                <p className={['lite-verdict', review.correct ? 'is-right' : 'is-wrong'].join(' ')}>
                  <strong>{review.correct ? t('lite.quiz.correct') : t('lite.quiz.wrong')}</strong>
                </p>
                {marked.chosenFeedback ? <p className="lite-feedback">{marked.chosenFeedback}</p> : null}
                {!review.correct && marked.correctText ? (
                  <p>
                    <strong>{t('lite.quiz.correctAnswer')}:</strong> {marked.correctText}
                  </p>
                ) : null}
                {!review.correct && marked.correctValue !== null ? (
                  <p>
                    <strong>{t('lite.quiz.correctAnswer')}:</strong> {fmt.number(marked.correctValue, 6)}
                    {q.unit ? ` ${q.unit}` : ''}
                    {/* the margin the server marked with, when it says so */}
                    {marked.exact || marked.margin ? (
                      <span className="lite-margin">
                        {' '}
                        {marked.exact ? t('quiz.view.toleranceExact') : t('quiz.view.tolerance', { pct: fmt.percent(marked.margin, 1) })}
                      </span>
                    ) : null}
                  </p>
                ) : null}
                {!review.correct && marked.correctOrder.length ? (
                  <div>
                    <p>
                      <strong>{t('quiz.view.correctOrder')}</strong>
                    </p>
                    <ol className="lite-list">
                      {marked.correctOrder.map((label, i) => (
                        <li key={`${label}-${i}`}>{label}</li>
                      ))}
                    </ol>
                  </div>
                ) : null}
                {review.explanation ? <Paras source={review.explanation} /> : q.explanation ? <Paras source={q.explanation} /> : null}
              </div>
            ) : null}
          </fieldset>
        )
      })}
      {result ? (
        <div className="lite-banner lite-banner-saved" role="status">
          <p>
            <strong>{t('lite.quiz.score', { score: result.score, total: result.total })}</strong>
          </p>
          <button
            type="button"
            className="lite-btn"
            onClick={() => {
              setAnswers({})
              setResult(null)
            }}
          >
            {t('lite.quiz.retry')}
          </button>
        </div>
      ) : (
        <div>
          <label htmlFor={`lite-name-${block.id}`}>{t('lite.quiz.nameLabel')}</label>
          <input id={`lite-name-${block.id}`} className="lite-input" maxLength={60} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
          <p className="lite-small">{t('lite.quiz.nameHint')}</p>
          {failed ? (
            <p className="lite-error" role="alert">
              {t('lite.quiz.sendFailed')}
            </p>
          ) : null}
          <button type="button" className="lite-btn lite-btn-primary" style={{ inlineSize: '100%' }} disabled={busy || !allAnswered(block, answers)} onClick={check}>
            {busy ? t('lite.quiz.checking') : t('lite.quiz.check')}
          </button>
          {!allAnswered(block, answers) ? <p className="lite-small">{t('lite.quiz.notAnswered')}</p> : null}
        </div>
      )}
    </div>
  )
}

function LiteBlock({ section, lab, code }) {
  const { t } = useT()
  const block = section.block
  const formula = keyFormula(block)
  return (
    <section className="lite-card" aria-labelledby={`lite-sec-${block.id}`}>
      <p className="lite-small">{t('lite.partOf', { current: section.index, total: buildSections(lab).length })}: {t(`blocks.types.${block.type}`)}</p>
      <h2 id={`lite-sec-${block.id}`}>{section.title || t(`blocks.types.${block.type}`)}</h2>
      {section.description ? <Paras source={section.description} /> : null}
      {block.ai_generated ? <p className="lite-small">{t('common.ai.generatedLabel')}</p> : null}
      {formula ? (
        <div>
          <h3>{t('lite.blocks.formulaTitle')}</h3>
          <p className="lite-formula">{formula}</p>
        </div>
      ) : null}
      <LiteBlockBody block={block} lab={lab} code={code} />
    </section>
  )
}

function LiteBlockBody({ block, lab, code }) {
  const { t } = useT()
  switch (block.type) {
    case 'text':
      return block.body ? <Paras source={block.body} /> : <p className="lite-small">{t('lite.blocks.noContent')}</p>
    case 'steps':
      return (
        <div>
          <h3>{t('lite.blocks.stepsTitle')}</h3>
          {!block.sequence_confirmed ? <p className="lite-small">{t('steps.view.unconfirmedBody')}</p> : null}
          <ol className="lite-plain">
            {(block.steps || []).map((step, i) => {
              const img = step.highlight ? sourceImageUrl(lab, step.highlight) : ''
              return (
                <li key={step.id || i} className="lite-well">
                  <h3>{step.title || `${i + 1}`}</h3>
                  <Paras source={step.body} />
                  {img ? <SourceImage url={img} refInfo={step.highlight} alt={t('lite.blocks.imageAlt', { title: step.title || block.title || '' })} /> : null}
                  {step.check_question ? <p><strong>{step.check_question}</strong></p> : null}
                </li>
              )
            })}
          </ol>
        </div>
      )
    case 'flow':
      return (
        <div>
          <h3>{t('lite.blocks.nodesTitle')}</h3>
          <ol className="lite-list">
            {(block.nodes || []).map((n) => (
              <li key={n.id}>
                <strong>{n.label}</strong>
                {n.description ? <Paras source={n.description} /> : null}
              </li>
            ))}
          </ol>
          {block.edges?.length ? (
            <>
              <h3>{t('lite.blocks.edgesTitle')}</h3>
              <ul className="lite-list">
                {block.edges.map((e) => (
                  <li key={e.id}>{e.label || `${e.source} to ${e.target}`}{e.description ? `: ${e.description}` : ''}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      )
    case 'diagram': {
      const img = block.image ? sourceImageUrl(lab, block.image) : ''
      return (
        <div>
          {img ? <img className="lite-img" src={img} alt={t('lite.blocks.imageAlt', { title: block.title || '' })} loading="lazy" /> : null}
          <h3>{t('lite.blocks.hotspotsTitle')}</h3>
          <ol className="lite-list">
            {(block.hotspots || []).map((h) => (
              <li key={h.id}>
                <strong>{h.label}</strong>
                <Paras source={h.description_simple || h.description_detailed} />
              </li>
            ))}
          </ol>
          <p className="lite-small">{t('lite.blocks.openInteractive')}</p>
          <p><Link to={fullPath(code)}>{t('lite.openFull')}</Link></p>
        </div>
      )
    }
    case 'graph':
    case 'simulation':
      return (
        <div>
          {block.explanation ? <Paras source={block.explanation} /> : null}
          {block.notes ? <Paras source={block.notes} /> : null}
          <ParamsTable block={block} />
          <p className="lite-small">{t('lite.blocks.openInteractive')}</p>
          <p><Link to={fullPath(code)}>{t('lite.openFull')}</Link></p>
        </div>
      )
    case 'algorithm':
      return (
        <div>
          <Paras source={block.explanation} />
          <p className="lite-small">{t('lite.blocks.openInteractive')}</p>
          <p><Link to={fullPath(code)}>{t('lite.openFull')}</Link></p>
        </div>
      )
    case 'video':
      return (
        <div>
          <p className="lite-small">{t('lite.blocks.videoNote')}</p>
          <h3>{t('lite.blocks.markersTitle')}</h3>
          <ol className="lite-list">
            {(block.markers || []).map((m) => (
              <li key={m.id}>
                <strong>{m.label}</strong> ({Math.floor((m.t || 0) / 60)}:{String(Math.floor((m.t || 0) % 60)).padStart(2, '0')})
                {m.note ? <Paras source={m.note} /> : null}
              </li>
            ))}
          </ol>
          {block.limits_note ? <p className="lite-small">{block.limits_note}</p> : null}
          <p><Link to={fullPath(code)}>{t('lite.openFull')}</Link></p>
        </div>
      )
    case 'field':
      return (
        <div>
          {block.prompt ? <Paras source={block.prompt} /> : null}
          <h3>{t('lite.blocks.framesTitle')}</h3>
          <ol className="lite-list">
            {(block.frames || []).map((f, i) => (
              <li key={f.id || i}>{f.note || `${i + 1}`}</li>
            ))}
          </ol>
          <p className="lite-small">{t('lite.blocks.openInteractive')}</p>
          <p><Link to={fullPath(code)}>{t('lite.openFull')}</Link></p>
        </div>
      )
    case 'widget':
      return (
        <div>
          <p>{t('lite.blocks.widgetNote')}</p>
          <p><Link to={fullPath(code)}>{t('lite.openFull')}</Link></p>
        </div>
      )
    case 'quiz':
      return <LiteQuiz block={block} code={code} lab={lab} />
    case 'board':
      return <LiteBoard block={block} lab={lab} />
    default:
      return <p className="lite-small">{t('lite.blocks.noContent')}</p>
  }
}

/** /lite/:code: the light lesson. Sequential, text first, works from the offline copy. */
export default function LiteLab() {
  const { code: rawCode } = useParams()
  const code = String(rawCode || '').trim().toUpperCase()
  const { t, fmt, lang } = useT()
  const requestKey = `${code}:${lang}`
  const [state, setState] = useState({ status: 'loading', lab: null, offline: false, error: null })
  const translation = useTranslatedLesson(state.key === requestKey ? state.lab : null, code, lang, state.offline)
  const [projector, setProjector] = useState(() => {
    try {
      return window.localStorage.getItem(PROJECTOR_KEY) === '1'
    } catch {
      return false
    }
  })
  const [savedAt, setSavedAt] = useState(() => liteSavedAt(code))
  const [saveState, setSaveState] = useState('idle')
  const [missingImages, setMissingImages] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [rating, setRating] = useState(0)
  const [feedbackState, setFeedbackState] = useState('idle')

  const load = useCallback(
    async (signal) => {
      try {
        const lab = await get(`/api/share/${encodeURIComponent(code)}?lang=${lang}`, { signal })
        if (!signal?.aborted) setState({ key: requestKey, status: 'ready', lab, offline: false, error: null })
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') return
        const cached = loadCachedLab(code)
        if (cached && error?.code === 'network_error') {
          setState({ key: requestKey, status: 'ready', lab: cached, offline: true, error: null })
        } else if (error?.status === 404) {
          await deleteCachedLab(code)
          if (signal?.aborted) return
          setSavedAt(null)
          setState({ key: requestKey, status: 'not_found', lab: null, offline: false, error })
        } else {
          setState({ key: requestKey, status: 'error', lab: null, offline: false, error })
        }
      }
    },
    [code, lang, requestKey],
  )

  useEffect(() => {
    const controller = new AbortController()
    setSavedAt(liteSavedAt(code))
    setSaveState('idle')
    setMissingImages(0)
    setState({ key: requestKey, status: 'loading', lab: null, offline: false, error: null })
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  useEffect(() => {
    if (translation.lab?.title) document.title = `${translation.lab.title} - ${t('lite.homeTitle')}`
  }, [translation.lab, t])

  const sections = useMemo(() => buildSections(translation.lab), [translation.lab])
  const lab = translation.lab

  if (state.key !== requestKey || state.status === 'loading') {
    return (
      <div className="lite" aria-busy="true">
        <p role="status">{t('lite.loading')}</p>
      </div>
    )
  }
  if (state.status === 'not_found') {
    return (
      <div className="lite">
        <h1>{t('lite.notFoundTitle')}</h1>
        <p>{t('lite.notFoundBody', { code })}</p>
        <p><Link to="/lite">{t('lite.open')}</Link></p>
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="lite">
        <h1>{t('lite.loadError')}</h1>
        <button type="button" className="lite-btn lite-btn-primary" onClick={() => load()}>
          {t('common.actions.retry')}
        </button>
      </div>
    )
  }

  if (translation.status === 'loading') return <div className="lite" role="status">{t('explorer.shared.translating')}</div>
  if (translation.status === 'error' || translation.status === 'offline') return (
    <div className="lite">
      <p role="alert">{t(translation.status === 'offline' ? 'explorer.shared.translationOffline' : 'explorer.shared.translationFailed')}</p>
      {translation.status !== 'offline' ? <button type="button" className="lite-btn lite-btn-primary" onClick={translation.retry}>{t('explorer.shared.translationRetry')}</button> : null}
      <button type="button" className="lite-btn" onClick={translation.viewOriginal}>{t(translation.status === 'offline' ? 'explorer.shared.viewSaved' : 'explorer.shared.viewOriginal')}</button>
    </div>
  )
  if (!lab) return null

  const spec = lab.spec || {}
  const objectives = (spec.objectives || []).filter((o) => String(o || '').trim())
  const assumptions = (spec.assumptions || []).filter((a) => a && String(a.text || '').trim())
  const sources = liteSources(lab)

  return (
    <div className={['lite', projector ? 'lite-projector' : ''].filter(Boolean).join(' ')}>
      <div className="lite-top">
        <Link to="/lite">{t('lite.link')}</Link>
        <button
          type="button"
          className="lite-btn"
          aria-pressed={projector}
          onClick={() => {
            setProjector((v) => {
              try {
                window.localStorage.setItem(PROJECTOR_KEY, v ? '0' : '1')
              } catch { /* ignore */ }
              return !v
            })
          }}
        >
          <Presentation aria-hidden="true" size={24} />
          {projector ? t('lite.projectorExit') : t('lite.projector')}
        </button>
      </div>

      {lab.translated_language ? <p className="lite-well">{t(lab.translation_kind === 'reviewed' ? 'explorer.shared.translatedReviewed' : 'explorer.shared.translated')}</p> : <LessonLanguageNotice language={lab.language} className="lite-well" />}
      {state.offline ? (
        <div className="lite-banner lite-banner-offline" role="status">
          <strong>{t('lite.offlineTitle')}</strong>
          <p>{t('lite.offlineBody', { date: savedAt ? fmt.date(new Date(savedAt).toISOString()) : '' })}</p>
        </div>
      ) : null}
      <section className="lite-well" aria-label={t('lite.offlineHeading')}>
        <p>{t('lite.offlinePrivacy')}</p>
        {savedAt ? <p role="status">{t('lite.savedOffline')}: {t('lite.savedAt', { date: fmt.date(new Date(savedAt).toISOString()) })}</p> : null}
        {saveState === 'failed' ? <p className="lite-error" role="alert">{t(savedAt ? 'lite.saveFailedKept' : 'lite.saveFailed')}</p> : null}
        {saveState === 'idle' && savedAt && missingImages > 0 ? <p className="lite-small" role="status">{t('lite.savedMissingImages', { count: missingImages })}</p> : null}
        <div className="lite-top" style={{ justifyContent: 'flex-start' }}>
          {!state.offline ? <button type="button" className="lite-btn" disabled={saveState === 'saving'} onClick={async () => {
            setSaveState('saving')
            const { ok, missing } = await saveLabForOffline(lab)
            setSavedAt(liteSavedAt(code))
            setMissingImages(missing.length)
            setSaveState(ok ? 'idle' : 'failed')
          }}>{saveState === 'saving' ? t('lite.savingOffline') : t('lite.saveOffline')}</button> : null}
          {savedAt ? <button type="button" className="lite-btn" onClick={async () => { await deleteCachedLab(code); setSavedAt(null) }}>{t('lite.deleteOffline')}</button> : null}
        </div>
      </section>

      <header>
        <h1>{lab.title}</h1>
        <p className="lite-small">
          {[lab.subject ? t(`common.subjects.${lab.subject}`) : '', lab.grade ? t(`common.grades.${lab.grade}`) : ''].filter(Boolean).join(', ')}
        </p>
        {spec.summary ? (
          <section aria-labelledby="lite-summary">
            <h2 id="lite-summary">{t('lite.summaryTitle')}</h2>
            <Paras source={spec.summary} />
          </section>
        ) : null}
      </header>

      <section className="lite-well" aria-labelledby="lite-sources">
        <h2 id="lite-sources">{t('lite.sourcesTitle')}</h2>
        {sources.length ? <ul className="lite-list">{sources.map((source) => {
          const url = source.url && (/^https?:\/\//i.test(source.url) || /^\/(?!\/)/.test(source.url)) ? source.url : ''
          const name = <>{source.title} ({t('common.sourceKinds.' + source.kind)}) {source.pageCount ? t('explorer.sources.pages', { count: source.pageCount }) : ''}</>
          return <li key={source.id}>
            {source.note ? <details><summary>{name}</summary><SourceNote text={source.note} /></details>
              : url ? <a href={url} target="_blank" rel="noreferrer">{name}</a> : name}
          </li>
        })}</ul> : <p>{t('lite.sourcesEmpty')}</p>}
      </section>

      {objectives.length ? (
        <section className="lite-well" aria-labelledby="lite-objectives">
          <h2 id="lite-objectives">{t('lite.objectivesTitle')}</h2>
          <ul className="lite-list">
            {objectives.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {assumptions.length ? (
        <section className="lite-well" aria-labelledby="lite-assumptions">
          <h2 id="lite-assumptions">{t('lite.assumptionsTitle')}</h2>
          <ul className="lite-list">
            {assumptions.map((a) => (
              <li key={a.id || a.text}>{a.text}</li>
            ))}
          </ul>
          <p className="lite-small">{t('lite.assumptionsHint')}</p>
        </section>
      ) : null}

      <section className="lite-well" aria-labelledby="lite-prov">
        <h2 id="lite-prov">{t('lite.provenanceTitle')}</h2>
        <ul className="lite-plain">
          {['document', 'user', 'assumption', 'unknown'].map((kind) => (
            <li key={kind} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <ProvenanceBadge value={kind} /> <span>{t(`common.provenance.${kind}Hint`)}</span>
            </li>
          ))}
        </ul>
      </section>

      {sections.length ? (
        <nav className="lite-nav" aria-label={t('lite.contentsTitle')}>
          <h2>{t('lite.contentsTitle')}</h2>
          {sections.map((s) => (
            <a key={s.id} href={`#lite-sec-${s.id}`}>
              {s.index}. {s.title || t(`blocks.types.${s.type}`)}
            </a>
          ))}
        </nav>
      ) : null}

      {sections.map((section) => (
        <div key={section.id}>
          <LiteBlock key={`${lab.translated_language || lab.language}:${section.id}`} section={section} lab={lab} code={code} />
        </div>
      ))}

      <section className="lite-card" aria-labelledby="lite-ask">
        <h2 id="lite-ask">{t('lite.ask.title')}</h2>
        <LiteAsk code={code} lab={lab} />
      </section>

      <section className="lite-card" aria-labelledby="lite-feedback">
        <h2 id="lite-feedback">{t('lite.feedback.title')}</h2>
        {feedbackState === 'sent' ? (
          <p role="status">{t('lite.feedback.sent')}</p>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              if (isOffline()) {
                setFeedbackState('failed')
                return
              }
              if (!rating) {
                setFeedbackState('needRating')
                return
              }
              setFeedbackState('sending')
              try {
                const body = { rating }
                const comment = feedback.trim().slice(0, 1000)
                if (comment) body.comment = comment
                await post(`/api/share/${encodeURIComponent(code)}/feedback`, body)
                setFeedbackState('sent')
              } catch {
                setFeedbackState('failed')
              }
            }}
          >
            <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
              <legend>{t('explorer.feedback.ratingLabel')}</legend>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" className="lite-btn" aria-pressed={rating === n} aria-label={t('explorer.feedback.starLabel', { count: n, label: t(`explorer.feedback.stars.s${n}`) })} onClick={() => setRating(n)}>
                    {n}
                  </button>
                ))}
              </div>
              <p className="lite-small">{rating ? t(`explorer.feedback.stars.s${rating}`) : t('explorer.feedback.pick')}</p>
              {feedbackState === 'needRating' ? (
                <p className="lite-error" role="alert">{t('explorer.feedback.ratingRequired')}</p>
              ) : null}
            </fieldset>
            <label htmlFor="lite-feedback-text">{t('lite.feedback.label')}</label>
            <textarea id="lite-feedback-text" className="lite-textarea" rows={3} maxLength={1000} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
            <p className="lite-small">{t('lite.feedback.hint')}</p>
            {feedbackState === 'failed' ? <p className="lite-error" role="alert">{t('lite.feedback.failed')}</p> : null}
            <button type="submit" className="lite-btn lite-btn-primary" disabled={feedbackState === 'sending'}>
              {t('lite.feedback.send')}
            </button>
          </form>
        )}
      </section>

      <p><Link to={fullPath(code)}>{t('lite.backToFull')}</Link></p>
    </div>
  )
}
