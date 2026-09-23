import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pause, Play, RotateCcw, Trash2 } from 'lucide-react'
import { db } from '../../db/db'
import { deleteNote, forgetCards, moveNoteCards, restoreCards, suspendCards } from '../../db/collection'
import { CardType, Queue, type Card, type NoteType } from '../../db/types'
import { schedTime } from '../../core/time'
import { formatDay } from '../../core/format'
import { PageBody, PageHeader } from '../../ui/PageHeader'
import { Field, Select } from '../../ui/forms'
import { Button } from '../../ui/Button'
import { ListGroup } from '../../ui/List'
import { confirmDialog } from '../../ui/dialogs'
import { toast } from '../../ui/toast'
import { cn } from '../../ui/cn'
import { NoteEditForm } from './NoteEditForm'
import { DeckOptionsList } from './DeckSelect'

export function cardStatus(c: Card): { label: string; cls: string } {
  if (c.queue === Queue.Suspended) return { label: 'Приостановлена', cls: 'text-muted' }
  if (c.queue < 0) return { label: 'Отложена', cls: 'text-muted' }
  if (c.type === CardType.New) return { label: 'Новая', cls: 'text-new' }
  if (c.queue === Queue.Learn || c.queue === Queue.DayLearn) return { label: 'Изучается', cls: 'text-learn' }
  const days = c.due - schedTime().today
  return { label: days <= 0 ? 'Повторить сегодня' : `Повтор ${formatDay(c.due)}`, cls: 'text-review' }
}

const cardName = (nt: NoteType | undefined, ord: number) =>
  nt?.kind === 'cloze' ? `Пропуск ${ord + 1}` : (nt?.templates[ord]?.name ?? `Карточка ${ord + 1}`)

export default function EditNotePage() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const [params] = useSearchParams()
  const back = params.get('back') ?? '/browse'
  const data = useLiveQuery(async () => {
    const note = await db.notes.get(id)
    if (!note) return null
    const [nt, cards, decks] = await Promise.all([
      db.noteTypes.get(note.noteTypeId),
      db.cards.where('noteId').equals(id).sortBy('ord'),
      db.decks.toArray(),
    ])
    return { note, nt, cards, decks }
  }, [id])

  if (data === null) {
    return (
      <>
        <PageHeader title="Заметка" back={back} />
        <PageBody>
          <p className="text-muted">Заметка не найдена.</p>
        </PageBody>
      </>
    )
  }

  async function onDelete() {
    const ok = await confirmDialog({
      title: 'Удалить заметку?',
      message: 'Будут удалены все её карточки и прогресс. Это нельзя отменить.',
      confirmText: 'Удалить',
      danger: true,
    })
    if (!ok) return
    await deleteNote(id)
    toast('Заметка удалена')
    nav(back)
  }

  const deckId = data?.cards[0]?.deckId

  return (
    <>
      <PageHeader title="Редактирование" back={back} />
      <PageBody>
        <div className="rounded-3xl border border-line bg-surface p-4">
          <NoteEditForm noteId={id} onSaved={() => nav(back)} />
        </div>

        {data && data.cards.length > 0 && (
          <>
            <Field label="Колода" htmlFor="note-deck">
              <Select
                id="note-deck"
                value={deckId}
                onChange={async (e) => {
                  await moveNoteCards(id, Number(e.target.value))
                  toast('Перемещено')
                }}
              >
                <DeckOptionsList decks={data.decks} />
              </Select>
            </Field>

            <ListGroup title="Карточки">
              {data.cards.map((c) => {
                const st = cardStatus(c)
                const suspended = c.queue === Queue.Suspended
                return (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-medium">{cardName(data.nt, c.ord)}</div>
                      <div className="mt-0.5 text-xs text-muted">
                        <span className={cn('font-medium', st.cls)}>{st.label}</span>
                        {c.type !== CardType.New && (
                          <>
                            {' '}· лёгкость {Math.round(c.ease / 10)}% · повторов {c.reps} · ошибок {c.lapses}
                          </>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={suspended ? 'Возобновить' : 'Приостановить'}
                      onClick={() => void (suspended ? restoreCards([c.id]) : suspendCards([c.id]))}
                    >
                      {suspended ? <Play className="size-4" /> : <Pause className="size-4" />}
                    </Button>
                    {c.type !== CardType.New && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Сбросить прогресс"
                        onClick={async () => {
                          if (await confirmDialog({ title: 'Сбросить прогресс?', message: 'Карточка снова станет новой.', confirmText: 'Сбросить' })) {
                            await forgetCards([c.id])
                          }
                        }}
                      >
                        <RotateCcw className="size-4" />
                      </Button>
                    )}
                  </div>
                )
              })}
            </ListGroup>
          </>
        )}

        <Button variant="danger" className="w-full" onClick={() => void onDelete()}>
          <Trash2 className="size-4" />
          Удалить заметку
        </Button>
      </PageBody>
    </>
  )
}
