import { useId } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useT } from '../../../../i18n/index.jsx'

/**
 * Privacy questions for media that may show students (spec §16):
 * "contains students" and, when checked, a required consent confirmation.
 */
export function ConsentFields({ containsPeople, consent, onChange, error, disabled }) {
  const { t } = useT()
  const id = useId().replace(/[:]/g, '')
  return (
    <div className="au-consent">
      <label className="check" htmlFor={`${id}-people`}>
        <input
          id={`${id}-people`}
          type="checkbox"
          checked={Boolean(containsPeople)}
          disabled={disabled}
          onChange={(e) => onChange({ containsPeople: e.target.checked, consent: e.target.checked ? Boolean(consent) : false })}
        />
        <span>
          {t('sources.privacy.containsPeople')}
          <span className="field-hint" style={{ display: 'block' }}>
            {t('sources.privacy.containsPeopleHint')}
          </span>
        </span>
      </label>
      {containsPeople ? (
        <div className={['au-consent-box', error ? 'has-error' : ''].filter(Boolean).join(' ')}>
          <p className="au-consent-title">
            <ShieldCheck aria-hidden="true" />
            {t('sources.privacy.rulesTitle')}
          </p>
          <ul className="small au-consent-rules" id={`${id}-rules`}>
            <li>{t('sources.privacy.rulePrivate')}</li>
            <li>{t('sources.privacy.ruleNoIdentity')}</li>
            <li>{t('sources.privacy.ruleDelete')}</li>
            <li>{t('sources.privacy.ruleStandard')}</li>
          </ul>
          <label className="check au-consent-check" htmlFor={`${id}-consent`}>
            <input
              id={`${id}-consent`}
              type="checkbox"
              checked={Boolean(consent)}
              disabled={disabled}
              required
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={[`${id}-rules`, error ? `${id}-error` : null].filter(Boolean).join(' ')}
              onChange={(e) => onChange({ containsPeople: true, consent: e.target.checked })}
            />
            <span>
              {t('sources.privacy.consent')}
              <span aria-hidden="true" style={{ color: 'var(--cl-danger)' }}>
                {' '}
                *
              </span>
              <span className="visually-hidden"> ({t('common.a11y.required')})</span>
            </span>
          </label>
          {error ? (
            <p className="field-error" id={`${id}-error`} style={{ margin: 0 }}>
              {t('sources.privacy.consentRequired')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
