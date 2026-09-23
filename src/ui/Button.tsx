import type { ComponentProps } from 'react'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg shadow-sm shadow-accent/25 hover:bg-accent-hover',
  secondary: 'border border-line bg-surface text-fg hover:bg-surface-2',
  soft: 'bg-accent-soft text-accent hover:brightness-95 dark:hover:brightness-125',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'bg-red-500/10 text-red-600 hover:bg-red-500/15 dark:text-red-400',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm rounded-lg',
  md: 'h-11 px-4 text-[15px] rounded-xl',
  lg: 'h-13 px-6 text-base rounded-2xl',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ComponentProps<'button'> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}

export function IconButton({ label, className, type = 'button', ...props }: ComponentProps<'button'> & { label: string }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-grid size-10 shrink-0 place-items-center rounded-full text-fg transition hover:bg-surface-2 active:scale-95 disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-[22px]',
        className,
      )}
      {...props}
    />
  )
}
