import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface SheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Label for screen readers. */
  label: string
  /** Dim and block the page behind (default true). */
  modal?: boolean
}

/** Bottom sheet: content sits in the thumb zone. */
export function Sheet({ open, onClose, children, label, modal = true }: SheetProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {modal && (
            <motion.div
              className="fixed inset-0 z-40 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
          )}
          <motion.div
            role="dialog"
            aria-label={label}
            className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto max-h-[88dvh] max-w-lg overflow-y-auto rounded-t-3xl border-t border-line bg-surface px-4 pt-3 pb-4"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', duration: 0.22 }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
