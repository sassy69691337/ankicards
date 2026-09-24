import { useEffect, useId, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { ChevronDown, CircleAlert, Plus, Search, X } from 'lucide-react'
import { cn } from './cn'

/** Поле ввода: непрозрачное, высота от 52 px, радиус 14 px */
export const inputCls =
  'w-full min-h-13 rounded-[14px] border border-input bg-surface px-4 py-3 text-base leading-6 text-fg outline-none transition placeholder:text-muted focus:border-accent-text focus:ring-4 focus:ring-accent/20 disabled:opacity-50 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15'

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
      className={cn(inputCls, 'resize-none', className)}
      {...props}
    />
  )
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className={cn('relative shrink-0', className)}>
      <select className={cn(inputCls, 'appearance-none truncate pr-11')} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
    </div>
  )
}

export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label?: string; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-8 w-[52px] shrink-0 rounded-full border transition duration-200',
        checked ? 'border-accent bg-accent' : 'border-input bg-surface-2',
      )}
    >
      <span
        className={cn(
          'absolute left-[3px] top-[3px] size-6 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-200',
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
  label,
}: {
  value: T
  options: { value: T; label: string; icon?: ReactNode }[]
  onChange: (v: T) => void
  label?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-[16px] bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[12px] px-2 text-[15px] font-medium leading-5 transition [&_svg]:size-4 [&_svg]:shrink-0',
            value === o.value ? 'bg-surface text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Ошибка под полем: иконка + текст, не заменяет подпись */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-danger">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
  htmlFor?: string
  className?: string
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-muted">
        {label}
      </label>
      {children}
      {error ? <FieldError id={htmlFor ? `${htmlFor}-error` : undefined}>{error}</FieldError> : hint && <div className="mt-1.5 text-sm text-muted">{hint}</div>}
    </div>
  )
}

