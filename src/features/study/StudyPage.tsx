import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Clock, Ellipsis, EyeOff, Flag, PartyPopper, Pause, Pencil, Star, Trash2, Undo2, Volume2, X } from 'lucide-react'
import { db } from '../../db/db'
import {
  answerCardOp,
  applyUndo,
  buryCards,
  deleteNote,
  loadCardView,
  nextLearningDue,
  pickNextCard,
  setCardFlag,
  studyContext,
  studyCounts,
  suspendCards,
  toggleMark,
  unburyIfNeeded,
  type CardViewData,
  type Counts,
  type StudyCtx,
  type UndoEntry,
} from '../../db/collection'
import { Queue, type Card } from '../../db/types'
import { previewIntervals, type Rating } from '../../core/scheduler'
import { renderCard, stripCloze, templateUsesField } from '../../core/template'
import { plainText } from '../../core/text'
import { schedTime } from '../../core/time'
import { cardsWord, errMsg, formatInterval } from '../../core/format'
import { playSounds, soundNames, stopAudio } from '../../core/media'
import { speak, stopSpeech } from '../../core/tts'
import { useIsDark } from '../../app/theme'
import { Button, IconButton } from '../../ui/Button'
import { ActionSheet, Sheet } from '../../ui/Sheet'
import { confirmDialog } from '../../ui/dialogs'
import { toast } from '../../ui/toast'
import { cn } from '../../ui/cn'
import { NoteEditForm } from '../editor/NoteEditForm'
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

