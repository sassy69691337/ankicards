import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, ChevronRight, DatabaseBackup, Ellipsis, FileUp, FolderPlus, Plus } from 'lucide-react'
import { getConfig } from '../../db/db'
import { deckTree, mixedSource, todayStats, type DeckNode } from '../../db/collection'
import { cardsWord, formatInterval } from '../../core/format'
import { PageBody, PageHeader } from '../../ui/PageHeader'
import { Button, IconButton } from '../../ui/Button'
import { EmptyState, Notice } from '../../ui/List'
import { ActionSheet } from '../../ui/Sheet'
import { LogoMark } from '../../ui/Logo'
import { cn } from '../../ui/cn'
import { useCloud } from '../../sync/cloud'
import { CloudBadge } from '../settings/CloudSection'
import { askNewDeck, useDeckMenu } from './DeckMenu'

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

export default function DecksPage() {
  const tree = useLiveQuery(deckTree, [])
  const stats = useLiveQuery(todayStats, [])
  const nextDue = useLiveQuery(async () => (await mixedSource()).nextLearnDue(), [])
  const rollover = useLiveQuery(() => getConfig('rolloverHour', 4), [])
  const lastBackup = useLiveQuery(() => getConfig<number | null>('lastBackupAt', null), [])
  const cloud = useCloud()
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const [addMenu, setAddMenu] = useState(false)
  const deckMenu = useDeckMenu()
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
  const synced = !!cloud.user && cloud.phase !== 'link'
  const needBackup = !synced && totalCards >= 20 && lastBackup !== undefined && (!lastBackup || Date.now() - lastBackup > 7 * 86_400_000)
  const empty = tree && totalCards === 0 && rows.length <= 1

  return (
    <>
      <PageHeader
        large
        title="Колоды"
        actions={
          <>
            <CloudBadge />
            <IconButton label="Создать колоду или импортировать" variant="accent" onClick={() => setAddMenu(true)}>
              <Plus />
            </IconButton>
          </>
        }
      />
      <PageBody>
        {empty ? (
          <EmptyState
            icon={<LogoMark />}
            title="Пока нет карточек"
            text="Создайте колоду и добавьте слова или импортируйте CSV, TXT или колоду Anki (.apkg)."
            action={
              <div className="space-y-2">
                <Button size="lg" className="w-full" onClick={() => nav('/add')}>
                  <Plus className="size-5" />
                  Добавить слово
                </Button>
                <Button variant="secondary" size="lg" className="w-full" onClick={() => void onCreate()}>
                  <FolderPlus className="size-5" />
                  Создать колоду
                </Button>
                <Button variant="secondary" size="lg" className="w-full" onClick={() => nav('/import')}>
                  <FileUp className="size-5" />
                  Импортировать
                </Button>
              </div>
            }
          />
        ) : (
          tree && (
            <TodayCard
              due={due}
              studied={stats?.cards ?? 0}
              nextDue={nextDue ?? null}
              rollover={rollover ?? 4}
              onStart={() => nav('/study/mix')}
            />
          )
        )}

        {needBackup && (
          <Link to="/settings" className="block">
            <Notice
              tone="warning"
              icon={<DatabaseBackup />}
              title="Сделайте резервную копию"
              action={<span className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">Открыть настройки<ChevronRight className="size-4" /></span>}
            >
              {lastBackup ? 'Последней копии больше недели.' : 'Синхронизация выключена: карточки хранятся только на этом устройстве.'}
            </Notice>
          </Link>
        )}

        {!empty && rows.length > 0 && (
          <ul className="space-y-2.5" aria-label="Колоды">
            {rows.map((n) => (
              <DeckTile
                key={n.deck.id}
                node={n}
                collapsed={collapsed.has(n.deck.id)}
                onToggle={() => toggle(n.deck.id)}
                onMenu={() => deckMenu.open(n.deck)}
              />
            ))}
          </ul>
        )}
      </PageBody>

      <ActionSheet
        open={addMenu}
        onClose={() => setAddMenu(false)}
        actions={[
          { label: 'Создать колоду', icon: <FolderPlus />, onSelect: () => void onCreate() },
          { label: 'Импортировать', icon: <FileUp />, onSelect: () => nav('/import') },
        ]}
      />
      {deckMenu.element}
    </>
  )
}

function TodayCard({
  due,
  studied,
  nextDue,
  rollover,
  onStart,
}: {
  due: number
  studied: number
  nextDue: number | null
  rollover: number
  onStart: () => void
}) {
  return (
    <section
      aria-labelledby="today-title"
      className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(145deg,var(--accent-soft)_0%,var(--surface)_78%)] p-5 ring-1 ring-accent/15"
    >
      <TodayArt />
      <div className="relative">
        <h2 id="today-title" className="flex items-center gap-2 text-base font-medium">
          <CalendarDays className="size-5 text-accent-text" aria-hidden />
          Сегодня
        </h2>
        {due > 0 ? (
          <>
            <p className="mt-2 min-[360px]:max-w-[62%]">
              <span className="block text-[56px] font-bold leading-[60px] tracking-tight tabular-nums">{due}</span>
              <span className="text-[17px] font-medium">{cardsWord(due)} к изучению</span>
            </p>
            <p className="mt-1 text-[15px] text-muted">Изучено сегодня: {studied}</p>
            <Button size="lg" className="mt-5 w-full" onClick={onStart}>
              Начать занятие
              <ChevronRight className="size-5" />
            </Button>
          </>
        ) : (
          <>
            <p className="mt-2 max-w-[70%] text-[28px] font-bold leading-9 tracking-tight">На сегодня всё</p>
            <p className="mt-1 max-w-[70%] text-[15px] leading-[22px] text-muted">
              {nextDue
                ? `Следующая карточка — через ${formatInterval((nextDue - Date.now()) / 1000)}.`
                : `Новые карточки и повторения появятся после ${String(rollover).padStart(2, '0')}:00.`}
            </p>
            <p className="mt-1 text-[15px] text-muted">Изучено сегодня: {studied}</p>
          </>
        )}
      </div>
    </section>
  )
}

