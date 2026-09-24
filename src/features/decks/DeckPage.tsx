import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { CircleCheck, Ellipsis, FileUp, List, Play, Plus, SlidersHorizontal } from 'lucide-react'
import { db } from '../../db/db'
import { deckInfo, leafName } from '../../db/collection'
import { cardsWord, formatInterval, plural } from '../../core/format'
import { PageBody, PageHeader } from '../../ui/PageHeader'
import { Button, IconButton } from '../../ui/Button'
import { EmptyState, ListGroup, ListRow } from '../../ui/List'
import { LogoMark } from '../../ui/Logo'
import { cn } from '../../ui/cn'
import { useDeckMenu } from './DeckMenu'

export default function DeckPage() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const deck = useLiveQuery(() => db.decks.get(id).then((d) => d ?? null), [id])
  const info = useLiveQuery(() => deckInfo(id), [id])
  const menu = useDeckMenu(() => nav('/'))

  if (deck === null) {
    return (
      <>
        <PageHeader title="Колода" back="/" />
        <PageBody>
          <p className="text-muted">Колода не найдена.</p>
        </PageBody>
      </>
    )
  }
  if (!deck || !info) return <PageHeader title="" back="/" />

  const { counts, totals } = info
  const due = counts.new + counts.learn + counts.review
  const path = deck.name.includes('::') ? deck.name.split('::').slice(0, -1).join(' › ') : undefined

  return (
    <>
      <PageHeader
        title={leafName(deck.name)}
        back="/"
        actions={
          <IconButton label="Действия с колодой" variant="surface" onClick={() => menu.open(deck)}>
            <Ellipsis />
          </IconButton>
        }
      />
      <PageBody>
        <section className="rounded-[28px] bg-surface p-5 ring-1 ring-line/70">
          <div className="flex items-start gap-3.5">
            <span className="grid size-14 shrink-0 place-items-center rounded-[18px] bg-accent-soft text-accent-text" aria-hidden>
              <LogoMark className="size-8" />
            </span>
            <div className="min-w-0 flex-1">
              {path && <p className="break-words text-sm text-muted">{path}</p>}
              <h2 className="break-words text-[24px] font-bold leading-[30px] tracking-tight">{leafName(deck.name)}</h2>
              <p className="mt-0.5 text-[15px] text-muted">
                {totals.notes} {plural(totals.notes, ['заметка', 'заметки', 'заметок'])} · {totals.total} {cardsWord(totals.total)}
              </p>
            </div>
          </div>

          {totals.total > 0 && (
            <>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                <Stat label="Новые" value={counts.new} />
                <Stat label="Учим" value={counts.learn} />
                <Stat label="Повтор" value={counts.review} />
              </div>
              {due > 0 ? (
                <Button size="lg" className="mt-5 w-full" onClick={() => nav(`/deck/${id}/study`)}>
                  <Play className="size-5 fill-current" />
                  Учить колоду
                </Button>
              ) : (
                <div className="mt-5 flex flex-wrap items-center gap-3 rounded-[20px] bg-success-soft p-4 text-success">
                  <CircleCheck className="size-6 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1 text-[15px] leading-[22px]">
                    <div className="font-semibold">На сегодня всё</div>
                    <div>
                      {info.nextLearn
                        ? `Следующая карточка через ${formatInterval((info.nextLearn - Date.now()) / 1000)}`
                        : 'Новые повторения появятся завтра'}
                    </div>
                  </div>
                  {info.nextLearn && (
                    <Button size="sm" variant="secondary" onClick={() => nav(`/deck/${id}/study`)}>
                      Учить сейчас
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        {totals.total === 0 ? (
          <EmptyState
            icon={<Plus />}
            title="Добавьте первое слово"
            text="Или импортируйте готовый список из файла."
            action={
              <div className="space-y-2">
                <Button size="lg" className="w-full" onClick={() => nav(`/add?deck=${id}`)}>
                  <Plus className="size-5" />
                  Добавить слово
                </Button>
                <Button variant="secondary" size="lg" className="w-full" onClick={() => nav(`/import?deck=${id}`)}>
                  <FileUp className="size-5" />
                  Импортировать
                </Button>
              </div>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="secondary" size="lg" onClick={() => nav(`/add?deck=${id}`)}>
              <Plus className="size-5 text-accent-text" />
              Добавить
            </Button>
            <Button variant="secondary" size="lg" onClick={() => nav(`/browse?deck=${id}`)}>
              <List className="size-5 text-accent-text" />
              Карточки
            </Button>
          </div>
        )}

        {totals.total > 0 && (
          <ListGroup title="В колоде">
            <ListRow label="Всего карточек" value={totals.total} />
            <ListRow label="Новые" value={totals.new} />
            <ListRow label="Изучаются" value={totals.learning} />
            <ListRow label="Молодые" hint="интервал меньше 21 дня" value={totals.young} />
            <ListRow label="Зрелые" hint="интервал от 21 дня" value={totals.mature} />
            {totals.suspended > 0 && <ListRow label="Приостановлены" value={totals.suspended} />}
          </ListGroup>
        )}

        <ListGroup>
          <ListRow icon={<SlidersHorizontal />} label="Настройки колоды" hint="Лимиты, шаги, озвучка" to={`/deck/${id}/options`} />
        </ListGroup>
      </PageBody>
      {menu.element}
    </>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[18px] bg-surface-2/70 px-2 py-3">
      <div className={cn('text-[28px] font-bold leading-9 tabular-nums', !value && 'text-muted')}>{value}</div>
      <div className="text-sm text-muted">{label}</div>
    </div>
  )
}
