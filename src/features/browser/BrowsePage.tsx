import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, Ellipsis, FileUp, Pause, Pencil, Play, Plus, Search, Trash2 } from 'lucide-react'
import { db } from '../../db/db'
import { deleteNote, leafName, restoreCards, searchNotes, suspendCards, type CardStatusKey, type NoteHit } from '../../db/collection'
import { Queue } from '../../db/types'
import { stripCloze } from '../../core/template'
import { plainText } from '../../core/text'
import { cardsWord, plural } from '../../core/format'
import { PageBody, PageHeader } from '../../ui/PageHeader'
import { FilterChip, SearchField } from '../../ui/forms'
import { EmptyState, StatusBadge } from '../../ui/List'
import { Button, IconButton } from '../../ui/Button'
import { ActionSheet } from '../../ui/Sheet'
import { confirmDialog } from '../../ui/dialogs'
import { toast } from '../../ui/toast'
import { DeckOptionsList } from '../editor/DeckSelect'
import { cardStatus } from '../editor/cardStatus'

const STATUSES: { value: CardStatusKey; label: string }[] = [
  { value: 'new', label: 'Новые' },
  { value: 'learn', label: 'Изучаются' },
  { value: 'review', label: 'На повторении' },
  { value: 'suspended', label: 'Приостановленные' },
  { value: 'buried', label: 'Отложенные' },
]

const notesWord = (n: number) => plural(n, ['заметка', 'заметки', 'заметок'])

export default function BrowsePage() {
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const [q, setQ] = useState(params.get('q') ?? '')
  const query = params.get('q') ?? ''
  const deckFilter = Number(params.get('deck')) || 0
  const status = (params.get('status') ?? '') as CardStatusKey | ''
  const decks = useLiveQuery(() => db.decks.toArray(), [])
  const result = useLiveQuery(() => searchNotes(query, deckFilter, status), [query, deckFilter, status])
  const deckName = new Map(decks?.map((d) => [d.id, leafName(d.name)]))
  const back = `/browse?${params.toString()}`
  const [menu, setMenu] = useState<NoteHit | null>(null)

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  // Поиск с задержкой 250 мс; запрос хранится в адресе и переживает переход в редактор
  useEffect(() => {
    if (q === query) return
    const t = setTimeout(() => setParam('q', q.trim() ? q : ''), 250)
    return () => clearTimeout(t)
  }, [q, query])

  const filtered = !!(query || deckFilter || status)
  const resetFilters = () => {
    setQ('')
    setParams(new URLSearchParams(), { replace: true })
  }

  const deckLabel = deckFilter ? (deckName.get(deckFilter) ?? 'Колода') : 'Все колоды'
  const statusLabel = STATUSES.find((s) => s.value === status)?.label ?? 'Все статусы'

  async function onDelete(hit: NoteHit) {
    const ok = await confirmDialog({
      title: 'Удалить заметку?',
      message: `Будут удалены заметка, ${hit.cards.length} ${cardsWord(hit.cards.length)} и их прогресс. Это нельзя отменить.`,
      confirmText: 'Удалить',
      danger: true,
    })
    if (!ok) return
    await deleteNote(hit.note.id)
    toast('Заметка удалена')
  }

  const menuSuspended = menu ? menu.cards.length > 0 && menu.cards.every((c) => c.queue === Queue.Suspended) : false

  return (
    <>
      <PageHeader large title="Карточки" />
      <PageBody className="space-y-4">
        <SearchField value={q} onChange={setQ} label="Поиск по словам и меткам" placeholder="Поиск по словам и меткам" />
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip label="Колода" value={deckFilter} onChange={(v) => setParam('deck', Number(v) ? v : '')} active={!!deckFilter} display={deckLabel}>
            <option value={0}>Все колоды</option>
            {decks && <DeckOptionsList decks={decks} />}
          </FilterChip>
          <FilterChip label="Статус" value={status} onChange={(v) => setParam('status', v)} active={!!status} display={statusLabel}>
            <option value="">Все статусы</option>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </FilterChip>
          {filtered && (
            <button type="button" onClick={resetFilters} className="min-h-11 rounded-full px-3 text-[15px] font-medium text-accent-text hover:underline">
              Сбросить
            </button>
          )}
        </div>

        {result && (
          <p className="px-1 text-sm text-muted" aria-live="polite">
            {result.total} {notesWord(result.total)} · {result.totalCards} {cardsWord(result.totalCards)}
            {result.total > result.hits.length && ` · показаны первые ${result.hits.length}`}
          </p>
        )}

        {result && result.total === 0 ? (
          filtered ? (
            <EmptyState
              icon={<Search />}
              title="Ничего не найдено"
              text={query ? `По запросу «${query}» нет заметок.` : 'С такими фильтрами нет заметок.'}
              action={
                <Button variant="secondary" size="lg" className="w-full" onClick={resetFilters}>
                  Сбросить фильтры
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<BookOpen />}
              title="Здесь пока пусто"
              text="Добавленные слова появятся здесь."
              action={
                <div className="space-y-2">
                  <Button size="lg" className="w-full" onClick={() => nav('/add')}>
                    <Plus className="size-5" />
                    Добавить слово
                  </Button>
                  <Button variant="secondary" size="lg" className="w-full" onClick={() => nav('/import')}>
                    <FileUp className="size-5" />
                    Импортировать
                  </Button>
                </div>
              }
            />
          )
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-[24px] bg-surface ring-1 ring-line/70">
            {result?.hits.map((hit) => (
              <CardRow key={hit.note.id} hit={hit} deck={deckName.get(hit.cards[0]?.deckId ?? 0)} to={`/note/${hit.note.id}?back=${encodeURIComponent(back)}`} onMenu={() => setMenu(hit)} />
            ))}
          </ul>
        )}
      </PageBody>

      <ActionSheet
        open={!!menu}
        onClose={() => setMenu(null)}
        title={menu ? plainText(stripCloze(menu.note.fields[0] ?? '')) || 'Заметка' : undefined}
        actions={
          menu
            ? [
                { label: 'Редактировать', icon: <Pencil />, onSelect: () => nav(`/note/${menu.note.id}?back=${encodeURIComponent(back)}`) },
                menuSuspended
                  ? { label: 'Возобновить', icon: <Play />, onSelect: () => void restoreCards(menu.cards.map((c) => c.id)).then(() => toast('Возобновлено')) }
                  : { label: 'Приостановить', icon: <Pause />, onSelect: () => void suspendCards(menu.cards.map((c) => c.id)).then(() => toast('Приостановлено')) },
                { label: 'Удалить заметку', icon: <Trash2 />, danger: true, onSelect: () => void onDelete(menu) },
              ]
            : []
        }
      />
    </>
  )
}

