import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, Info } from 'lucide-react'

const ToastContext = createContext(null)

/**
 * Transient confirmations. Not the only channel for errors: forms must also show
 * errors inline. Announced politely via aria-live.
 *   const toast = useToast(); toast.success('Đã lưu'); toast.error(text)
 */
export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const seq = useRef(0)
  const remove = useCallback((id) => setItems((list) => list.filter((item) => item.id !== id)), [])
  const push = useCallback(
    (tone, text, ms = 4500) => {
      seq.current += 1
      const id = seq.current
      setItems((list) => [...list.slice(-3), { id, tone, text }])
      window.setTimeout(() => remove(id), ms)
    },
    [remove],
  )
  const api = useMemo(
    () => ({
      success: (text, ms) => push('success', text, ms),
      error: (text, ms) => push('error', text, ms ?? 7000),
      info: (text, ms) => push('info', text, ms),
    }),
    [push],
  )
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="false">
        {items.map((item) => {
          const Icon = item.tone === 'success' ? CircleCheck : item.tone === 'error' ? CircleAlert : Info
          return (
            <div key={item.id} className={`toast ${item.tone}`} role={item.tone === 'error' ? 'alert' : 'status'}>
              <Icon size={18} aria-hidden="true" />
              <span>{item.text}</span>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
