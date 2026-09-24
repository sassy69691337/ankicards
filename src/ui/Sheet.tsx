import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from './cn'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Модальный лист: снизу на телефоне, по центру на широком экране.
 * Фокус удерживается внутри и возвращается к вызвавшему элементу; Escape закрывает
 */
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
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  const titleId = useId()
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const el = panel.current
    const first = el?.querySelector<HTMLElement>('[autofocus], input, textarea, select') ?? el
    first?.focus({ preventScroll: true })

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      } else if (e.key === 'Tab' && el) {
        const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null)
        if (!items.length) return
        const a = items[0]
        const z = items[items.length - 1]
        if (e.shiftKey && (document.activeElement === a || document.activeElement === el)) {
          e.preventDefault()
          z.focus()
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault()
          a.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prev
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-[rgb(20_20_24/0.42)]" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          'glass relative max-h-[92dvh] w-full animate-sheet-in overflow-y-auto rounded-t-[30px] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2.5 outline-none sm:max-w-md sm:rounded-[30px] sm:pb-5 sm:pt-5',
          className,
        )}
      >
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-line sm:hidden" aria-hidden />
        {title && (
          <div className="mb-4 flex items-start gap-2">
            <h2 id={titleId} className="min-w-0 flex-1 pt-2 text-[20px] font-semibold leading-[26px]">
              {title}
            </h2>
            <button
              type="button"
              aria-label="Закрыть"
              onClick={onClose}
              className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg"
            >
              <X className="size-5" />
            </button>
          </div>
        )}
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

/** Меню действий. Опасные действия отделены от безопасных */
export function ActionSheet({ open, onClose, title, actions }: { open: boolean; onClose: () => void; title?: ReactNode; actions: SheetAction[] }) {
  const safe = actions.filter((a) => !a.danger)
  const danger = actions.filter((a) => a.danger)
  const item = (a: SheetAction) => (
    <button
      key={a.label}
      type="button"
      onClick={() => {
        onClose()
        a.onSelect()
      }}
      className={cn(
        'flex min-h-13 w-full items-center gap-3 rounded-[16px] px-3 text-left text-base font-medium transition hover:bg-surface-2 active:bg-surface-2 [&_svg]:size-5 [&_svg]:shrink-0',
        a.danger ? 'text-danger' : 'text-fg [&_svg]:text-muted',
      )}
    >
      {a.icon}
      {a.label}
    </button>
  )
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="-mx-2">
        {safe.map(item)}
        {danger.length > 0 && <div className="mx-3 my-2 h-px bg-line" role="separator" />}
        {danger.map(item)}
      </div>
    </Sheet>
  )
}