/** Декоративная пара карточек — знак приложения в «стекле» */
function TodayArt() {
  return (
    <div aria-hidden className="pointer-events-none absolute right-0 top-5 hidden h-28 w-32 min-[360px]:block min-[400px]:right-3">
      <div className="absolute right-10 top-1 h-24 w-18 -rotate-[13deg] rounded-[16px] bg-accent/25 ring-1 ring-white/50" />
      <div className="absolute right-3 top-4 flex h-24 w-18 rotate-[6deg] items-end justify-center rounded-[16px] bg-surface/80 pb-3 shadow-[0_10px_24px_-10px_rgb(32_33_39/0.35)] ring-1 ring-white/70 dark:bg-surface/70 dark:ring-white/10">
        <LogoMark className="size-9 text-accent" />
      </div>
    </div>
  )
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <span className="whitespace-nowrap">
      {label} <span className={cn('font-semibold tabular-nums', value ? 'text-fg' : 'text-muted')}>{value}</span>
    </span>
  )
}

function DeckTile({ node, collapsed, onToggle, onMenu }: { node: DeckNode; collapsed: boolean; onToggle: () => void; onMenu: () => void }) {
  const hasKids = node.children.length > 0
  const { counts } = node
  return (
    <li style={{ marginLeft: Math.min(node.depth, 3) * 16 }}>
      <div className="flex items-center rounded-[24px] bg-surface pr-1 ring-1 ring-line/70 transition hover:ring-line">
        <Link
          to={`/deck/${node.deck.id}`}
          aria-label={`${node.deck.name.split('::').join(', ')}. Новые ${counts.new}, учим ${counts.learn}, повтор ${counts.review}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-[24px] py-3.5 pl-3.5 pr-1 active:bg-surface-2/60"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-[16px] bg-accent-soft text-accent-text" aria-hidden>
            <LogoMark className="size-7" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 break-words text-[17px] font-semibold leading-[22px]">{node.name}</span>
            <span className="mt-1 flex flex-wrap gap-x-2 text-sm text-muted">
              <Counter label="Новые" value={counts.new} />
              <span aria-hidden>·</span>
              <Counter label="Учим" value={counts.learn} />
              <span aria-hidden>·</span>
              <Counter label="Повтор" value={counts.review} />
            </span>
          </span>
        </Link>
        {hasKids && (
          <IconButton label={collapsed ? 'Показать подколоды' : 'Скрыть подколоды'} aria-expanded={!collapsed} onClick={onToggle} className="text-muted">
            <ChevronRight className={cn('transition-transform', !collapsed && 'rotate-90')} />
          </IconButton>
        )}
        <IconButton label={`Действия с колодой ${node.name}`} onClick={onMenu} className="text-muted">
          <Ellipsis />
        </IconButton>
      </div>
    </li>
  )
}
