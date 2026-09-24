import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CircleCheck, Clock, Ellipsis, EyeOff, Flag, Pause, Pencil, Star, Trash2, Undo2, Volume2, X } from 'lucide-react'
import { db } from '../../db/db'
import {
  answerCardOp,
  applyUndo,
  buryCards,
  deleteNote,
  deckSource,
  leafName,
  loadCardView,
  mixedSource,
  setCardFlag,
  studyContext,
  suspendCards,
  toggleMark,
  unburyIfNeeded,
  type CardViewData,
  type Counts,
  type StudySource,
  type UndoEntry,
} from '../../db/collection'
import type { Card } from '../../db/types'
import { DEFAULT_NOTE_TYPES } from '../../db/defaults'
import { previewIntervals, type Rating } from '../../core/scheduler'
import { renderCard, stripCloze, templateUsesField } from '../../core/template'
import { plainText, stripHtml } from '../../core/text'
import { schedTime } from '../../core/time'
import { cardsWord, errMsg, formatInterval } from '../../core/format'
import { playSounds, soundNames, stopAudio } from '../../core/media'
import { speak, stopSpeech } from '../../core/tts'
import { useIsDark } from '../../app/theme'
import { Button, IconButton } from '../../ui/Button'
import { ProgressBar, StatusBadge } from '../../ui/List'
import { ActionSheet, Sheet } from '../../ui/Sheet'
import { confirmDialog } from '../../ui/dialogs'
import { toast } from '../../ui/toast'
import { cn } from '../../ui/cn'
import { NoteEditForm } from '../editor/NoteEditForm'
import { cardName, cardStatus } from '../editor/cardStatus'
import { requestSync } from '../../sync/cloud'
import { CardView } from './CardView'

type State =
  | { status: 'loading' }
  | { status: 'done'; nextDue: number | null }
  | { status: 'card'; view: CardViewData; q: string; a: string; flipped: boolean; ivls: Record<Rating, number> }

export const FLAGS = [
  { n: 1, name: 'Красный', color: '#ef4444' },
  { n: 2, name: 'Оранжевый', color: '#f97316' },
  { n: 3, name: 'Зелёный', color: '#22c55e' },
  { n: 4, name: 'Синий', color: '#3b82f6' },
  { n: 5, name: 'Розовый', color: '#ec4899' },
  { n: 6, name: 'Бирюзовый', color: '#14b8a6' },
  { n: 7, name: 'Фиолетовый', color: '#a855f7' },
]

// «Хорошо» — основной коралловый акцент; остальные — мягкие нейтральные и семантические оттенки
const RATINGS: { r: Rating; label: string; cls: string }[] = [
  { r: 1, label: 'Снова', cls: 'bg-danger-soft text-fg ring-1 ring-inset ring-danger/15' },
  { r: 2, label: 'Трудно', cls: 'bg-warning-soft text-fg ring-1 ring-inset ring-warning/15' },
  { r: 3, label: 'Хорошо', cls: 'bg-accent text-accent-fg shadow-[0_8px_20px_-10px_var(--accent)]' },
  { r: 4, label: 'Легко', cls: 'bg-surface text-fg ring-1 ring-inset ring-line' },
]

/** CSS встроенных типов: к ним применяется типографика Coral Glass */
const BUILTIN_CSS = new Set(DEFAULT_NOTE_TYPES.map((t) => t.css))

/** Что озвучить на этой стороне (null — нечего) */
function ttsFor(view: CardViewData, side: 'q' | 'a', manual = false): { text: string; lang: string } | null {
  const s = view.tts
  if (!s?.lang) return null
  const nt = view.nt
  let fi = nt.fields.indexOf(s.field)
  if (fi < 0) fi = 0
  const tmpl = nt.kind === 'cloze' ? nt.templates[0] : nt.templates[view.card.ord]
  const inQuestion = !!tmpl && templateUsesField(tmpl.qfmt, nt.fields[fi])
  if (side === 'q' && (!inQuestion || nt.kind === 'cloze')) return null
  if (side === 'a' && inQuestion && !manual) return null
  const text = plainText(stripCloze(view.note.fields[fi] ?? ''))
  return text ? { text, lang: s.lang } : null
}

/** Текст ответа для экранного диктора: без повторного чтения вопроса */
function answerText(q: string, a: string): string {
  const qt = stripHtml(q).trim()
  let at = stripHtml(a).trim()
  if (qt && at.startsWith(qt)) at = at.slice(qt.length).trim()
  return at
}

