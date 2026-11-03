import { forwardRef, useState } from 'react'
import { Bot, CircleCheck, Copy, ExternalLink, Globe, Lock, Presentation, RefreshCw, TriangleAlert, Unlink } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { Alert, Button } from '../../components/ui/index.js'
import ClassCodeDialog, { ShareQr } from './ClassCodeDialog.jsx'
import { copyText, joinUrl } from './explorerUtils.js'
import './studio-steps.css'

/**
 * "Đang chia sẻ" panel in the publish step: class code, link (copy), QR (download),
 * open as a learner, update the shared version, stop sharing.
 */
const SharePanel = forwardRef(function SharePanel({ lab, shareUrl, fresh, settingsChanged, onUpdate, updating, onUnpublish }, headingRef) {
  const { t, fmt } = useT()
  const [copied, setCopied] = useState(null)
  const [projecting, setProjecting] = useState(false)
  const code = lab.share_code
  const url = shareUrl
  const outdated = Boolean(lab.has_unpublished_changes)
  return (
    <section className="card pub-share" aria-labelledby="pub-share-title">
      <div className="pub-share-head">
        <h2 id="pub-share-title" ref={headingRef} tabIndex={-1} className="pub-card-title">
          {fresh ? t('publish.shared.titleNew') : t('publish.shared.title')}
        </h2>
        <ul className="list-reset pub-share-meta">
          <li>
            {lab.visibility === 'public' ? <Globe size={16} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
            {t(`common.visibility.${lab.visibility === 'public' ? 'public' : 'link'}`)}
          </li>
          <li>
            <Bot size={16} aria-hidden="true" />
            {lab.allow_tutor ? t('publish.shared.tutorOn') : t('publish.shared.tutorOff')}
          </li>
          {lab.published_at ? <li>{t('publish.shared.since', { date: fmt.dateTime(lab.published_at) })}</li> : null}
        </ul>
      </div>

      <div className="pub-share-body">
        <div className="stack">
          <div>
            <p className="pub-label">{t('publish.shared.code')}</p>
            <p className="pub-code" aria-label={t('explorer.classCode.codeAria', { code: code.split('').join(' ') })}>
              {code}
            </p>
            <p className="pub-hint">{t('publish.shared.joinHint', { url: joinUrl().replace(/^https?:\/\//, '') })}</p>
          </div>
          <div className="stack-sm">
            <label className="pub-label" htmlFor="pub-share-url">
              {t('publish.shared.url')}
            </label>
            <div className="pub-url-row">
              <input id="pub-share-url" className="input mono" readOnly value={url} onFocus={(e) => e.target.select()} />
              <Button
                icon={Copy}
                onClick={async () => {
                  const ok = await copyText(url)
                  setCopied(ok ? 'ok' : 'fail')
                }}
              >
                {t('common.actions.copy')}
              </Button>
            </div>
            <p className={['pub-copy-status', copied === 'fail' ? 'is-fail' : 'is-ok'].join(' ')} role="status">
              {copied === 'ok' ? t('publish.shared.copied') : copied === 'fail' ? t('explorer.classCode.copyFailed') : ''}
            </p>
          </div>
          <div className="pub-share-actions">
            <a className="btn" href={`/s/${code}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden="true" />
              {t('publish.shared.openLearner')}
              <span className="visually-hidden"> ({t('common.a11y.newWindow')})</span>
            </a>
            <Button icon={Presentation} onClick={() => setProjecting(true)}>
              {t('publish.shared.present')}
            </Button>
          </div>
        </div>
        <div className="pub-qr">
          <ShareQr url={url} code={code} size={220} downloadable />
          <p className="pub-hint pub-qr-hint">{t('publish.shared.qrHint')}</p>
        </div>
      </div>

      {outdated || settingsChanged ? (
        <Alert
          tone="warning"
          title={t('publish.shared.outdatedTitle')}
          action={
            <Button variant="primary" size="sm" icon={RefreshCw} onClick={onUpdate} loading={updating}>
              {t('publish.actions.update')}
            </Button>
          }
        >
          {outdated ? t('publish.shared.changes') : t('publish.shared.settingsChanged')}
        </Alert>
      ) : (
        <p className="small pub-uptodate">
          <CircleCheck size={16} aria-hidden="true" />
          {t('publish.shared.upToDate')}
        </p>
      )}

      <div className="pub-share-foot">
        <Button variant="ghost" size="sm" icon={Unlink} onClick={onUnpublish} className="pub-danger-ghost">
          {t('publish.actions.unpublish')}
        </Button>
        <span className="pub-hint pub-unpublish-hint">
          <TriangleAlert size={16} aria-hidden="true" />
          {t('publish.shared.unpublishHint')}
        </span>
      </div>
      <ClassCodeDialog open={projecting} onClose={() => setProjecting(false)} code={code} url={url} />
    </section>
  )
})

export default SharePanel
