import { useState } from 'react'
import { Copy, Download } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { Alert, Button, Dialog, Spinner } from '../../components/ui/index.js'
import { copyText, joinUrl, shareUrlFor, useQrCode } from './explorerUtils.js'
// the dialog also opens from the studio's publish step, where the learner page's styles are not loaded yet
import './explorer.css'

/** Big QR image for a share link (used on the learner page and in the studio). */
export function ShareQr({ url, code, size = 320, downloadable = false }) {
  const { t } = useT()
  const qr = useQrCode(url, 640)
  if (qr.loading)
    return (
      <div className="xp-qr-box" style={{ inlineSize: size, blockSize: size }}>
        <Spinner />
      </div>
    )
  if (qr.error || !qr.url) return <Alert tone="warning">{t('explorer.classCode.qrError')}</Alert>
  return (
    <div className="xp-qr-wrap">
      <img className="xp-qr" src={qr.url} width={size} height={size} alt={t('explorer.classCode.qrAlt', { code })} />
      {downloadable ? (
        <a className="btn btn-sm" href={qr.url} download={`conceptlab-${code}.png`}>
          <Download aria-hidden="true" />
          {t('explorer.classCode.download')}
        </a>
      ) : null}
    </div>
  )
}

/** Projectable "join with this code" screen: huge code, short URL, QR code. */
export default function ClassCodeDialog({ open, onClose, code, url }) {
  const { t } = useT()
  const [copied, setCopied] = useState(null)
  const link = url || shareUrlFor(code)
  const join = joinUrl()
  const host = join.replace(/^https?:\/\//, '')
  return (
    <Dialog open={open} onClose={onClose} title={t('explorer.classCode.title')} size="wide">
      <div className="xp-classcode">
        <div className="xp-classcode-text">
          <ol className="xp-classcode-steps">
            <li>
              {t('explorer.classCode.step1')} <strong className="break">{host}</strong>
            </li>
            <li>{t('explorer.classCode.step2')}</li>
          </ol>
          <p className="xp-bigcode" aria-label={t('explorer.classCode.codeAria', { code: code.split('').join(' ') })}>
            {code}
          </p>
          <div className="xp-classcode-link">
            <Button
              size="sm"
              icon={Copy}
              onClick={async () => {
                const ok = await copyText(link)
                setCopied(ok ? 'ok' : 'fail')
              }}
            >
              {t('explorer.classCode.copyLink')}
            </Button>
            <span className="xp-classcode-url">{link}</span>
          </div>
          <p className="xp-classcode-status" role="status">
            {copied === 'ok' ? t('common.actions.copied') : copied === 'fail' ? t('explorer.classCode.copyFailed') : ''}
          </p>
        </div>
        <div className="xp-classcode-qr">
          <ShareQr url={link} code={code} size={300} />
          <p className="xp-classcode-scan">{t('explorer.classCode.scan')}</p>
        </div>
      </div>
    </Dialog>
  )
}
