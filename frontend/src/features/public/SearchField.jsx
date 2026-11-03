import { useId, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import './search-field.css'

/** Search input with a leading icon and a clear button. Label can be visually hidden. */
export default function SearchField({ label, value, onChange, placeholder, hideLabel = false, className }) {
  const { t } = useT()
  const id = `search-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const inputRef = useRef(null)
  return (
    <div className={['field', 'search-field', className].filter(Boolean).join(' ')}>
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : 'field-label'}>
        {label}
      </label>
      <div className="search-wrap">
        <Search className="search-icon" aria-hidden="true" />
        <input
          ref={inputRef}
          id={id}
          type="search"
          className="input search-input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && value) {
              e.preventDefault()
              onChange('')
            }
          }}
          autoComplete="off"
          enterKeyHint="search"
          maxLength={100}
        />
        {value ? (
          <button
            type="button"
            className="search-clear"
            onClick={() => {
              onChange('')
              // The button disappears once the box is empty: keep focus in the search box.
              inputRef.current?.focus()
            }}
            aria-label={t('gallery.filters.clearSearch')}
            title={t('gallery.filters.clearSearch')}
          >
            <X aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  )
}
