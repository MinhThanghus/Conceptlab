import { useT } from '../../i18n/index.jsx'
import { useAuth } from '../../features/auth/AuthContext.jsx'
import { radioKeyTarget } from '../ui/Field.jsx'

const CODES = ['vi', 'en']

/** VI | EN toggle. Persists locally and, when signed in, on the user profile. */
export function LanguageSwitch({ compact = false }) {
  const { lang, setLang, t } = useT()
  const auth = useAuth()
  const choose = (code) => {
    if (code === lang) return
    setLang(code)
    if (auth.user) auth.updateProfile({ locale: code }).catch(() => {})
  }
  return (
    <div className="segmented" role="radiogroup" aria-label={t('common.language.label')}>
      {CODES.map((code, index) => (
        <button
          key={code}
          type="button"
          role="radio"
          aria-checked={lang === code}
          tabIndex={lang === code ? 0 : -1}
          lang={code}
          title={t('common.language.switchTo', { lang: t(`common.language.${code}`) })}
          onClick={() => choose(code)}
          onKeyDown={(e) => {
            const next = radioKeyTarget(e.key, index, CODES.length)
            if (next < 0) return
            e.preventDefault()
            // Keep focus on the language that is now selected (roving tabindex).
            e.currentTarget.parentElement?.children[next]?.focus()
            choose(CODES[next])
          }}
        >
          <span aria-hidden="true">{compact ? code.toUpperCase() : code === 'vi' ? 'VI' : 'EN'}</span>
          {/* Screen readers hear the language name ("Tiếng Việt", "English"), not the letters "V I". */}
          <span className="visually-hidden">{code === 'vi' ? 'Tiếng Việt' : 'English'}</span>
        </button>
      ))}
    </div>
  )
}