/** Строка заметки: слово, перевод, колода и статус каждого направления */
function CardRow({ hit, deck, to, onMenu }: { hit: NoteHit; deck?: string; to: string; onMenu: () => void }) {
  const { note, cards } = hit
  const word = plainText(stripCloze(note.fields[0] ?? '')) || '—'
  const translation = plainText(note.fields[1] ?? '')
  const statuses = cards.map(cardStatus)
  const same = statuses.every((s) => s.label === statuses[0]?.label)
  return (
    <li className="flex items-start gap-1">
      <Link to={to} className="min-w-0 flex-1 py-3 pl-4 transition hover:bg-surface-2/60 active:bg-surface-2">
        <div className="break-words text-[17px] font-semibold leading-6">{word}</div>
        {translation && <div className="break-words text-[15px] leading-[22px] text-muted">{translation}</div>}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted">
          {deck && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <BookOpen className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{deck}</span>
            </span>
          )}
          {statuses.length > 0 &&
            (same ? (
              <StatusBadge tone={statuses[0].tone}>{statuses[0].label}</StatusBadge>
            ) : statuses.length === 2 ? (
              statuses.map((s, i) => (
                <StatusBadge key={i} tone={s.tone}>
                  <span aria-label={i === 0 ? 'Прямая:' : 'Обратная:'}>{i === 0 ? '→' : '←'}</span>&nbsp;{s.label}
                </StatusBadge>
              ))
            ) : (
              <StatusBadge tone="neutral">Разные статусы</StatusBadge>
            ))}
        </div>
      </Link>
      <IconButton label={`Действия: ${word}`} onClick={onMenu} className="mr-1 mt-1.5 text-muted">
        <Ellipsis />
      </IconButton>
    </li>
  )
}
