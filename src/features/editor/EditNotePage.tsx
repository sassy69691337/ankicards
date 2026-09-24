import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pause, Play, RotateCcw, Trash2 } from 'lucide-react'
import { db } from '../../db/db'
import { deleteNote, forgetCards, moveNoteCards, restoreCards, suspendCards } from '../../db/collection'
import { CardType, Queue } from '../../db/types'
import { cardsWord } from '../../core/format'
import { PageBody, PageHeader } from '../../ui/PageHeader'
import { Field, Select } from '../../ui/forms'
import { Button, IconButton } from '../../ui/Button'
import { ListGroup, StatusBadge } from '../../ui/List'
import { confirmDialog } from '../../ui/dialogs'
import { toast } from '../../ui/toast'
import { NoteEditForm } from './NoteEditForm'
import { DeckOptionsList } from './DeckSelect'
import { cardName, cardStatus } from './cardStatus'

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
    const n = data?.cards.length ?? 0
    const ok = await confirmDialog({
      title: 'Удалить заметку?',
      message: `Будут удалены заметка, ${n} ${cardsWord(n)} и их прогресс. Это нельзя отменить.`,
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
        <section className="rounded-[24px] bg-surface p-4 ring-1 ring-line/70 min-[360px]:p-5">
          <NoteEditForm noteId={id} onSaved={() => nav(back)} />
        </section>

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

            <ListGroup
              title={`Карточки этой заметки: ${data.cards.length}`}
              footer="Одна заметка порождает карточки для каждого направления. Статус и прогресс у каждой свой."
            >
              {data.cards.map((c) => {
                const st = cardStatus(c)
                const suspended = c.queue === Queue.Suspended
                return (
                  <div key={c.id} className="flex items-center gap-2 py-2.5 pl-4 pr-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-medium">{cardName(data.nt, c.ord)}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                        {c.type !== CardType.New && (
                          <span>
                            лёгкость {Math.round(c.ease / 10)}% · повторов {c.reps} · ошибок {c.lapses}
                          </span>
                        )}
                      </div>
                    </div>
                    <IconButton
                      label={suspended ? 'Возобновить карточку' : 'Приостановить карточку'}
                      onClick={() => void (suspended ? restoreCards([c.id]) : suspendCards([c.id]))}
                      className="text-muted [&_svg]:size-5"
                    >
                      {suspended ? <Play /> : <Pause />}
                    </IconButton>
                    {c.type !== CardType.New && (
                      <IconButton
                        label="Сбросить прогресс"
                        className="text-muted [&_svg]:size-5"
                        onClick={async () => {
                          if (await confirmDialog({ title: 'Сбросить прогресс?', message: 'Карточка снова станет новой. Интервалы этой карточки будут потеряны.', confirmText: 'Сбросить', danger: true })) {
                            await forgetCards([c.id])
                          }
                        }}
                      >
                        <RotateCcw />
                      </IconButton>
                    )}
                  </div>
                )
              })}
            </ListGroup>
          </>
        )}

        <Button variant="danger" size="lg" className="w-full" onClick={() => void onDelete()}>
          <Trash2 className="size-5" />
          Удалить заметку
        </Button>
      </PageBody>
    </>
  )
}