/** Строка настроек: короткое значение справа; `stacked` — длинный контрол отдельной строкой под подписью */
export function FormRow({ label, hint, children, stacked, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; stacked?: boolean; htmlFor?: string }) {
  const title = htmlFor ? (
    <label htmlFor={htmlFor} className="block text-base leading-6">
      {label}
    </label>
  ) : (
    <div className="text-base leading-6">{label}</div>
  )
  if (stacked) {
    return (
      <div className="px-4 py-3">
        {title}
        {hint && <div className="mt-0.5 text-sm text-muted">{hint}</div>}
        <div className="mt-2.5">{children}</div>
      </div>
    )
  }
  return (
    <div className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
      <div className="min-w-[45%] flex-1">
        {title}
        {hint && <div className="mt-0.5 text-sm text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

/**
 * Числовое поле с видимой единицей. Значение вне диапазона не применяется:
 * поле подсвечивается, под ним — допустимый диапазон
 */
export function NumberInput({
  value,
  onChange,
  min = 0,
  max = 99999,
  suffix,
  label,
  id,
  integer = true,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  suffix?: string
  label?: string
  id?: string
  integer?: boolean
}) {
  const [text, setText] = useState(String(value))
  const [invalid, setInvalid] = useState(false)
  const errId = useId()
  useEffect(() => {
    setText(String(value))
    setInvalid(false)
  }, [value])
  return (
    <div className="shrink-0">
      <div className="relative w-32">
        <input
          id={id}
          type="text"
          inputMode={integer ? 'numeric' : 'decimal'}
          aria-label={label}
          aria-invalid={invalid}
          aria-describedby={invalid ? errId : undefined}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            const v = parseFloat(e.target.value.replace(',', '.'))
            const ok = /^\s*\d+([.,]\d+)?\s*$/.test(e.target.value) && Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isInteger(v))
            setInvalid(!ok)
            if (ok) onChange(v)
          }}
          onBlur={() => {
            setText(String(value))
            setInvalid(false)
          }}
          className={cn(inputCls, 'min-h-12 py-2.5 text-right tabular-nums', suffix ? 'pr-12 pl-3' : 'px-3')}
        />
        {suffix && <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[15px] text-muted">{suffix}</span>}
      </div>
      {invalid && (
        <p id={errId} className="mt-1 max-w-32 text-right text-xs font-medium text-danger">
          {min}–{max}
          {integer ? ', целое' : ''}
        </p>
      )}
    </div>
  )
}

/** Метки чипами. Пробел, Enter или вставка строки с пробелами разбивают ввод на метки — как прежде */
export function TagInput({ value, onChange, id, placeholder = 'Новая метка' }: { value: string; onChange: (v: string) => void; id?: string; placeholder?: string }) {
  const tags = value.split(/\s+/).filter(Boolean)
  const [draft, setDraft] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const commit = (text: string) => {
    const add = text.split(/\s+/).filter(Boolean)
    if (!add.length) return
    const next = [...tags]
    for (const t of add) if (!next.includes(t)) next.push(t)
    onChange(next.join(' '))
  }

  return (
    <div
      className="flex min-h-13 flex-wrap items-center gap-2 rounded-[14px] border border-input bg-surface px-2.5 py-2 transition focus-within:border-accent-text focus-within:ring-4 focus-within:ring-accent/20"
      onClick={() => input.current?.focus()}
    >
      {tags.map((t) => (
        <span key={t} className="inline-flex min-h-9 items-center gap-0.5 rounded-full bg-accent-soft pl-3 text-[15px] font-medium text-accent-text">
          {t}
          <button
            type="button"
            aria-label={`Удалить метку ${t}`}
            onClick={(e) => {
              e.stopPropagation()
              onChange(tags.filter((x) => x !== t).join(' '))
            }}
            className="grid size-9 place-items-center rounded-full hover:bg-accent/15"
          >
            <X className="size-4" />
          </button>
        </span>
      ))}
      <input
        ref={input}
        id={id}
        value={draft}
        placeholder={tags.length ? '' : placeholder}
        autoCapitalize="off"
        autoCorrect="off"
        enterKeyHint="done"
        onChange={(e) => {
          const v = e.target.value
          if (/\s/.test(v)) {
            commit(v)
            setDraft('')
          } else setDraft(v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft) {
            e.preventDefault()
            commit(draft)
            setDraft('')
          } else if (e.key === 'Backspace' && !draft && tags.length) {
            onChange(tags.slice(0, -1).join(' '))
          }
        }}
        onBlur={() => {
          if (draft) {
            commit(draft)
            setDraft('')
          }
        }}
        className="min-h-9 min-w-24 flex-1 bg-transparent px-1.5 text-base text-fg outline-none placeholder:text-muted"
      />
      {draft && (
        <button
          type="button"
          aria-label="Добавить метку"
          onClick={() => {
            commit(draft)
            setDraft('')
          }}
          className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2"
        >
          <Plus className="size-5" />
        </button>
      )}
    </div>
  )
}

/** Поле поиска: иконка, явная очистка */
export function SearchField({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder?: string; label: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoCapitalize="off"
        autoCorrect="off"
        enterKeyHint="search"
        className={cn(inputCls, 'border-transparent bg-surface-2 pl-12 pr-12 [&::-webkit-search-cancel-button]:hidden')}
      />
      {value && (
        <button
          type="button"
          aria-label="Очистить поиск"
          onClick={() => onChange('')}
          className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-muted hover:text-fg"
        >
          <X className="size-5" />
        </button>
      )}
    </div>
  )
}

/** Фильтр-чип: нативный список поверх чипа — работает с клавиатурой и диктором */
export function FilterChip({
  label,
  value,
  onChange,
  children,
  active,
  display,
}: {
  label: string
  value: string | number
  onChange: (v: string) => void
  children: ReactNode
  active?: boolean
  display: ReactNode
}) {
  return (
    <div
      className={cn(
        'relative inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border px-4 text-[15px] font-medium transition focus-within:ring-4 focus-within:ring-accent/25',
        active ? 'border-accent-text/40 bg-accent-soft text-accent-text' : 'border-line bg-surface text-fg',
      )}
    >
      <span className="truncate">{display}</span>
      <ChevronDown className="size-4 shrink-0" aria-hidden />
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer appearance-none opacity-0">
        {children}
      </select>
    </div>
  )
}
