import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { X } from 'lucide-react'
import { db } from '../../db/db'
import { addNote, isDuplicate } from '../../db/collection'
import { cardsWord, errMsg, plural } from '../../core/format'
import { fromEditor, parseTags } from '../../core/text'
import { PageBody, PageHeader, StickyActions } from '../../ui/PageHeader'
import { Field, Select, TagInput } from '../../ui/forms'
import { Button, IconButton } from '../../ui/Button'
import { choiceDialog } from '../../ui/dialogs'
import { toast } from '../../ui/toast'
import { NoteFields, isFlagField, validateNote } from './NoteFields'
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

/** Черновик формы живёт вне компонента: переключение вкладок его не очищает */
interface Draft {
  ntId: number
  values: string[]
}
const DRAFT_KEY = 'add.draft'
let draft: Draft | null = (() => {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null') as Draft | null
  } catch {
    return null
  }
})()
function storeDraft(d: Draft | null) {
  draft = d
  try {
    if (d) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d))
    else sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    // не критично
  }
}

const notesWord = (n: number) => plural(n, ['заметка', 'заметки', 'заметок'])

export default function AddNotePage() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const noteTypes = useLiveQuery(() => db.noteTypes.toArray(), [])
  const decks = useLiveQuery(() => db.decks.toArray(), [])
  const [ntId, setNtId] = useState(() => Number(pref('add.nt')) || 0)
  const [deckId, setDeckId] = useState(() => Number(params.get('deck')) || Number(pref('add.deck')) || 0)
  const [values, setValuesState] = useState<string[]>(() => (draft && (!ntId || draft.ntId === ntId) ? draft.values : []))
  const [tags, setTags] = useState(() => pref('add.tags') ?? '')
  const [errors, setErrors] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const firstField = useRef<HTMLTextAreaElement | null>(null)
  const fieldRefs = useRef<(HTMLElement | null)[]>([])

  const nt = noteTypes?.find((n) => n.id === ntId) ?? noteTypes?.[0]
  const deck = decks?.find((d) => d.id === deckId) ?? decks?.reduce<(typeof decks)[number] | undefined>((m, d) => (!m || d.id < m.id ? d : m), undefined)
  const first = values[0] ?? ''
  const dup = useLiveQuery(async () => (nt && first.trim() ? isDuplicate(nt.id, fromEditor(first)) : false), [nt?.id, first])

  const setValues = (v: string[]) => {
    setValuesState(v)
    if (nt) storeDraft({ ntId: nt.id, values: v })
    if (Object.keys(errors).length) setErrors(nt ? pickStill(errors, validateNote(nt, v)) : {})
  }

  const hasText = (nt?.fields ?? []).some((f, i) => !isFlagField(f) && (values[i] ?? '').trim())

  async function submit(): Promise<boolean> {
    if (!nt || !deck || busy) return false
    const errs = validateNote(nt, values)
    setErrors(errs)
    const firstBad = Object.keys(errs).map(Number).sort((a, b) => a - b)[0]
    if (firstBad !== undefined) {
      fieldRefs.current[firstBad]?.focus()
      return false
    }
    setBusy(true)
    try {
      const fields = nt.fields.map((_, i) => fromEditor((values[i] ?? '').trim()))
      const res = await addNote(nt, deck.id, fields, parseTags(tags))
      savePref('add.nt', String(nt.id))
      savePref('add.deck', String(deck.id))
      savePref('add.tags', tags)
      toast(`Сохранено: 1 ${notesWord(1)}, ${res.cards} ${cardsWord(res.cards)}`)
      // Слово, перевод и пример очищаются; переключатель обратной карточки и метки остаются
      const kept = nt.fields.map((f, i) => (isFlagField(f) ? (values[i] ?? '') : ''))
      setValuesState(kept)
      storeDraft(null)
      firstField.current?.focus()
      return true
    } catch (e) {
      // Текст остаётся в форме — можно повторить
      toast(`Не сохранено: ${errMsg(e)}`, 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function close() {
    if (hasText) {
      const choice = await choiceDialog({
        title: 'Сохранить заметку?',
        message: 'В форме есть несохранённый текст.',
        choices: [
          { value: 'save', label: 'Сохранить' },
          { value: 'discard', label: 'Удалить черновик', variant: 'danger' },
        ],
      })
      if (choice === null) return
      if (choice === 'save' && !(await submit())) return
      if (choice === 'discard') {
        setValuesState([])
        storeDraft(null)
        setErrors({})
      }
    }
    nav('/')
  }

  const header = (
    <PageHeader
      large
      title="Добавить"
      actions={
        <IconButton label="Закрыть" variant="surface" onClick={() => void close()}>
          <X />
        </IconButton>
      }
    />
  )
  if (!nt || !deck || !decks) return header

  return (
    <>
      {header}
      <PageBody>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
          className="space-y-4"
        >
          <Field label="Колода" htmlFor="deck">
            <Select id="deck" value={deck.id} onChange={(e) => setDeckId(Number(e.target.value))}>
              <DeckOptionsList decks={decks} />
            </Select>
          </Field>
          {noteTypes!.length > 1 && (
            <Field label="Тип заметки" htmlFor="nt">
              <Select
                id="nt"
                value={nt.id}
                onChange={(e) => {
                  setNtId(Number(e.target.value))
                  setErrors({})
                }}
              >
                {noteTypes!.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <NoteFields
            noteType={nt}
            values={values}
            onChange={setValues}
            onSubmit={() => void submit()}
            firstRef={(el) => {
              firstField.current = el
            }}
            fieldRefs={fieldRefs}
            errors={errors}
            warning={dup ? 'Такое слово уже есть. Сохранить всё равно можно.' : null}
          />

          <Field label="Метки" htmlFor="tags" hint="Запоминаются для следующих карточек.">
            <TagInput id="tags" value={tags} onChange={setTags} placeholder="например: глаголы" />
          </Field>

          <StickyActions>
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              Сохранить
            </Button>
          </StickyActions>
          <p className="hidden text-center text-sm text-muted sm:block">Ctrl + Enter — сохранить</p>
        </form>
      </PageBody>
    </>
  )
}

/** Ошибки гаснут по мере заполнения полей, новые не появляются до следующей попытки */
function pickStill(prev: Record<number, string>, now: Record<number, string>): Record<number, string> {
  const out: Record<number, string> = {}
  for (const k of Object.keys(prev)) if (now[Number(k)]) out[Number(k)] = now[Number(k)]
  return out
}