export default function StudyPage({ mix = false }: { mix?: boolean }) {
  const deckId = Number(useParams().id)
  const nav = useNavigate()
  const dark = useIsDark()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [counts, setCounts] = useState<Counts>({ new: 0, learn: 0, review: 0 })
  const [undoCount, setUndoCount] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [flagOpen, setFlagOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState(false)
  const [announce, setAnnounce] = useState('')
  const [deckTitle, setDeckTitle] = useState<string | null>(null)
  const [session, setSession] = useState({ count: 0, started: Date.now() })
  const answered = useRef<number[]>([])
  const srcRef = useRef<StudySource | null>(null)
  const undoStack = useRef<UndoEntry[]>([])
  const learnAhead = useRef(false)
  const shownAt = useRef(0)
  const rootRef = useRef<ShadowRoot | null>(null)
  const busy = useRef(false)

  const exit = useCallback(() => nav(mix ? '/' : `/deck/${deckId}`), [nav, deckId, mix])

  const autoplay = useCallback((view: CardViewData, html: string, side: 'q' | 'a', qHtml = '') => {
    stopAudio()
    stopSpeech()
    if (view.opts.autoplayAudio) {
      let names = soundNames(html)
      if (side === 'a') {
        const q = soundNames(qHtml)
        names = names.filter((n) => {
          const i = q.indexOf(n)
          if (i < 0) return true
          q.splice(i, 1)
          return false
        })
      }
      if (names.length) {
        void playSounds(names)
        return
      }
    }
    const tts = view.tts?.auto ? ttsFor(view, side) : null
    if (tts) speak(tts.text, tts.lang)
  }, [])

  const showCard = useCallback(
    async (card: Card): Promise<boolean> => {
      if (!srcRef.current) return false
      const view = await loadCardView(card)
      if (!view) return false
      const { q } = renderCard(view.nt, view.note, card.ord, view.deck.name)
      setState({ status: 'card', view, q, a: '', flipped: false, ivls: previewIntervals(card, view.opts, schedTime()) })
      setAnnounce('')
      shownAt.current = Date.now()
      autoplay(view, q, 'q')
      return true
    },
    [autoplay],
  )

  const loadNext = useCallback(async () => {
    const src = srcRef.current
    if (!src) return
    for (let attempt = 0; attempt < 20; attempt++) {
      const t = schedTime()
      const card = await src.next(t, learnAhead.current)
      setCounts(await src.counts(t))
      if (!card) {
        stopAudio()
        setState({ status: 'done', nextDue: await src.nextLearnDue(t) })
        return
      }
      if (await showCard(card)) return
      await db.cards.delete(card.id) // карточка без заметки — мусор
    }
  }, [showCard])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await unburyIfNeeded()
      const ctx = mix ? null : await studyContext(deckId)
      const src = mix ? await mixedSource() : ctx ? deckSource(ctx) : null
      if (cancelled) return
      if (!src) {
        nav('/', { replace: true })
        return
      }
      if (ctx) setDeckTitle(leafName(ctx.deck.name))
      srcRef.current = src
      await loadNext()
    })()
    return () => {
      cancelled = true
      stopAudio()
      stopSpeech()
      void requestSync()
    }
  }, [deckId, mix, loadNext, nav])

  // Когда подойдёт время карточки на изучении — показать её
  useEffect(() => {
    if (state.status !== 'done' || !state.nextDue) return
    const ms = Math.min(state.nextDue - Date.now() + 500, 2 ** 31 - 1)
    const timer = setTimeout(() => void loadNext(), Math.max(1000, ms))
    return () => clearTimeout(timer)
  }, [state, loadNext])

  const pushUndo = (e: UndoEntry) => {
    undoStack.current.push(e)
    if (undoStack.current.length > 50) undoStack.current.shift()
    setUndoCount(undoStack.current.length)
  }

  const flip = useCallback(() => {
    if (state.status !== 'card' || state.flipped) return
    const input = rootRef.current?.querySelector<HTMLInputElement>('input.typeans')
    input?.blur()
    const typed = input ? input.value : null
    const { view } = state
    const { a } = renderCard(view.nt, view.note, view.card.ord, view.deck.name, typed)
    setState({ ...state, a, flipped: true })
    setAnnounce(`Ответ: ${answerText(state.q, a)}`)
    autoplay(view, a, 'a', state.q)
  }, [state, autoplay])

  const rate = useCallback(
    async (r: Rating) => {
      // Повторное нажатие до завершения записи игнорируется
      if (state.status !== 'card' || !state.flipped || busy.current) return
      busy.current = true
      setPending(true)
      try {
        pushUndo(await answerCardOp(state.view.card.id, r, Date.now() - shownAt.current))
        answered.current.push(state.view.card.id)
        setSession((s) => ({ ...s, count: s.count + 1 }))
        await loadNext()
      } catch (e) {
        toast(errMsg(e), 'error')
      } finally {
        busy.current = false
        setPending(false)
      }
    },
    [state, loadNext],
  )

  const undo = useCallback(async () => {
    if (busy.current) return
    const e = undoStack.current.pop()
    setUndoCount(undoStack.current.length)
    if (!e) return
    busy.current = true
    try {
      await applyUndo(e)
      if (e.revlogId) {
        setSession((s) => ({ ...s, count: Math.max(0, s.count - 1) }))
        answered.current.pop()
      }
      const card = e.showCardId ? await db.cards.get(e.showCardId) : undefined
      if (srcRef.current) setCounts(await srcRef.current.counts())
      if (!(card && card.queue >= 0 && (await showCard(card)))) await loadNext()
      toast(`Отменено: ${e.label}`)
    } finally {
      busy.current = false
    }
  }, [showCard, loadNext])

  const replay = useCallback(() => {
    if (state.status !== 'card') return
    const html = state.flipped ? state.a : state.q
    const names = soundNames(html)
    if (names.length) {
      void playSounds(names)
      return
    }
    const tts = ttsFor(state.view, state.flipped ? 'a' : 'q', true)
    if (tts) speak(tts.text, tts.lang)
  }, [state])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (menuOpen || flagOpen || editing || document.querySelector('[role=dialog]')) return
      const origin = e.composedPath()[0] as HTMLElement | undefined
      if (origin && (origin.tagName === 'INPUT' || origin.tagName === 'TEXTAREA' || origin.isContentEditable)) return
      // Enter на сфокусированной кнопке нажимает её саму
      if (e.key === 'Enter' && origin?.tagName === 'BUTTON') return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (state.status === 'card') {
          if (state.flipped) void rate(3)
          else flip()
        }
      } else if (/^[1-4]$/.test(e.key)) {
        void rate(Number(e.key) as Rating)
      } else if ((e.key === 'z' && (e.ctrlKey || e.metaKey)) || e.key === 'u') {
        e.preventDefault()
        void undo()
      } else if (e.key === 'e' && state.status === 'card') {
        setEditing(true)
      } else if (e.key === 'r') {
        replay()
      } else if (e.key === 'Escape') {
        exit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, flip, rate, undo, replay, exit, menuOpen, flagOpen, editing])

  async function cardAction(kind: 'bury' | 'suspend' | 'suspendNote' | 'mark' | 'delete') {
    if (state.status !== 'card') return
    const { card, note } = state.view
    try {
      if (kind === 'mark') {
        pushUndo({ ...(await toggleMark(note.id)), showCardId: card.id })
        const fresh = await db.notes.get(note.id)
        if (fresh) setState({ ...state, view: { ...state.view, note: fresh } })
        return
      }
      if (kind === 'delete') {
        const ok = await confirmDialog({
          title: 'Удалить заметку?',
          message: 'Будут удалены все её карточки и прогресс. Это нельзя отменить.',
          confirmText: 'Удалить',
          danger: true,
        })
        if (!ok) return
        await deleteNote(note.id)
        toast('Заметка удалена')
      } else if (kind === 'bury') {
        pushUndo({ ...(await buryCards([card.id])), showCardId: card.id })
        toast('Отложено до завтра')
      } else {
        const ids = kind === 'suspend' ? [card.id] : (await db.cards.where('noteId').equals(note.id).toArray()).map((c) => c.id)
        pushUndo({ ...(await suspendCards(ids)), showCardId: card.id })
        toast(kind === 'suspend' ? 'Карточка приостановлена' : 'Заметка приостановлена')
      }
      await loadNext()
    } catch (e) {
      toast(errMsg(e), 'error')
    }
  }

  async function setFlag(n: number) {
    if (state.status !== 'card') return
    const { card } = state.view
    pushUndo({ ...(await setCardFlag(card.id, n)), showCardId: card.id })
    setState({ ...state, view: { ...state.view, card: { ...card, flags: n } } })
  }

  async function afterEdit() {
    setEditing(false)
    if (state.status !== 'card') return
    const note = await db.notes.get(state.view.note.id)
    if (!note) return void loadNext()
    const view = { ...state.view, note }
    const { q, a } = renderCard(view.nt, note, view.card.ord, view.deck.name)
    setState({ ...state, view, q, a: state.flipped ? a : '' })
  }

  function onCardClick(e: MouseEvent) {
    const path = e.nativeEvent.composedPath()
    if (path.some((el) => el instanceof HTMLElement && el.matches('button, a, input, textarea, select, audio, video'))) return
    if (state.status === 'card' && !state.flipped) flip()
  }

  const current = state.status === 'card' ? state.view : null
  const flag = current ? FLAGS.find((f) => f.n === current.card.flags) : undefined
  const marked = current?.note.tags.includes('marked')
  const canSpeak =
    state.status === 'card' &&
    (soundNames(state.flipped ? state.a : state.q).length > 0 || !!ttsFor(state.view, state.flipped ? 'a' : 'q', true))
  const remaining = counts.new + counts.learn + counts.review
  const progress = session.count + remaining > 0 ? session.count / (session.count + remaining) : 1
  const title = mix ? 'Все колоды' : (deckTitle ?? '')
  const status = current ? cardStatus(current.card) : null
  const builtin = current ? BUILTIN_CSS.has(current.nt.css) : false
  const uniqueCards = new Set(answered.current).size
  const minutes = Math.max(1, Math.round((Date.now() - session.started) / 60000))

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <header className="shrink-0 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-[640px] px-4 pt-2 min-[360px]:px-5">
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold leading-5">{title}</p>
              <p className="text-sm tabular-nums text-muted">{state.status === 'done' ? 'Готово' : `Осталось ${remaining}`}</p>
            </div>
            <IconButton label="Отменить последний ответ" disabled={!undoCount} onClick={() => void undo()} className="text-muted">
              <Undo2 />
            </IconButton>
            <IconButton label="Действия с карточкой" disabled={!current} onClick={() => setMenuOpen(true)} className="text-muted">
              <Ellipsis />
            </IconButton>
            <IconButton label="Закрыть занятие" variant="surface" onClick={exit}>
              <X />
            </IconButton>
          </div>
          <ProgressBar value={progress} label={`Ответов ${session.count}, осталось ${remaining}`} className="mt-2.5" />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 min-[360px]:px-5">
        <div className="mx-auto max-w-[640px] pb-4 pt-4">
          {state.status === 'card' && (
            <article
              onClick={onCardClick}
              className={cn(
                'relative flex min-h-[52dvh] flex-col overflow-hidden rounded-[28px] bg-surface px-5 pb-6 pt-3 shadow-[0_12px_32px_-18px_rgb(32_33_39/0.3)] ring-1 ring-line/70',
                !state.flipped && 'cursor-pointer',
              )}
            >
              {flag && <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: flag.color }} title={`Флажок: ${flag.name}`} />}
              <div className="flex min-h-11 items-center gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                  {status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
                  <span className="truncate">{cardName(state.view.nt, state.view.card.ord)}</span>
                  {mix && <span className="truncate">· {leafName(state.view.deck.name)}</span>}
                  {marked && <Star className="size-4 fill-amber-400 text-amber-500" aria-label="Отмечена" />}
                </div>
                {canSpeak && (
                  <button
                    type="button"
                    aria-label="Озвучить"
                    onClick={replay}
                    className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-text transition active:scale-95"
                  >
                    <Volume2 className="size-5" />
                  </button>
                )}
              </div>
              <div className="flex-1 pb-6 pt-[max(24px,9dvh)]">
                <div key={state.flipped ? 'a' : 'q'} className="animate-reveal">
                  <CardView
                    html={state.flipped ? state.a : state.q}
                    css={state.view.nt.css}
                    dark={dark}
                    coral={builtin}
                    onRoot={(r) => {
                      rootRef.current = r
                    }}
                    onEnter={flip}
                  />
                </div>
              </div>
              {!state.flipped && <p className="text-center text-[15px] text-muted">Вспомните ответ</p>}
            </article>
          )}

          {state.status === 'done' && (
            <div className="flex min-h-[60dvh] animate-pop-in flex-col items-center justify-center text-center">
              <div className="mb-5 grid size-20 place-items-center rounded-full bg-success-soft text-success">
                <CircleCheck className="size-10" aria-hidden />
              </div>
              <h1 className="text-[28px] font-bold leading-9">{session.count > 0 ? 'Занятие завершено' : 'На сегодня всё'}</h1>
              {session.count > 0 ? (
                <dl className="mt-5 grid w-full max-w-sm grid-cols-3 gap-2">
                  <Result label="ответов" value={session.count} />
                  <Result label={cardsWord(uniqueCards)} value={uniqueCards} />
                  <Result label="мин" value={minutes} />
                </dl>
              ) : (
                <p className="mt-2 max-w-xs text-[15px] text-muted">Сегодня нет запланированных карточек.</p>
              )}
              {state.nextDue && (
                <p className="mt-4 max-w-xs text-[15px] text-muted">
                  Следующая карточка на изучении — через {formatInterval((state.nextDue - Date.now()) / 1000)}
                </p>
              )}
              <div className="mt-6 w-full max-w-sm space-y-2">
                <Button size="lg" className="w-full" onClick={() => nav('/')}>
                  К колодам
                </Button>
                {state.nextDue && (
                  <Button
                    variant="soft"
                    size="lg"
                    className="w-full"
                    onClick={() => {
                      learnAhead.current = true
                      void loadNext()
                    }}
                  >
                    <Clock className="size-5" />
                    Учить сейчас
                  </Button>
                )}
                {!mix && (
                  <Button variant="ghost" size="lg" className="w-full" onClick={exit}>
                    Открыть колоду
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {state.status === 'card' && (
        <footer className="shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-2 min-[360px]:px-5">
          <div className="mx-auto max-w-[640px]">
            {!state.flipped ? (
              <Button size="lg" className="min-h-15 w-full text-[18px]" onClick={flip}>
                Показать ответ
              </Button>
            ) : (
              <div className="grid animate-reveal grid-cols-2 gap-2.5" role="group" aria-label="Оценка ответа">
                {RATINGS.map(({ r, label, cls }) => (
                  <button
                    key={r}
                    type="button"
                    disabled={pending}
                    aria-label={`${label}, следующий показ через ${formatInterval(state.ivls[r])}`}
                    onClick={() => void rate(r)}
                    className={cn(
                      'flex min-h-16 flex-col items-center justify-center rounded-[18px] font-semibold transition duration-100 active:scale-[0.97] disabled:opacity-60',
                      cls,
                    )}
                  >
                    <span className="text-[17px] leading-6">{label}</span>
                    <span className="text-sm font-medium opacity-80">{formatInterval(state.ivls[r])}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </footer>
      )}

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <ActionSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Карточка"
        actions={[
          { label: 'Редактировать', icon: <Pencil />, onSelect: () => setEditing(true) },
          { label: 'Флажок', icon: <Flag />, onSelect: () => setFlagOpen(true) },
          { label: marked ? 'Снять отметку' : 'Отметить', icon: <Star />, onSelect: () => void cardAction('mark') },
          { label: 'Отложить до завтра', icon: <EyeOff />, onSelect: () => void cardAction('bury') },
          { label: 'Приостановить карточку', icon: <Pause />, onSelect: () => void cardAction('suspend') },
          { label: 'Приостановить заметку', icon: <Pause />, onSelect: () => void cardAction('suspendNote') },
          { label: 'Удалить заметку', icon: <Trash2 />, danger: true, onSelect: () => void cardAction('delete') },
        ]}
      />

      <Sheet open={flagOpen} onClose={() => setFlagOpen(false)} title="Флажок">
        <div className="grid grid-cols-4 gap-2">
          {FLAGS.map((f) => (
            <button
              key={f.n}
              type="button"
              aria-pressed={current?.card.flags === f.n}
              onClick={() => {
                setFlagOpen(false)
                void setFlag(current?.card.flags === f.n ? 0 : f.n)
              }}
              className={cn(
                'flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-[18px] px-1 py-2.5 text-xs font-medium ring-1 ring-inset transition hover:bg-surface-2',
                current?.card.flags === f.n ? 'bg-accent-soft ring-accent-text' : 'ring-line',
              )}
            >
              <Flag className="size-6" style={{ color: f.color, fill: f.color }} />
              {f.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setFlagOpen(false)
              void setFlag(0)
            }}
            className="flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-[18px] px-1 py-2.5 text-xs font-medium text-muted ring-1 ring-inset ring-line transition hover:bg-surface-2"
          >
            <X className="size-6" />
            Снять
          </button>
        </div>
      </Sheet>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Редактирование">
        {current && <NoteEditForm noteId={current.note.id} onSaved={() => void afterEdit()} onCancel={() => setEditing(false)} />}
      </Sheet>
    </div>
  )
}

function Result({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col-reverse rounded-[18px] bg-surface px-2 py-3 ring-1 ring-line/70">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-[28px] font-bold leading-9 tabular-nums">{value}</dd>
    </div>
  )
}
