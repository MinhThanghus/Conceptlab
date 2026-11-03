import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Presentation } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { checkCode, litePath, normalizeCode, PROJECTOR_KEY } from './liteUtils.js'
import './lite.css'

/** /lite: enter a class code and open the light lesson. No account needed. */
export default function LiteHome() {
  const { t } = useT()
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [tried, setTried] = useState(false)
  const [projector, setProjector] = useState(() => {
    try {
      return window.localStorage.getItem(PROJECTOR_KEY) === '1'
    } catch {
      return false
    }
  })
  const check = checkCode(normalizeCode(value))

  const toggleProjector = () => {
    setProjector((v) => {
      try {
        window.localStorage.setItem(PROJECTOR_KEY, v ? '0' : '1')
      } catch {
        /* preference just will not persist */
      }
      return !v
    })
  }

  return (
    <div className={['lite', projector ? 'lite-projector' : ''].filter(Boolean).join(' ')}>
      <div className="lite-top">
        <h1>{t('lite.homeTitle')}</h1>
        <button type="button" className="lite-btn" aria-pressed={projector} onClick={toggleProjector}>
          <Presentation aria-hidden="true" size={24} />
          {projector ? t('lite.projectorExit') : t('lite.projector')}
        </button>
      </div>
      <p>{t('lite.homeLead')}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setTried(true)
          if (check.ok) navigate(litePath(value))
        }}
        noValidate
      >
        <label htmlFor="lite-code">{t('lite.codeLabel')}</label>
        <input
          id="lite-code"
          className="lite-input lite-code-input"
          value={value}
          onChange={(e) => setValue(normalizeCode(e.target.value))}
          placeholder="ABC234"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="go"
          aria-describedby="lite-code-hint lite-code-error"
          aria-invalid={tried && !check.ok ? 'true' : undefined}
        />
        <p id="lite-code-hint" className="lite-small">
          {t('lite.codeHint')}
        </p>
        {tried && !check.ok ? (
          <p id="lite-code-error" className="lite-error" role="alert">
            {t('lite.invalidCode')}
          </p>
        ) : null}
        <button type="submit" className="lite-btn lite-btn-primary" style={{ inlineSize: '100%' }}>
          {t('lite.open')}
        </button>
      </form>
      <p className="lite-small">{t('lite.offlineLimits')}</p>
      <p>
        <Link to="/join">{t('lite.fullVersion')}</Link>
      </p>
    </div>
  )
}
