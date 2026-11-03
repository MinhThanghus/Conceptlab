import { Link } from 'react-router-dom'
import { Copy, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { Badge, Button, LinkButton, StatusBadge, useToast } from '../../components/ui/index.js'
import { sharePath } from '../public/classCode.js'

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  throw new Error('clipboard unavailable')
}

/**
 * A lab in "My labs", as one row of the labs table: open, duplicate, delete; the class code
 * and the student page when it is shared. Each cell carries its column name for phones,
 * where a row is laid out as a block.
 */
export default function LabCard({ lab, onDuplicate, onDelete, duplicating = false, isNew = false }) {
  const { t, fmt, lang } = useT()
  const toast = useToast()
  const published = lab.status === 'published' && lab.share_code
  const copyCode = async () => {
    try {
      await copyText(lab.share_code)
      toast.success(t('labs.card.codeCopied', { code: lab.share_code }))
    } catch {
      toast.error(t('labs.card.copyFailed', { code: lab.share_code }))
    }
  }
  return (
    <tr className={['lab-row', isNew && 'is-new'].filter(Boolean).join(' ')}>
      <td className="lab-cell-title">
        <span className="lab-row-title" id={`lab-${lab.id}-title`}>
          <Link to={`/app/labs/${lab.id}`}>{lab.title}</Link>
        </span>
        {lab.topic ? <span className="lab-row-topic">{lab.topic}</span> : null}
        {isNew || (lab.language && lab.language !== lang && ['vi', 'en'].includes(lab.language)) ? (
          <span className="lab-row-badges">
            {isNew ? <Badge tone="success">{t('labs.card.new')}</Badge> : null}
            {/* Translated copies look identical otherwise: say when a lab teaches in the other language. */}
            {lab.language && lab.language !== lang && ['vi', 'en'].includes(lab.language) ? (
              <Badge tone="outline">{t(lab.language === 'en' ? 'labs.card.languageEn' : 'labs.card.languageVi')}</Badge>
            ) : null}
          </span>
        ) : null}
      </td>
      <td className="lab-cell-status" data-label={t('labs.my.status')}>
        <StatusBadge status={lab.status} />
      </td>
      <td className="lab-cell-subject" data-label={t('labs.table.subject')}>
        <span className="lab-row-line">
          {t(`common.subjects.${lab.subject}`)}, {t(`common.grades.${lab.grade}`)}
        </span>
        <span className="lab-row-sub">{t(`common.spaces.${lab.space}`)}</span>
      </td>
      <td className="lab-cell-content" data-label={t('labs.table.content')}>
        <span className="lab-row-line">{t('labs.card.blocks', { count: lab.block_count || 0 })}</span>
        <span className="lab-row-sub">{t('labs.card.sources', { count: lab.source_count || 0 })}</span>
      </td>
      <td className="lab-cell-updated" data-label={t('labs.table.updated')}>
        <time dateTime={lab.updated_at}>{fmt.relative(lab.updated_at)}</time>
      </td>
      <td className="lab-cell-code" data-label={t('labs.card.classCode')}>
        {published ? (
          <span className="lab-code">
            <span className="lab-code-main">
              <code className="owner-code">{lab.share_code}</code>
              <button type="button" className="icon-btn sm" onClick={copyCode} aria-label={t('labs.card.copyCode', { code: lab.share_code })} title={t('labs.card.copyCode', { code: lab.share_code })}>
                <Copy aria-hidden="true" />
              </button>
            </span>
            <Link to={sharePath(lab.share_code)} className="owner-share-link" target="_blank" rel="noopener">
              {t('labs.card.studentView')}
              <ExternalLink aria-hidden="true" />
              <span className="visually-hidden"> ({t('common.a11y.newWindow')})</span>
            </Link>
          </span>
        ) : (
          <span className="lab-row-sub">{t('labs.card.notShared')}</span>
        )}
      </td>
      <td className="lab-cell-actions">
        <span className="owner-actions">
          <LinkButton to={`/app/labs/${lab.id}`} variant="ghost" size="sm" icon={Pencil} aria-label={t('labs.card.openNamed', { title: lab.title })}>
            {t('labs.card.open')}
          </LinkButton>
          {/* On wide screens these two show their icon only (the name stays in aria-label and the tooltip). */}
          <Button
            size="sm"
            variant="ghost"
            icon={Copy}
            onClick={() => onDuplicate(lab)}
            loading={duplicating}
            aria-label={t('labs.card.duplicateNamed', { title: lab.title })}
            title={t('common.actions.duplicate')}
          >
            <span className="owner-action-text">{t('common.actions.duplicate')}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="owner-delete"
            icon={Trash2}
            onClick={() => onDelete(lab)}
            aria-label={t('labs.card.deleteNamed', { title: lab.title })}
            title={t('common.actions.delete')}
          >
            <span className="owner-action-text">{t('common.actions.delete')}</span>
          </Button>
        </span>
      </td>
    </tr>
  )
}
