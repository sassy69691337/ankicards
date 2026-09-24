import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, DatabaseBackup, FileUp, FolderPlus, Layers, Plus, Shuffle } from 'lucide-react'
import { getConfig } from '../../db/db'
import { createDeck, deckTree, todayStats, type DeckNode } from '../../db/collection'
import { cardsWord, errMsg } from '../../core/format'
import { PageBody, PageHeader } from '../../ui/PageHeader'
import { Button, IconButton } from '../../ui/Button'
import { EmptyState } from '../../ui/List'
import { promptDialog } from '../../ui/dialogs'
import { toast } from '../../ui/toast'
import { cn } from '../../ui/cn'
import { CloudBadge } from '../settings/CloudSection'

const COLLAPSE_KEY = 'decks.collapsed'

function loadCollapsed(): Set<number> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '[]') as number[])
  } catch {
    return new Set()
  }
}

function flatten(nodes: DeckNode[], collapsed: Set<number>, out: DeckNode[] = []): DeckNode[] {
  for (const n of nodes) {
    out.push(n)
    if (!collapsed.has(n.deck.id)) flatten(n.children, collapsed, out)
  }
  return out
}

export async function askNewDeck(parent?: string): Promise<number | null> {
  const name = await promptDialog({
    title: parent ? 'Новая подколода' : 'Новая колода',
    message: parent ? `Внутри «${parent}»` : 'Для подколоды используйте «::», например English::Глаголы',
    placeholder: 'Название',
    confirmText: 'Создать',
  })
  if (!name?.trim()) return null
  try {
    return await createDeck(parent ? `${parent}::${name}` : name)
  } catch (e) {
    toast(errMsg(e), 'error')
    return null
  }
}

export default function DecksPage() {
  const tree = useLiveQuery(deckTree, [])
  const stats = useLiveQuery(todayStats, [])
  const lastBackup = useLiveQuery(() => getConfig<number | null>('lastBackupAt', null), [])
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const nav = useNavigate()

  async function onCreate() {
    const id = await askNewDeck()
    if (id) nav(`/deck/${id}`)
  }

  function toggle(id: number) {
    const next = new Set(collapsed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]))
    } catch {
      // не критично
    }
  }

  const rows = tree ? flatten(tree, collapsed) : []
  const due = tree?.reduce((s, n) => s + n.counts.new + n.counts.learn + n.counts.review, 0) ?? 0
  const totalCards = tree?.reduce((s, n) => s + n.total, 0) ?? 0
  const needBackup = totalCards >= 20 && lastBackup !== undefined && (!lastBackup || Date.now() - lastBackup > 7 * 86_400_000)

  return (
    <>
      <PageHeader
        large
        title="Колоды"
        actions={
          <>
            <CloudBadge />
            <IconButton label="Импорт" onClick={() => nav('/import')}>
              <FileUp />
            </IconButton>
            <IconButton label="Новая колода" onClick={onCreate}>
              <FolderPlus />
            </IconButton>
          </>
        }
      />
      <PageBody>
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 p-5 text-white shadow-lg shadow-indigo-500/20">
          <div className="absolute -right-10 -top-12 size-40 rounded-full bg-white/10" />
          <div className="absolute -bottom-16 right-16 size-32 rounded-full bg-white/5" />
          <p className="text-sm font-medium text-white/75">Сегодня</p>
          <div className="mt-1 flex items-end gap-2">
            <span className="text-4xl font-bold tabular-nums">{due}</span>
            <span className="pb-1 text-white/80">{cardsWord(due)} к изучению</span>
          </div>
          <p className="mt-3 text-sm text-white/75">
            Изучено: {stats?.count ?? 0} · {Math.round((stats?.ms ?? 0) / 60000)} мин
          </p>
          {due > 0 && (
            <button
              type="button"
              onClick={() => nav('/study/mix')}
              className="relative mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-[15px] font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-50 active:scale-[0.98]"
            >
              <Shuffle className="size-5" />
              Учить всё вперемешку
            </button>
          )}
        </section>

        {needBackup && (
          <button
            type="button"
            onClick={() => nav('/settings')}
            className="flex w-full items-center gap-3 rounded-2xl bg-amber-500/10 px-4 py-3 text-left text-amber-800 transition hover:bg-amber-500/15 dark:text-amber-200"
          >
            <DatabaseBackup className="size-5 shrink-0" />
            <span className="flex-1 text-sm">
              <span className="block font-semibold">Сделайте резервную копию</span>
              <span className="opacity-80">{lastBackup ? 'Последней копии больше недели.' : 'Карточки хранятся только на этом устройстве.'}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 opacity-60" />
          </button>
        )}

        {tree && totalCards === 0 && rows.length <= 1 ? (
          <EmptyState
            icon={<Layers />}
            title="Пока нет карточек"
            text="Добавьте первые слова вручную или импортируйте CSV, TXT или колоду Anki (.apkg)."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => nav('/add')}>
                  <Plus className="size-5" />
                  Добавить карточку
                </Button>
                <Button variant="secondary" onClick={() => nav('/import')}>
                  <FileUp className="size-5" />
                  Импорт файла
                </Button>
              </div>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
              <span className="flex-1">Колода</span>
              <span className="w-9 text-right">Нов.</span>
              <span className="w-9 text-right">Уч.</span>
              <span className="w-9 text-right">Повт.</span>
            </div>
            <ul className="divide-y divide-line">
              {rows.map((n) => (
                <DeckRow key={n.deck.id} node={n} collapsed={collapsed.has(n.deck.id)} onToggle={() => toggle(n.deck.id)} />
              ))}
            </ul>
          </div>
        )}
      </PageBody>
    </>
  )
}

function Count({ v, cls }: { v: number; cls: string }) {
  return <span className={cn('w-9 text-right text-sm font-semibold tabular-nums', v ? cls : 'text-muted/40')}>{v}</span>
}

function DeckRow({ node, collapsed, onToggle }: { node: DeckNode; collapsed: boolean; onToggle: () => void }) {
  const hasKids = node.children.length > 0
  return (
    <li>
      <Link
        to={`/deck/${node.deck.id}`}
        className="flex items-center gap-2 py-3.5 pr-4 transition hover:bg-surface-2 active:bg-surface-2"
        style={{ paddingLeft: 8 + node.depth * 20 }}
      >
        {hasKids ? (
          <button
            type="button"
            aria-label={collapsed ? 'Развернуть' : 'Свернуть'}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onToggle()
            }}
            className="grid size-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-line/60"
          >
            <ChevronRight className={cn('size-4 transition-transform', !collapsed && 'rotate-90')} />
          </button>
        ) : (
          <span className="size-7 shrink-0" />
        )}
        <span className={cn('min-w-0 flex-1 truncate text-[15px]', node.depth === 0 ? 'font-semibold' : 'font-medium')}>{node.name}</span>
        <Count v={node.counts.new} cls="text-new" />
        <Count v={node.counts.learn} cls="text-learn" />
        <Count v={node.counts.review} cls="text-review" />
      </Link>
    </li>
  )
}
