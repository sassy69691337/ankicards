import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from './cn'

/** Заголовок секции 20/26 */
export function SectionTitle({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <h2 id={id} className={cn('mb-2.5 px-1 text-[20px] font-semibold leading-[26px] tracking-tight', className)}>
      {children}
    </h2>
  )
}

/** Один контейнер на смысловую группу */
export function ListGroup({ title, footer, children, className }: { title?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      {title && <SectionTitle>{title}</SectionTitle>}
      <div className="divide-y divide-line overflow-hidden rounded-[24px] bg-surface shadow-[0_1px_2px_rgb(32_33_39/0.04)] ring-1 ring-line/70">{children}</div>
      {footer && <div className="mt-2 px-1 text-sm text-muted">{footer}</div>}
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
  disabled,
}: {
  icon?: ReactNode
  label: ReactNode
  hint?: ReactNode
  value?: ReactNode
  to?: string
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
}) {
  const body = (
    <>
      {icon && (
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-[12px] [&_svg]:size-5',
            danger ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent-text',
          )}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn('block text-base leading-6', danger && 'font-medium text-danger')}>{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </span>
      {value !== undefined && <span className="shrink-0 text-base tabular-nums text-muted">{value}</span>}
      {(to || onClick) && !danger && <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />}
    </>
  )
  const cls = 'flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition'
  const interactive = 'hover:bg-surface-2/70 active:bg-surface-2'
  if (to) return <Link to={to} className={cn(cls, interactive)}>{body}</Link>
  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={cn(cls, interactive, 'disabled:opacity-50')}>
        {body}
      </button>
    )
  }
  return <div className={cls}>{body}</div>
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[24px] bg-surface px-6 py-10 text-center ring-1 ring-line/70">
      <div className="mb-4 grid size-16 place-items-center rounded-[20px] bg-accent-soft text-accent-text [&_svg]:size-8">{icon}</div>
      <h3 className="text-[20px] font-semibold leading-[26px]">{title}</h3>
      {text && <p className="mt-1.5 max-w-xs text-[15px] leading-[22px] text-muted">{text}</p>}
      {action && <div className="mt-5 w-full max-w-xs">{action}</div>}
    </div>
  )
}

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'outline'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-fg',
  accent: 'bg-accent-soft text-accent-text',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  outline: 'text-muted ring-1 ring-inset ring-line',
}

export function StatusBadge({ tone = 'neutral', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex min-h-6 items-center whitespace-nowrap rounded-full px-2.5 text-[13px] font-medium leading-4', tones[tone], className)}>
      {children}
    </span>
  )
}

/** Прогресс: value 0..1; без value — неопределённый (без выдуманного процента) */
export function ProgressBar({ value, label, className }: { value?: number; label: string; className?: string }) {
  const pct = value === undefined ? undefined : Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn('h-2 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-line/60', className)}
    >
      {pct === undefined ? (
        <div className="h-full w-1/3 animate-slide rounded-full bg-accent" />
      ) : (
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
      )}
    </div>
  )
}

/** Сообщение-статус: иконка + текст, цвет не единственный признак */
export function Notice({ tone, icon, title, children, action }: { tone: 'warning' | 'danger' | 'success' | 'neutral'; icon: ReactNode; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      className={cn(
        'flex items-start gap-3 rounded-[20px] px-4 py-3.5 [&>svg]:mt-0.5 [&>svg]:size-5 [&>svg]:shrink-0',
        tone === 'warning' && 'bg-warning-soft text-warning',
        tone === 'danger' && 'bg-danger-soft text-danger',
        tone === 'success' && 'bg-success-soft text-success',
        tone === 'neutral' && 'bg-surface-2 text-fg',
      )}
    >
      {icon}
      <div className="min-w-0 flex-1 text-[15px] leading-[22px]">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={cn(title ? 'opacity-90' : '')}>{children}</div>}
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </div>
  )
}
