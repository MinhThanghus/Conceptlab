import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { Button, IconButton } from './Button.jsx'

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

// Open dialogs, innermost last: only the top one reacts to Escape/Tab (a confirm opened
// from inside a dialog must not close its parent too).
const openStack = []

function useDialogBehaviour(open, onClose, panelRef, initialFocusRef) {
  // Callers usually pass an inline `onClose`; keep the latest one in a ref so a parent
  // re-render (typing in a field, a loading flag) never re-runs the open/close effect —
  // that used to throw focus back to the opener and then to the first button.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    if (!open) return undefined
    const token = {}
    openStack.push(token)
    const previous = document.activeElement
    const panel = panelRef.current
    const focusFirst = () => {
      if (panel?.contains(document.activeElement)) return
      const target = initialFocusRef?.current || panel?.querySelector('[data-autofocus]') || panel?.querySelector(FOCUSABLE) || panel
      target?.focus({ preventScroll: true })
    }
    const raf = requestAnimationFrame(focusFirst)
    const onKey = (event) => {
      if (openStack[openStack.length - 1] !== token) return
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current?.()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (!items.length) {
        event.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (!panel.contains(document.activeElement)) {
        // Focus escaped (e.g. a click on the backdrop): bring it back inside.
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey, true)
      const index = openStack.indexOf(token)
      if (index !== -1) openStack.splice(index, 1)
      document.body.style.overflow = overflow
      // Return focus to the opener; if it is gone (e.g. the item was deleted), to the page content.
      const back = previous && previous.isConnected && typeof previous.focus === 'function' ? previous : document.getElementById('main')
      back?.focus({ preventScroll: true })
    }
  }, [open, panelRef, initialFocusRef])
}

/**
 * Accessible modal dialog: labelled, focus moves inside, Tab is trapped, Escape closes,
 * focus returns to the opener. `size`: undefined | 'wide' | 'full'.
 */
export function Dialog({ open, onClose, title, children, footer, size, initialFocusRef, describedBy }) {
  const { t } = useT()
  const panelRef = useRef(null)
  const titleId = useId()
  useDialogBehaviour(open, onClose, panelRef, initialFocusRef)
  if (!open) return null
  return createPortal(
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div
        ref={panelRef}
        className={['dialog', size].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
      >
        <div className="dialog-header">
          <h2 id={titleId}>{title}</h2>
          <IconButton icon={X} label={t('common.actions.close')} onClick={onClose} size="sm" />
        </div>
        <div className="dialog-body">{children}</div>
        {footer ? <div className="dialog-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}

/** Confirmation with explicit consequence text; `tone="danger"` for destructive actions. */
export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel, tone = 'primary', loading }) {
  const { t } = useT()
  const cancelRef = useRef(null)
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      initialFocusRef={tone === 'danger' ? cancelRef : undefined}
      footer={
        <>
          <Button ref={cancelRef} onClick={onClose}>
            {t('common.actions.cancel')}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel || t('common.actions.confirm')}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  )
}

/** Side drawer (non-modal on wide screens is handled by layouts; this one is modal). */
export function Drawer({ open, onClose, title, children, footer, width }) {
  const { t } = useT()
  const panelRef = useRef(null)
  const titleId = useId()
  useDialogBehaviour(open, onClose, panelRef)
  if (!open) return null
  return createPortal(
    <>
      <div className="dialog-backdrop" style={{ background: 'rgb(17 24 39 / 0.25)' }} onMouseDown={onClose} />
      <aside
        ref={panelRef}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={width ? { inlineSize: `min(100%, ${width})` } : undefined}
      >
        <div className="dialog-header">
          <h2 id={titleId}>{title}</h2>
          <IconButton icon={X} label={t('common.actions.close')} onClick={onClose} size="sm" />
        </div>
        <div className="dialog-body">{children}</div>
        {footer ? <div className="dialog-footer">{footer}</div> : null}
      </aside>
    </>,
    document.body,
  )
}
