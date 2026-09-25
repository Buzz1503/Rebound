import { motion } from 'framer-motion'
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

interface ToastInput {
  message: string
  /** When present, the toast shows an Undo button. */
  undo?: () => void | Promise<void>
}

interface ToastItem extends ToastInput {
  id: number
}

const ToastContext = createContext<(t: ToastInput) => void>(() => undefined)

export function useToast(): (t: ToastInput) => void {
  return useContext(ToastContext)
}

const DURATION_MS = 5000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const seq = useRef(0)

  const show = useCallback((t: ToastInput) => {
    window.clearTimeout(timer.current)
    const id = ++seq.current
    setToast({ ...t, id })
    timer.current = window.setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), DURATION_MS)
  }, [])

  const undo = async () => {
    const t = toast
    setToast(null)
    await t?.undo?.()
  }

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+8px)] z-50 flex justify-center px-4">
        {toast && (
            <motion.div
              key={toast.id}
              role="status"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-line bg-surface-2 py-2 pr-2 pl-4 shadow-lg"
            >
              <span className="flex-1 text-sm">{toast.message}</span>
              {toast.undo && (
                <button onClick={() => void undo()} className="min-h-12 rounded-xl px-4 font-semibold text-accent">
                  Undo
                </button>
              )}
            </motion.div>
          )}
      </div>
    </ToastContext.Provider>
  )
}
