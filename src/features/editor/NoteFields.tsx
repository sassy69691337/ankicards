import { useRef } from 'react'
import { Brackets } from 'lucide-react'
import type { NoteType } from '../../db/types'
import { clozeNumbers } from '../../core/template'
import { AutoTextarea } from '../../ui/forms'

/** Поля заметки: значения — текст для textarea (переносы строк вместо <br>) */
export function NoteFields({
  noteType,
  values,
  onChange,
  onSubmit,
  autoFocus,
  firstRef,
  warning,
}: {
  noteType: NoteType
  values: string[]
  onChange: (v: string[]) => void
  onSubmit?: () => void
  autoFocus?: boolean
  firstRef?: (el: HTMLTextAreaElement | null) => void
  warning?: string | null
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
      {noteType.fields.map((name, i) => (
        <div key={`${noteType.id}-${i}`}>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label htmlFor={`field-${i}`} className="text-sm font-medium text-muted">
              {name}
            </label>
            {noteType.kind === 'cloze' && i === 0 && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={wrapCloze}
                className="inline-flex items-center gap-1 rounded-lg bg-accent-soft px-2 py-1 text-xs font-semibold text-accent"
              >
                <Brackets className="size-3.5" />
                Пропуск
              </button>
            )}
          </div>
          <AutoTextarea
            id={`field-${i}`}
            value={values[i] ?? ''}
            autoFocus={autoFocus && i === 0}
            inputRef={(el) => {
              refs.current[i] = el
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
          />
          {i === 0 && warning && <p className="mt-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">{warning}</p>}
        </div>
      ))}
    </div>
  )
}
