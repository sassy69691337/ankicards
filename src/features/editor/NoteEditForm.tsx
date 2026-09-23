import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { isDuplicate, updateNote } from '../../db/collection'
import { cardsWord, errMsg } from '../../core/format'
import { fromEditor, parseTags, toEditor } from '../../core/text'
import { Field, Input } from '../../ui/forms'
import { Button } from '../../ui/Button'
import { toast } from '../../ui/toast'
import { NoteFields } from './NoteFields'

/** Редактирование полей и меток существующей заметки */
export function NoteEditForm({ noteId, onSaved, onCancel }: { noteId: number; onSaved?: () => void; onCancel?: () => void }) {
  const data = useLiveQuery(async () => {
    const note = await db.notes.get(noteId)
    if (!note) return null
    const nt = await db.noteTypes.get(note.noteTypeId)
    return nt ? { note, nt } : null
  }, [noteId])
  const [values, setValues] = useState<string[] | null>(null)
  const [tags, setTags] = useState('')
  const [busy, setBusy] = useState(false)

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

  async function save() {
    if (!data || !values || busy) return
    setBusy(true)
    try {
      const fields = data.nt.fields.map((_, i) => fromEditor((values[i] ?? '').trim()))
      const added = await updateNote(noteId, fields, parseTags(tags))
      toast(added ? `Сохранено, новых: ${added} ${cardsWord(added)}` : 'Сохранено')
      onSaved?.()
    } catch (e) {
      toast(errMsg(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      className="space-y-4"
    >
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{data.nt.name}</p>
      <NoteFields noteType={data.nt} values={values} onChange={setValues} onSubmit={() => void save()} warning={dup ? 'Такая карточка уже есть' : null} />
      <Field label="Метки" htmlFor="edit-tags">
        <Input id="edit-tags" value={tags} onChange={(e) => setTags(e.target.value)} autoCapitalize="off" />
      </Field>
      <div className="flex gap-2 pt-1">
        {onCancel && (
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Отмена
          </Button>
        )}
        <Button type="submit" className="flex-1" disabled={busy}>
          Сохранить
        </Button>
      </div>
    </form>
  )
}
