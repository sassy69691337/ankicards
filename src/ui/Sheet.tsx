import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from './cn'

/** Модальное окно: снизу на телефоне, по центру на широком экране */
export function Sheet({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  className?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative max-h-[92dvh] w-full animate-sheet-in overflow-y-auto rounded-t-3xl bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-3 shadow-2xl sm:max-w-md sm:rounded-3xl sm:pb-5 sm:pt-5',
          className,
        )}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line sm:hidden" />
        {title && <h2 className="mb-4 text-lg font-semibold">{title}</h2>}
        {children}
      </div>
    </div>,
    document.body,
  )
}

export interface SheetAction {
  label: string
  icon?: ReactNode
  danger?: boolean
  onSelect: () => void
}

export function ActionSheet({ open, onClose, title, actions }: { open: boolean; onClose: () => void; title?: ReactNode; actions: SheetAction[] }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="-mx-2 flex flex-col">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={() => {
              onClose()
              a.onSelect()
            }}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-medium transition hover:bg-surface-2 active:bg-surface-2 [&_svg]:size-5',
              a.danger ? 'text-red-600 dark:text-red-400' : 'text-fg [&_svg]:text-muted',
            )}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>
    </Sheet>
  )
}
