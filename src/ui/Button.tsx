import type { ComponentProps } from 'react'
import { LoaderCircle } from 'lucide-react'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  // На коралловой заливке — графитовый текст (контраст ≥ 4.5:1)
  primary: 'bg-accent text-accent-fg shadow-[0_6px_16px_-6px_color-mix(in_srgb,var(--accent)_60%,transparent)] hover:bg-accent-hover',
  secondary: 'border border-line bg-surface text-fg hover:bg-surface-2',
  soft: 'bg-accent-soft text-accent-text hover:brightness-[0.97] dark:hover:brightness-110',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'bg-danger-soft text-danger hover:brightness-[0.97] dark:hover:brightness-110',
}

const sizes: Record<Size, string> = {
  sm: 'min-h-11 px-3.5 text-[15px] rounded-[14px]',
  md: 'min-h-12 px-4 text-base rounded-[16px]',
  lg: 'min-h-13 px-6 text-[17px] rounded-[18px]',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  type = 'button',
  disabled,
  children,
  ...props
}: ComponentProps<'button'> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 py-2 text-center font-semibold leading-tight transition duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <LoaderCircle className="size-5 shrink-0 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

/** Круглая кнопка-иконка: зона касания 44×44 */
export function IconButton({
  label,
  className,
  type = 'button',
  variant = 'plain',
  ...props
}: ComponentProps<'button'> & { label: string; variant?: 'plain' | 'surface' | 'accent' }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-grid size-11 shrink-0 place-items-center rounded-full transition duration-150 active:scale-95 disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-[22px]',
        variant === 'plain' && 'text-fg hover:bg-surface-2',
        variant === 'surface' && 'border border-line bg-surface text-fg shadow-sm hover:bg-surface-2',
        variant === 'accent' && 'bg-accent text-accent-fg shadow-[0_6px_16px_-6px_color-mix(in_srgb,var(--accent)_70%,transparent)] hover:bg-accent-hover',
        className,
      )}
      {...props}
    />
  )
}
