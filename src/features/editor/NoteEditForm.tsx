import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { isDuplicate, updateNote } from '../../db/collection'
import { cardsWord, errMsg } from '../../core/format'
import { fromEditor, parseTags, toEditor } from '../../core/text'
import { Field, TagInput } from '../../ui/forms'
import { Button } from '../../ui/Button'
import { toast } from '../../ui/toast'
import { NoteFields, isFlagField, reverseOn, validateNote } from './NoteFields'

/** Редактирование полей и меток существующей заметки */
export function NoteEditForm({ noteId, onSaved, onCancel }: { noteId: number; onSaved?: () => void; onCancel?: () => void }) {
  const data = useLiveQuery(async () => {
    const note = await db.notes.get(noteId)
    if (!note) return null
    const [nt, reverseCard] = await Promise.all([
      db.noteTypes.get(note.noteTypeId),
      db.cards.where('noteId').equals(noteId).filter((c) => c.ord === 1).count(),
    ])
    return nt ? { note, nt, hasReverse: reverseCard > 0 } : null
  }, [noteId])
  const [values, setValues] = useState<string[] | null>(null)
  const [tags, setTags] = useState('')
  const [errors, setErrors] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const fieldRefs = useRef<(HTMLElement | null)[]>([])

  useEffect(() => {
    if (data && values === null) {
      setValues(data.note.fields.map(toEditor))
      setTags(data.note.tags.join(' '))
    }
  }, [data, values])

  const first = values?.[0] ?? ''
  const dup = useLiveQuery(
    async () => (data && first.trim() ? isDuplicate(data.nt.id, fromEditor(first), noteId) : false),
    [data?.nt.id, first, noteId],
  )

  if (data === null) return <p className="text-muted">Заметка не найдена.</p>
  if (!data || !values) return null

  const flagIdx = data.nt.fields.findIndex(isFlagField)
  const reverseKept = flagIdx >= 0 && data.hasReverse && !reverseOn(data.nt.fields[flagIdx], values[flagIdx] ?? '')

  async function save() {
    if (!data || !values || busy) return
    const errs = validateNote(data.nt, values)
    setErrors(errs)
    const firstBad = Object.keys(errs).map(Number).sort((a, b) => a - b)[0]
    if (firstBad !== undefined) {
      fieldRefs.current[firstBad]?.focus()
      return
    }
    setBusy(true)
    try {
      const fields = data.nt.fields.map((_, i) => fromEditor((values[i] ?? '').trim()))
      const added = await updateNote(noteId, fields, parseTags(tags))
      toast(added ? `Сохранено, новых: ${added} ${cardsWord(added)}` : 'Сохранено')
      onSaved?.()
    } catch (e) {
      toast(`Не сохранено: ${errMsg(e)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      className="space-y-4"
    >
      <p className="text-sm font-medium text-muted">Тип: {data.nt.name}</p>
      <NoteFields
        noteType={data.nt}
        values={values}
        onChange={(v) => {
          setValues(v)
          if (Object.keys(errors).length) setErrors(validateNote(data.nt, v))
        }}
        onSubmit={() => void save()}
        errors={errors}
        fieldRefs={fieldRefs}
        warning={dup ? 'Такое слово уже есть' : null}
        reverseHint={reverseKept ? 'Обратная карточка уже создана и останется. Её можно приостановить в списке карточек заметки.' : null}
      />
      <Field label="Метки" htmlFor="edit-tags">
        <TagInput id="edit-tags" value={tags} onChange={setTags} />
      </Field>
      <div className="flex gap-2 pt-1">
        {onCancel && (
          <Button variant="secondary" size="lg" className="flex-1" onClick={onCancel}>
            Отмена
          </Button>
        )}
        <Button type="submit" size="lg" className="flex-1" loading={busy}>
          Сохранить
        </Button>
      </div>
    </form>
  )
}
