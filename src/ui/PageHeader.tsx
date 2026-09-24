import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { IconButton } from './Button'
import { cn } from './cn'

function useScrolled() {
  const [scrolled, setScrolled] = useState(() => typeof window !== 'undefined' && window.scrollY > 4)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return scrolled
}

/**
 * Шапка экрана. `large` — вкладка верхнего уровня: заголовок 30/36 слева.
 * Иначе — кнопка «Назад» и заголовок по центру. Стекло появляется только при прокрутке
 */
export function PageHeader({
  title,
  subtitle,
  back,
  onBack,
  actions,
  large,
}: {
  title: ReactNode
  subtitle?: ReactNode
  back?: string
  onBack?: () => void
  actions?: ReactNode
  large?: boolean
}) {
  const nav = useNavigate()
  const scrolled = useScrolled()
  return (
    <header
      className={cn(
        'sticky top-0 z-30 border-x-0 border-t-0 pt-[env(safe-area-inset-top)] transition-[background-color,box-shadow,border-color] duration-200',
        scrolled ? 'glass !rounded-none !border-x-0 !border-t-0' : 'border-b border-transparent bg-bg',
      )}
    >
      {large ? (
        <div className="mx-auto flex min-h-16 max-w-[720px] items-center gap-2 px-4 py-2 min-[360px]:px-5">
          <div className="min-w-0 flex-1">
            <h1 className="text-[30px] font-bold leading-9 tracking-tight">{title}</h1>
            {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      ) : (
        <div className="mx-auto grid min-h-15 max-w-[720px] grid-cols-[minmax(44px,auto)_1fr_minmax(44px,auto)] items-center gap-2 px-3 py-1.5 min-[360px]:px-4">
          <div className="flex">
            {(back || onBack) && (
              <IconButton label="Назад" variant="surface" onClick={() => (onBack ? onBack() : nav(back!))}>
                <ChevronLeft />
              </IconButton>
            )}
          </div>
          <div className="min-w-0 text-center">
            <h1 className="line-clamp-2 text-[17px] font-semibold leading-[22px]">{title}</h1>
            {subtitle && <p className="truncate text-[13px] text-muted">{subtitle}</p>}
          </div>
          <div className="flex justify-end gap-1">{actions}</div>
        </div>
      )}
    </header>
  )
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto max-w-[720px] space-y-6 px-4 pb-6 pt-2 min-[360px]:px-5', className)}>{children}</div>
}

/** Закреплённое основное действие над нижней навигацией (или над клавиатурой) */
export function StickyActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-[var(--tabbar-space)] z-20 -mx-1 space-y-2 rounded-[22px] px-1 pb-1 pt-2">
      {children}
    </div>
  )
}
