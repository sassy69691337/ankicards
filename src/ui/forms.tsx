import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from './cn'

export const inputCls =
  'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-fg outline-none transition placeholder:text-muted/70 focus:border-accent focus:ring-4 focus:ring-accent/15'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(inputCls, className)} {...props} />
}

export function AutoTextarea({
  className,
  value,
  inputRef,
  ...props
}: ComponentProps<'textarea'> & { inputRef?: (el: HTMLTextAreaElement | null) => void }) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [value])
  return (
    <textarea
      ref={(el) => {
        ref.current = el
        inputRef?.(el)
      }}
      rows={1}
      value={value}
      className={cn(inputCls, 'min-h-12 resize-none leading-snug', className)}
      {...props}
    />
  )
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className={cn('relative', className)}>
      <select className={cn(inputCls, 'appearance-none pr-10')} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-7 w-12 shrink-0 rounded-full transition', checked ? 'bg-accent' : 'bg-line')}
    >
      <span
        className={cn(
          'absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow transition-transform',
          checked && 'translate-x-5',
        )}
      />
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string; icon?: ReactNode }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition [&_svg]:size-4',
            value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, hint, children, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-muted">
        {label}
      </label>
      {children}
      {hint && <div className="mt-1.5 text-xs text-muted">{hint}</div>}
    </div>
  )
}

/** Строка настроек: подпись слева, контрол справа */
export function FormRow({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[15px]">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

export function NumberInput({
  value,
  onChange,
  min = 0,
  max = 99999,
  suffix,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  suffix?: string
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  return (
    <div className="relative w-28 shrink-0">
      <input
        type="number"
        inputMode="decimal"
        value={text}
        min={min}
        max={max}
        onChange={(e) => {
          setText(e.target.value)
          const v = parseFloat(e.target.value.replace(',', '.'))
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)))
        }}
        onBlur={() => setText(String(value))}
        className={cn(inputCls, 'py-2 text-right tabular-nums', suffix && 'pr-9')}
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">{suffix}</span>}
    </div>
  )
}
