import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { IconButton } from './Button'
import { cn } from './cn'

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
  large,
}: {
  title: ReactNode
  subtitle?: ReactNode
  back?: string
  actions?: ReactNode
  large?: boolean
}) {
  const nav = useNavigate()
  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className={cn('mx-auto flex max-w-2xl items-center gap-1 px-2', large ? 'h-16' : 'h-14')}>
        {back ? (
          <IconButton label="Назад" onClick={() => nav(back)}>
            <ChevronLeft />
          </IconButton>
        ) : (
          <div className="w-2" />
        )}
        <div className="min-w-0 flex-1 px-1">
          <h1 className={cn('truncate font-bold tracking-tight', large ? 'text-[26px]' : 'text-[17px] font-semibold')}>
            {title}
          </h1>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-0.5">{actions}</div>
      </div>
    </header>
  )
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto max-w-2xl space-y-5 px-4 pb-8 pt-4', className)}>{children}</div>
}
