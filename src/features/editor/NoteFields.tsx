import { useRef, type RefObject } from 'react'
import { Brackets, TriangleAlert } from 'lucide-react'
import type { NoteType } from '../../db/types'
import { ADD_REVERSE_FIELD, NO_REVERSE_FIELD } from '../../db/defaults'
import { clozeNumbers } from '../../core/template'
import { AutoTextarea, FieldError, Switch } from '../../ui/forms'
import { cn } from '../../ui/cn'

const FLAG_ON = 'y'
export const isFlagField = (name: string) => name === NO_REVERSE_FIELD || name === ADD_REVERSE_FIELD
const MULTILINE = new Set(['Пример', 'Дополнительно', 'Текст'])

/** Включена ли обратная карточка по значению поля-флага */
export const reverseOn = (name: string, value: string) => (name === NO_REVERSE_FIELD ? !value.trim() : !!value.trim())
const reverseValue = (name: string, on: boolean) => (name === NO_REVERSE_FIELD ? (on ? '' : FLAG_ON) : on ? FLAG_ON : '')

/**
 * Обязательные поля: для пропусков — текст, для обычных типов — первые два поля
 * (слово и перевод). Строка из пробелов не считается заполненной
 */
export function validateNote(nt: NoteType, values: string[]): Record<number, string> {
  const errors: Record<number, string> = {}
  const required = nt.kind === 'cloze' ? [0] : nt.fields.map((f, i) => (isFlagField(f) ? -1 : i)).filter((i) => i >= 0).slice(0, 2)
  for (const i of required) {
    if (!(values[i] ?? '').trim()) errors[i] = `Заполните поле «${nt.fields[i]}»`
  }
  if (nt.kind === 'cloze' && !errors[0] && clozeNumbers(values[0] ?? '').length === 0) {
    errors[0] = 'Добавьте хотя бы один пропуск: {{c1::текст}}'
  }
  return errors
}

/** Поля заметки: значения — текст для textarea (переносы строк вместо <br>) */
export function NoteFields({
  noteType,
  values,
  onChange,
  onSubmit,
  autoFocus,
  firstRef,
  warning,
  errors = {},
  fieldRefs,
  reverseHint,
}: {
  noteType: NoteType
  values: string[]
  onChange: (v: string[]) => void
  onSubmit?: () => void
  autoFocus?: boolean
  firstRef?: (el: HTMLTextAreaElement | null) => void
  warning?: string | null
  errors?: Record<number, string>
  fieldRefs?: RefObject<(HTMLElement | null)[]>
  reverseHint?: string | null
}) {
  const refs = useRef<(HTMLTextAreaElement | null)[]>([])
  const lastFocused = useRef(0)

  const update = (i: number, v: string) => {
    const next = noteType.fields.map((_, k) => values[k] ?? '')
    next[i] = v
    onChange(next)
  }

  function wrapCloze() {
    const i = lastFocused.current
    const el = refs.current[i]
    const text = values[i] ?? ''
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const n = Math.max(0, ...clozeNumbers(values.join(' '))) + 1
    const selected = text.slice(start, end) || '...'
    const inserted = `{{c${n}::${selected}}}`
    update(i, text.slice(0, start) + inserted + text.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      const pos = start + inserted.length
      el?.setSelectionRange(pos, pos)
    })
  }

  return (
    <div className="space-y-4">
      {noteType.fields.map((name, i) => {
        const id = `field-${noteType.id}-${i}`
        if (isFlagField(name)) {
          return (
            <div key={id}>
              <div className="flex min-h-14 items-center gap-3 rounded-[18px] bg-surface-2/70 px-4 py-2">
                <label htmlFor={id} className="min-w-0 flex-1 text-base leading-6">
                  Создать обратную карточку
                </label>
                <Switch
                  id={id}
                  checked={reverseOn(name, values[i] ?? '')}
                  onChange={(on) => update(i, reverseValue(name, on))}
                />
              </div>
              {reverseHint && <p className="mt-1.5 px-1 text-sm text-muted">{reverseHint}</p>}
            </div>
          )
        }
        const err = errors[i]
        return (
          <div key={id}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label htmlFor={id} className="text-sm font-medium text-muted">
                {name}
              </label>
              {noteType.kind === 'cloze' && i === 0 && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={wrapCloze}
                  className="inline-flex min-h-9 items-center gap-1 rounded-full bg-accent-soft px-3 text-sm font-semibold text-accent-text"
                >
                  <Brackets className="size-4" />
                  Пропуск
                </button>
              )}
            </div>
            <AutoTextarea
              id={id}
              value={values[i] ?? ''}
              autoFocus={autoFocus && i === 0}
              aria-invalid={!!err}
              aria-describedby={err ? `${id}-error` : undefined}
              enterKeyHint={MULTILINE.has(name) || i >= 2 ? 'enter' : 'next'}
              inputRef={(el) => {
                refs.current[i] = el
                if (fieldRefs?.current) fieldRefs.current[i] = el
                if (i === 0) firstRef?.(el)
              }}
              onFocus={() => {
                lastFocused.current = i
              }}
              onChange={(e) => update(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  onSubmit?.()
                }
              }}
              className={cn(MULTILINE.has(name) || i >= 2 ? 'min-h-24' : '')}
            />
            {err && <FieldError id={`${id}-error`}>{err}</FieldError>}
            {i === 0 && warning && !err && (
              <p className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-warning">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {warning}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