const RATINGS: { r: Rating; label: string; cls: string }[] = [
  { r: 1, label: 'Снова', cls: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' },
  { r: 2, label: 'Трудно', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  { r: 3, label: 'Хорошо', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  { r: 4, label: 'Легко', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-400' },
]

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

export default function StudyPage() {
  const deckId = Number(useParams().id)
  const nav = useNavigate()
  const dark = useIsDark()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [counts, setCounts] = useState<Counts>({ new: 0, learn: 0, review: 0 })
  const [undoCount, setUndoCount] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [flagOpen, setFlagOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [session, setSession] = useState({ count: 0, started: Date.now() })
  const ctxRef = useRef<StudyCtx | null>(null)
  const undoStack = useRef<UndoEntry[]>([])
  const learnAhead = useRef(false)
  const shownAt = useRef(0)
  const rootRef = useRef<ShadowRoot | null>(null)
  const busy = useRef(false)

  const exit = useCallback(() => nav(`/deck/${deckId}`), [nav, deckId])

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
      const ctx = ctxRef.current
      if (!ctx) return false
      const view = await loadCardView(card, ctx.deck)
      if (!view) return false
      const { q } = renderCard(view.nt, view.note, card.ord, view.deck.name)
      setState({ status: 'card', view, q, a: '', flipped: false, ivls: previewIntervals(card, view.opts, schedTime()) })
      shownAt.current = Date.now()
      autoplay(view, q, 'q')
      return true
    },
    [autoplay],
  )

  const loadNext = useCallback(async () => {
    const ctx = ctxRef.current
    if (!ctx) return
    for (let attempt = 0; attempt < 20; attempt++) {
      const t = schedTime()
      const card = await pickNextCard(ctx, t, learnAhead.current)
      setCounts(await studyCounts(ctx, t))
      if (!card) {
        stopAudio()
        setState({ status: 'done', nextDue: await nextLearningDue(ctx, t) })
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
      const ctx = await studyContext(deckId)
      if (cancelled) return
      if (!ctx) {
        nav('/', { replace: true })
        return
      }
      ctxRef.current = ctx
      await loadNext()
    })()
    return () => {
      cancelled = true
      stopAudio()
      stopSpeech()
      void requestSync()
    }
  }, [deckId, loadNext, nav])

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
    autoplay(view, a, 'a', state.q)
  }, [state, autoplay])

  const rate = useCallback(
    async (r: Rating) => {
      if (state.status !== 'card' || !state.flipped || busy.current) return
      busy.current = true
      try {
        pushUndo(await answerCardOp(state.view.card.id, r, Date.now() - shownAt.current))
        setSession((s) => ({ ...s, count: s.count + 1 }))
        await loadNext()
      } catch (e) {
        toast(errMsg(e), 'error')
      } finally {
        busy.current = false
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
      if (e.revlogId) setSession((s) => ({ ...s, count: Math.max(0, s.count - 1) }))
      const card = e.showCardId ? await db.cards.get(e.showCardId) : undefined
      if (ctxRef.current) setCounts(await studyCounts(ctxRef.current))
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
          message: 'Будут удалены все её карточки. Это нельзя отменить.',
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
  const kind = current ? (current.card.queue === Queue.New ? 'new' : current.card.queue === Queue.Review ? 'review' : 'learn') : null
  const flag = current ? FLAGS.find((f) => f.n === current.card.flags) : undefined
  const marked = current?.note.tags.includes('marked')
  const canSpeak =
    state.status === 'card' &&
    (soundNames(state.flipped ? state.a : state.q).length > 0 || !!ttsFor(state.view, state.flipped ? 'a' : 'q', true))

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <header className="shrink-0 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-1 px-2">
          <IconButton label="Закрыть" onClick={exit}>
            <X />
          </IconButton>
          <div className="flex flex-1 items-center justify-center gap-5 text-base font-bold tabular-nums">
            <CountBadge v={counts.new} cls="text-new" active={kind === 'new'} label="Новые" />
            <CountBadge v={counts.learn} cls="text-learn" active={kind === 'learn'} label="Изучаются" />
            <CountBadge v={counts.review} cls="text-review" active={kind === 'review'} label="Повторения" />
          </div>
          <IconButton label="Отменить" disabled={!undoCount} onClick={() => void undo()}>
            <Undo2 />
          </IconButton>
          <IconButton label="Действия" disabled={!current} onClick={() => setMenuOpen(true)}>
            <Ellipsis />
          </IconButton>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4">
        <div className="mx-auto max-w-2xl pb-6 pt-2">
          {state.status === 'card' && (
            <article
              onClick={onCardClick}
              className={cn(
                'relative min-h-[50dvh] overflow-hidden rounded-3xl border border-line bg-surface px-5 pb-10 pt-12 shadow-sm',
                !state.flipped && 'cursor-pointer',
              )}
            >
              {flag && <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: flag.color }} />}
              <div className="absolute left-4 top-4 flex items-center gap-2 text-xs font-medium text-muted">
                {marked && <Star className="size-4 fill-amber-400 text-amber-400" />}
                <span className="max-w-48 truncate">{current?.deck.name.split('::').pop()}</span>
              </div>
              {canSpeak && (
                <button
                  type="button"
                  aria-label="Озвучить"
                  onClick={replay}
                  className="absolute right-3 top-3 grid size-10 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-accent"
                >
                  <Volume2 className="size-5" />
                </button>
              )}
              <div key={state.flipped ? 'a' : 'q'} className="animate-fade-in">
                <CardView
                  html={state.flipped ? state.a : state.q}
                  css={state.view.nt.css}
                  dark={dark}
                  onRoot={(r) => {
                    rootRef.current = r
                  }}
                  onEnter={flip}
                />
              </div>
            </article>
          )}

          {state.status === 'done' && (
            <div className="flex min-h-[65dvh] animate-pop-in flex-col items-center justify-center text-center">
              <div className="mb-5 grid size-20 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <PartyPopper className="size-10" />
              </div>
              <h2 className="text-2xl font-bold">На сегодня всё!</h2>
              <p className="mt-2 max-w-xs text-muted">
                {session.count > 0
                  ? `За эту сессию: ${session.count} ${cardsWord(session.count)}, ${Math.max(1, Math.round((Date.now() - session.started) / 60000))} мин.`
                  : 'Новых карточек и повторений больше нет.'}
              </p>
              {state.nextDue && (
                <p className="mt-1 text-sm text-muted">
                  Следующая карточка на изучении — через {formatInterval((state.nextDue - Date.now()) / 1000)}
                </p>
              )}
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {state.nextDue && (
                  <Button
                    variant="soft"
                    onClick={() => {
                      learnAhead.current = true
                      void loadNext()
                    }}
                  >
                    <Clock className="size-4" />
                    Учить сейчас
                  </Button>
                )}
                <Button variant="secondary" onClick={exit}>
                  К колоде
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      {state.status === 'card' && (
        <footer className="shrink-0 border-t border-line/70 bg-surface/85 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur-xl">
          <div className="mx-auto max-w-2xl">
            {!state.flipped ? (
              <Button size="lg" className="h-16 w-full text-[17px]" onClick={flip}>
                Показать ответ
              </Button>
            ) : (
              <div className="grid animate-pop-in grid-cols-4 gap-2">
                {RATINGS.map(({ r, label, cls }) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => void rate(r)}
                    className={cn('flex h-16 flex-col items-center justify-center rounded-2xl font-semibold transition active:scale-95', cls)}
                  >
                    <span className="text-[15px]">{label}</span>
                    <span className="text-xs font-medium opacity-75">{formatInterval(state.ivls[r])}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </footer>
      )}

      <ActionSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
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
              onClick={() => {
                setFlagOpen(false)
                void setFlag(current?.card.flags === f.n ? 0 : f.n)
              }}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-xs font-medium transition hover:bg-surface-2',
                current?.card.flags === f.n ? 'border-accent' : 'border-line',
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
            className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-line px-2 py-3 text-xs font-medium text-muted transition hover:bg-surface-2"
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

function CountBadge({ v, cls, active, label }: { v: number; cls: string; active: boolean; label: string }) {
  return (
    <span title={label} className={cn('relative px-1', v ? cls : 'text-muted/40')}>
      {v}
      {active && <span className="absolute -bottom-1.5 left-0 right-0 h-0.5 rounded-full bg-current" />}
    </span>
  )
}
