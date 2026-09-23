import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from 'lucide-react'
import { db } from '../../db/db'
import { addNote, isDuplicate } from '../../db/collection'
import { cardsWord, errMsg } from '../../core/format'
import { fromEditor, parseTags } from '../../core/text'
import { PageBody, PageHeader } from '../../ui/PageHeader'
import { Field, Input, Select } from '../../ui/forms'
import { Button } from '../../ui/Button'
import { toast } from '../../ui/toast'
import { NoteFields } from './NoteFields'
import { DeckOptionsList } from './DeckSelect'

const pref = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const savePref = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    // не критично
  }
}

export default function AddNotePage() {
  const [params] = useSearchParams()
  const noteTypes = useLiveQuery(() => db.noteTypes.toArray(), [])
  const decks = useLiveQuery(() => db.decks.toArray(), [])
  const [ntId, setNtId] = useState(() => Number(pref('add.nt')) || 0)
  const [deckId, setDeckId] = useState(() => Number(params.get('deck')) || Number(pref('add.deck')) || 0)
  const [values, setValues] = useState<string[]>([])
  const [tags, setTags] = useState(() => pref('add.tags') ?? '')
  const [busy, setBusy] = useState(false)
  const firstField = useRef<HTMLTextAreaElement | null>(null)

  const nt = noteTypes?.find((n) => n.id === ntId) ?? noteTypes?.[0]
  const deck = decks?.find((d) => d.id === deckId) ?? decks?.reduce<(typeof decks)[number] | undefined>((m, d) => (!m || d.id < m.id ? d : m), undefined)
  const first = values[0] ?? ''
  const dup = useLiveQuery(async () => (nt && first.trim() ? isDuplicate(nt.id, fromEditor(first)) : false), [nt?.id, first])

  async function submit() {
    if (!nt || !deck || busy) return
    setBusy(true)
    try {
      const fields = nt.fields.map((_, i) => fromEditor((values[i] ?? '').trim()))
      const res = await addNote(nt, deck.id, fields, parseTags(tags))
      savePref('add.nt', String(nt.id))
      savePref('add.deck', String(deck.id))
      savePref('add.tags', tags)
      toast(`Добавлено: ${res.cards} ${cardsWord(res.cards)}`)
      setValues([])
      firstField.current?.focus()
    } catch (e) {
      toast(errMsg(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!nt || !deck || !decks) return <PageHeader large title="Добавить" />

  return (
    <>
      <PageHeader large title="Добавить" />
      <PageBody>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
          className="space-y-5"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Тип" htmlFor="nt">
              <Select id="nt" value={nt.id} onChange={(e) => setNtId(Number(e.target.value))}>
                {noteTypes!.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Колода" htmlFor="deck">
              <Select id="deck" value={deck.id} onChange={(e) => setDeckId(Number(e.target.value))}>
                <DeckOptionsList decks={decks} />
              </Select>
            </Field>
          </div>

          <div className="rounded-3xl border border-line bg-surface p-4">
            <NoteFields
              noteType={nt}
              values={values}
              onChange={setValues}
              onSubmit={() => void submit()}
              firstRef={(el) => {
                firstField.current = el
              }}
              warning={dup ? 'Такая карточка уже есть' : null}
            />
          </div>

          <Field label="Метки" htmlFor="tags" hint="Через пробел. Запоминаются для следующих карточек.">
            <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="например: глаголы урок1" autoCapitalize="off" />
          </Field>

          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            <Plus className="size-5" />
            Добавить
          </Button>
          <p className="hidden text-center text-xs text-muted sm:block">Ctrl + Enter — добавить</p>
        </form>
      </PageBody>
    </>
  )
}
