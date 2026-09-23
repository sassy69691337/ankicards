import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from './cn'

export function ListGroup({ title, footer, children, className }: { title?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      {title && <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h2>}
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">{children}</div>
      {footer && <p className="mt-2 px-1 text-xs text-muted">{footer}</p>}
    </section>
  )
}

export function ListRow({
  icon,
  label,
  hint,
  value,
  to,
  onClick,
  danger,
}: {
  icon?: ReactNode
  label: ReactNode
  hint?: ReactNode
  value?: ReactNode
  to?: string
  onClick?: () => void
  danger?: boolean
}) {
  const body = (
    <>
      {icon && <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 [&_svg]:size-[18px]', danger ? 'text-red-500' : 'text-accent')}>{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[15px]', danger && 'text-red-600 dark:text-red-400')}>{label}</span>
        {hint && <span className="block truncate text-xs text-muted">{hint}</span>}
      </span>
      {value !== undefined && <span className="shrink-0 text-[15px] tabular-nums text-muted">{value}</span>}
      {(to || onClick) && !danger && <ChevronRight className="size-4 shrink-0 text-muted/60" />}
    </>
  )
  const cls = 'flex w-full items-center gap-3 px-4 py-3 text-left transition'
  if (to) return <Link to={to} className={cn(cls, 'hover:bg-surface-2 active:bg-surface-2')}>{body}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={cn(cls, 'hover:bg-surface-2 active:bg-surface-2')}>{body}</button>
  return <div className={cls}>{body}</div>
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-line px-6 py-12 text-center">
      <div className="mb-4 grid size-16 place-items-center rounded-2xl bg-accent-soft text-accent [&_svg]:size-8">{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {text && <p className="mt-1 max-w-xs text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
