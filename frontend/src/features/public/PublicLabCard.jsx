import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n/index.jsx'
import LabCover from '../labs/LabCover.jsx'
import { sharePath } from './classCode.js'
import { demoCardText } from './demoCardTranslation.js'
import './lab-card.css'

/**
 * One line of facts. Hairlines part the items on screen (clipped where a line wraps);
 * screen readers hear the commas instead.
 */
function FactLine({ className, items }) {
  const shown = items.filter(Boolean)
  if (!shown.length) return null
  return (
    <p className={['pc-line', className].filter(Boolean).join(' ')}>
      {shown.map((item, index) => (
        <Fragment key={item.key}>
          {index > 0 ? <span className="visually-hidden">, </span> : null}
          <span className="pc-item" title={item.title}>
            {item.label ? <span className="visually-hidden">{item.label} </span> : null}
            {item.content}
          </span>
        </Fragment>
      ))}
    </p>
  )
}

/**
 * Card for a published lab (gallery, the home rail). The whole card opens /s/CODE.
 * `eager` (optional) loads the cover at once: for the cards in the first screen.
 */
export default function PublicLabCard({ lab, headingLevel = 3, eager = false }) {
  const { t, lang } = useT()
  const Heading = `h${headingLevel}`
  // The lab's own language (a Vietnamese title in the English UI is read with a Vietnamese voice).
  const contentLang = lab.language === 'vi' || lab.language === 'en' ? lab.language : undefined
  const cardText = demoCardText(lab, lang)
  const title = cardText?.title ?? lab.title
  const topic = cardText?.topic ?? lab.topic
  const showTopic = topic && String(topic).trim().toLocaleLowerCase() !== String(title || '').trim().toLocaleLowerCase()
  const titleLang = cardText?.language ?? contentLang
  return (
    <article className="pc">
      <LabCover lab={cardText ? { ...lab, title, language: titleLang } : lab} eager={eager} />
      <div className="pc-body">
        <Heading className="pc-title">
          <Link to={sharePath(lab.share_code)} className="pc-link" lang={titleLang}>
            {title}
          </Link>
        </Heading>
        {showTopic ? (
          <p className="pc-topic" lang={titleLang}>
            {topic}
          </p>
        ) : null}
        <div className="pc-meta">
          <FactLine
            className="pc-for"
            items={[
              lab.subject && { key: 'subject', content: t(`common.subjects.${lab.subject}`) },
              lab.grade && { key: 'grade', content: t(`common.grades.${lab.grade}`) },
              titleLang && { key: 'language', title: t('gallery.card.language'), content: t(`common.language.${titleLang}`) },
              { key: 'blocks', content: t('gallery.card.blocks', { count: lab.block_count || 0 }) },
            ]}
          />
        </div>
        {/* Read after the title; shown as a sticker on the picture. */}
        {lab.is_demo ? <p className="pc-flag">{t('gallery.card.demo')}</p> : null}
      </div>
    </article>
  )
}

/** The card's shape while the list loads. */
export function LabCardSkeleton() {
  return (
    <div className="pc pc-skeleton" aria-hidden="true">
      <div className="skeleton pc-skeleton-cover" />
      <div className="pc-body">
        <div className="skeleton pc-skeleton-line is-title" />
        <div className="skeleton pc-skeleton-line is-topic" />
        <div className="pc-meta">
          <div className="skeleton pc-skeleton-line is-meta" />
          <div className="skeleton pc-skeleton-line is-meta-short" />
        </div>
      </div>
    </div>
  )
}
