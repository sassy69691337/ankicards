import { useDeferredValue, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Search, X } from 'lucide-react'
import { db } from '../../db/db'
import { leafName, searchNotes } from '../../db/collection'
import { stripCloze } from '../../core/template'
import { plainText } from '../../core/text'
import { plural } from '../../core/format'
import { PageBody, PageHeader } from '../../ui/PageHeader'
import { Select, inputCls } from '../../ui/forms'
import { EmptyState } from '../../ui/List'
import { cn } from '../../ui/cn'
import { DeckOptionsList } from '../editor/DeckSelect'
import { cardStatus } from '../editor/EditNotePage'

export default function BrowsePage() {
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const deckFilter = Number(params.get('deck')) || 0
  const query = useDeferredValue(q)
  const decks = useLiveQuery(() => db.decks.toArray(), [])
  const result = useLiveQuery(() => searchNotes(query, deckFilter), [query, deckFilter])
  const deckName = new Map(decks?.map((d) => [d.id, leafName(d.name)]))
  const back = `/browse?${params.toString()}`

  return (
    <>
      <PageHeader large title="Карточки" />
      <PageBody className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по словам и меткам"
            className={cn(inputCls, 'pl-10 pr-10')}
            autoCapitalize="off"
          />
          {q && (
            <button type="button" aria-label="Очистить" onClick={() => setQ('')} className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-surface-2">
              <X className="size-4" />
            </button>
          )}
        </div>
        {decks && (
          <Select
            value={deckFilter}
            onChange={(e) => {
              const next = new URLSearchParams(params)
              if (Number(e.target.value)) next.set('deck', e.target.value)
              else next.delete('deck')
              setParams(next, { replace: true })
            }}
          >
            <option value={0}>Все колоды</option>
            <DeckOptionsList decks={decks} />
          </Select>
        )}

        {result && (
          <p className="px-1 pt-1 text-xs font-medium text-muted">
            {result.total} {plural(result.total, ['заметка', 'заметки', 'заметок'])}
            {result.total > result.hits.length && ` · показаны первые ${result.hits.length}`}
          </p>
        )}

        {result && result.total === 0 ? (
          <EmptyState icon={<Search />} title={q ? 'Ничего не найдено' : 'Здесь пока пусто'} text={q ? 'Попробуйте другой запрос.' : 'Добавленные карточки появятся здесь.'} />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {result?.hits.map(({ note, card }) => {
              const st = card ? cardStatus(card) : null
              return (
                <li key={note.id}>
                  <Link to={`/note/${note.id}?back=${encodeURIComponent(back)}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2 active:bg-surface-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-medium">{plainText(stripCloze(note.fields[0] ?? '')) || '—'}</div>
                      <div className="truncate text-sm text-muted">{plainText(note.fields[1] ?? '')}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      {card && <div className="max-w-28 truncate text-xs text-muted">{deckName.get(card.deckId)}</div>}
                      {st && <div className={cn('text-xs font-medium', st.cls)}>{st.label}</div>}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </PageBody>
    </>
  )
}
