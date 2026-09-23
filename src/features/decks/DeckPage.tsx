import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Ellipsis, FolderPlus, List, PartyPopper, Pencil, Play, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { db } from '../../db/db'
import { deckInfo, deleteDeck, leafName, renameDeck } from '../../db/collection'
import { cardsWord, errMsg, formatInterval } from '../../core/format'
import { PageBody, PageHeader } from '../../ui/PageHeader'
import { Button, IconButton } from '../../ui/Button'
import { EmptyState, ListGroup, ListRow } from '../../ui/List'
import { ActionSheet } from '../../ui/Sheet'
import { confirmDialog, promptDialog } from '../../ui/dialogs'
import { toast } from '../../ui/toast'
import { askNewDeck } from './DecksPage'

export default function DeckPage() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const deck = useLiveQuery(() => db.decks.get(id).then((d) => d ?? null), [id])
  const info = useLiveQuery(() => deckInfo(id), [id])
  const [menu, setMenu] = useState(false)

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

  async function onRename() {
    if (!deck) return
    const name = await promptDialog({ title: 'Переименовать колоду', defaultValue: deck.name, confirmText: 'Сохранить' })
    if (name == null) return
    try {
      await renameDeck(deck, name)
    } catch (e) {
      toast(errMsg(e), 'error')
    }
  }

  async function onDelete() {
    if (!deck) return
    const ok = await confirmDialog({
      title: `Удалить «${leafName(deck.name)}»?`,
      message: `Будут удалены колода, её подколоды и ${totals.total} ${cardsWord(totals.total)}. Это нельзя отменить.`,
      confirmText: 'Удалить',
      danger: true,
    })
    if (!ok) return
    await deleteDeck(deck)
    toast('Колода удалена')
    nav('/')
  }

  return (
    <>
      <PageHeader
        title={leafName(deck.name)}
        subtitle={path}
        back="/"
        actions={
          <IconButton label="Действия" onClick={() => setMenu(true)}>
            <Ellipsis />
          </IconButton>
        }
      />
      <PageBody>
        {totals.total === 0 ? (
          <EmptyState
            icon={<Plus />}
            title="В колоде пока пусто"
            text="Добавьте первые слова — и можно начинать учить."
            action={
              <Button onClick={() => nav(`/add?deck=${id}`)}>
                <Plus className="size-5" />
                Добавить карточку
              </Button>
            }
          />
        ) : (
          <section className="rounded-3xl border border-line bg-surface p-5">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Новые" value={counts.new} cls="text-new" />
              <Stat label="Изучаются" value={counts.learn} cls="text-learn" />
              <Stat label="Повторить" value={counts.review} cls="text-review" />
            </div>
            {due > 0 ? (
              <Button size="lg" className="mt-5 w-full" onClick={() => nav(`/deck/${id}/study`)}>
                <Play className="size-5 fill-current" />
                Учить
              </Button>
            ) : (
              <div className="mt-5 flex items-center gap-3 rounded-2xl bg-emerald-500/10 p-4 text-emerald-700 dark:text-emerald-300">
                <PartyPopper className="size-6 shrink-0" />
                <div className="text-sm">
                  <div className="font-semibold">На сегодня всё!</div>
                  <div className="opacity-80">
                    {info.nextLearn
                      ? `Следующая карточка через ${formatInterval((info.nextLearn - Date.now()) / 1000)}`
                      : 'Новые повторения появятся завтра'}
                  </div>
                </div>
                {info.nextLearn && (
                  <Button size="sm" variant="secondary" className="ml-auto" onClick={() => nav(`/deck/${id}/study`)}>
                    Сейчас
                  </Button>
                )}
              </div>
            )}
          </section>
        )}

        <div className="grid grid-cols-2 gap-3">
          <QuickAction icon={<Plus />} label="Добавить" onClick={() => nav(`/add?deck=${id}`)} />
          <QuickAction icon={<List />} label="Карточки" onClick={() => nav(`/browse?deck=${id}`)} />
        </div>

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

      <ActionSheet
        open={menu}
        onClose={() => setMenu(false)}
        title={leafName(deck.name)}
        actions={[
          { label: 'Настройки колоды', icon: <SlidersHorizontal />, onSelect: () => nav(`/deck/${id}/options`) },
          { label: 'Создать подколоду', icon: <FolderPlus />, onSelect: () => void askNewDeck(deck.name) },
          { label: 'Переименовать', icon: <Pencil />, onSelect: () => void onRename() },
          { label: 'Удалить колоду', icon: <Trash2 />, danger: true, onSelect: () => void onDelete() },
        ]}
      />
    </>
  )
}

function Stat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="rounded-2xl bg-surface-2/60 px-2 py-3">
      <div className={`text-3xl font-bold tabular-nums ${value ? cls : 'text-muted/50'}`}>{value}</div>
      <div className="mt-0.5 text-xs font-medium text-muted">{label}</div>
    </div>
  )
}

function QuickAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-[15px] font-medium transition hover:bg-surface-2 active:scale-[0.98] [&_svg]:size-5 [&_svg]:text-accent"
    >
      {icon}
      {label}
    </button>
  )
}
