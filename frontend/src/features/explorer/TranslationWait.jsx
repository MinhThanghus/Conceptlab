import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/index.js'
import { useT } from '../../i18n/index.jsx'
import './translationWait.css'

/**
 * Shown while a published lesson is machine-translated for the first time. A long lesson can
 * take half a minute or more, so the page says what is happening, shows it is still working and
 * lets the visitor read the original at once instead of waiting.
 */
export default function TranslationWait({ target, onOriginal }) {
  const { t } = useT()
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const started = Date.now()
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const language = t(`explorer.shared.targetLanguage.${target === 'vi' ? 'vi' : 'en'}`)
  return (
    <div className="container page tw-page">
      <section className="tw-card" role="status" aria-busy="true" aria-labelledby="tw-title">
        <h1 id="tw-title" className="tw-title">{t('explorer.shared.translatingTitle', { language })}</h1>
        <p className="tw-body">{t('explorer.shared.translatingBody', { language })}</p>
        <div className="tw-track" aria-hidden="true"><span /></div>
        <p className="tw-elapsed" aria-hidden="true">{t('explorer.shared.translatingElapsed', { n: seconds })}</p>
        {seconds >= 20 ? <p className="tw-slow">{t('explorer.shared.translatingSlow')}</p> : null}
        <div className="tw-actions">
          <Button onClick={onOriginal}>{t('explorer.shared.viewOriginalNow')}</Button>
        </div>
      </section>
    </div>
  )
}
