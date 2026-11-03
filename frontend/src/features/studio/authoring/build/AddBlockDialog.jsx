import { useT } from '../../../../i18n/index.jsx'
import { Dialog } from '../../../../components/ui/index.js'
import { blockIcon } from '../../../blocks/registry.js'
import { BLOCK_TYPES } from '../../../lab/specUtils.js'

/** Menu of the 11 interactive part types (icon + name + one-line hint). */
export function AddBlockDialog({ open, onClose, onAdd }) {
  const { t } = useT()
  return (
    <Dialog open={open} onClose={onClose} title={t('blocks.addBlock')} size="wide">
      <p className="small muted" style={{ marginTop: 0 }}>
        {t('build.add.intro')}
      </p>
      <ul className="list-reset au-type-grid">
        {BLOCK_TYPES.map((type) => {
          const Icon = blockIcon(type)
          return (
            <li key={type}>
              <button type="button" className="au-type-card" onClick={() => onAdd(type)}>
                <span className="au-type-icon" aria-hidden="true">
                  <Icon />
                </span>
                <span className="au-type-text">
                  <strong>{t(`blocks.types.${type}`)}</strong>
                  <span className="small muted">{t(`blocks.typeHints.${type}`)}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Dialog>
  )
}
