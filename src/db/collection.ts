// Операции над коллекцией: колоды, заметки, очереди, ответы, отмена.
import Dexie from 'dexie'
import { db, getConfig, setConfig } from './db'
import { DEFAULT_DECK_NAME, DEFAULT_OPTIONS } from './defaults'
import { CardType, Queue, type Card, type Deck, type DeckOptions, type Note, type NoteType, type TtsSettings } from './types'
import { schedTime, type SchedTime } from '../core/time'
import { activeQueue, answer, type Rating } from '../core/scheduler'
import { cardOrdsForNote, stripCloze } from '../core/template'
import { plainText } from '../core/text'

export const LEARN_AHEAD_MS = 20 * 60_000

const isDefined = <T>(v: T | undefined): v is T => v !== undefined

// ---------- Колоды ----------

export const leafName = (name: string) => name.split('::').pop() ?? name
const isChildOf = (name: string, parent: string) => name.startsWith(parent + '::')

export function normalizeDeckName(name: string): string {
  return name
    .split('::')
    .map((s) => s.trim())
    .filter(Boolean)
    .join('::')
}

export async function subtreeIds(deck: Deck): Promise<number[]> {
  const all = await db.decks.toArray()
  return all.filter((d) => d.id === deck.id || isChildOf(d.name, deck.name)).map((d) => d.id)
}

export async function optionsFor(deck: Deck): Promise<DeckOptions> {
  return (await db.deckOptions.get(deck.optionsId)) ?? (await db.deckOptions.get(1)) ?? { ...DEFAULT_OPTIONS, id: 1 }
}

/** Создаёт колоду (и недостающих родителей), возвращает id */
export async function createDeck(name: string): Promise<number> {
  const clean = normalizeDeckName(name)
  if (!clean) throw new Error('Введите название колоды')
  return db.transaction('rw', db.decks, async () => {
    const parts = clean.split('::')
    let id = 0
    for (let i = 1; i <= parts.length; i++) {
      const n = parts.slice(0, i).join('::')
      const existing = await db.decks.where('name').equals(n).first()
      id = existing ? existing.id : await db.decks.add({ name: n, optionsId: 1, createdAt: Date.now() })
    }
    return id
  })
}

/** Создаёт новую колоду; если имя занято — добавляет «(2)», «(3)»… */
export async function createUniqueDeck(name: string): Promise<number> {
  const base = normalizeDeckName(name) || 'Импорт'
  let candidate = base
  for (let i = 2; await db.decks.where('name').equals(candidate).first(); i++) candidate = `${base} (${i})`
  return createDeck(candidate)
}

/** Имя колоды из имени файла: «italian_words.txt» -> «italian words» */
export function deckNameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Импорт'
}

export async function renameDeck(deck: Deck, newName: string): Promise<void> {
  const clean = normalizeDeckName(newName)
  if (!clean) throw new Error('Введите название колоды')
  if (clean === deck.name) return
  if (isChildOf(clean, deck.name)) throw new Error('Нельзя переместить колоду внутрь самой себя')
  const clash = await db.decks.where('name').equals(clean).first()
  if (clash) throw new Error('Колода с таким названием уже есть')
  await db.transaction('rw', db.decks, async () => {
    const all = await db.decks.toArray()
    for (const d of all) {
      if (d.id === deck.id) await db.decks.update(d.id, { name: clean })
      else if (isChildOf(d.name, deck.name)) await db.decks.update(d.id, { name: clean + d.name.slice(deck.name.length) })
    }
  })
  const parent = clean.includes('::') ? clean.slice(0, clean.lastIndexOf('::')) : ''
  if (parent) await createDeck(parent)
}

export async function deleteDeck(deck: Deck): Promise<void> {
  const ids = await subtreeIds(deck)
  await db.transaction('rw', db.decks, db.cards, db.notes, async () => {
    const cards = await db.cards.where('deckId').anyOf(ids).toArray()
    const noteIds = [...new Set(cards.map((c) => c.noteId))]
    await db.cards.bulkDelete(cards.map((c) => c.id))
    for (const noteId of noteIds) {
      if ((await db.cards.where('noteId').equals(noteId).count()) === 0) await db.notes.delete(noteId)
    }
    await db.decks.bulkDelete(ids)
    if ((await db.decks.count()) === 0) {
      await db.decks.add({ name: DEFAULT_DECK_NAME, optionsId: 1, createdAt: Date.now() })
    }
  })
}

// ---------- Счётчики ----------

export interface Counts {
  new: number
  learn: number
  review: number
}

interface RawCounts {
  newAvail: number
  learn: number
  review: number
  newDone: number
  revDone: number
  total: number
}

const idx = '[deckId+queue+due]'

async function rawCounts(deckId: number, t: SchedTime): Promise<RawCounts> {
  const [newAvail, learn, dayLearn, review, logs, total] = await Promise.all([
    db.cards.where(idx).between([deckId, Queue.New, Dexie.minKey], [deckId, Queue.New, Dexie.maxKey]).count(),
    db.cards.where(idx).between([deckId, Queue.Learn, Dexie.minKey], [deckId, Queue.Learn, t.dayEnd]).count(),
    db.cards.where(idx).between([deckId, Queue.DayLearn, Dexie.minKey], [deckId, Queue.DayLearn, t.today], true, true).count(),
    db.cards.where(idx).between([deckId, Queue.Review, Dexie.minKey], [deckId, Queue.Review, t.today], true, true).count(),
    db.revlog.where('[deckId+time]').between([deckId, t.dayStart], [deckId, Dexie.maxKey]).toArray(),
    db.cards.where('deckId').equals(deckId).count(),
  ])
  return {
    newAvail,
    learn: learn + dayLearn,
    review,
    newDone: logs.filter((l) => l.isNew).length,
    revDone: logs.filter((l) => l.type === 1).length,
    total,
  }
}

const addRaw = (a: RawCounts, b: RawCounts): RawCounts => ({
  newAvail: a.newAvail + b.newAvail,
  learn: a.learn + b.learn,
  review: a.review + b.review,
  newDone: a.newDone + b.newDone,
  revDone: a.revDone + b.revDone,
  total: a.total + b.total,
})

const limitCounts = (s: RawCounts, o: DeckOptions): Counts => ({
  new: Math.min(s.newAvail, Math.max(0, o.newPerDay - s.newDone)),
  learn: s.learn,
  review: Math.min(s.review, Math.max(0, o.revPerDay - s.revDone)),
})

export interface DeckNode {
  deck: Deck
  name: string
  depth: number
  children: DeckNode[]
  counts: Counts
  total: number
}

export async function deckTree(): Promise<DeckNode[]> {
  const t = schedTime()
  const [decks, optsList] = await Promise.all([db.decks.toArray(), db.deckOptions.toArray()])
  const optsMap = new Map(optsList.map((o) => [o.id, o]))
  const raws = await Promise.all(decks.map((d) => rawCounts(d.id, t)))
  const rawMap = new Map(decks.map((d, i) => [d.id, raws[i]]))
  decks.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  const byName = new Map(decks.map((d) => [d.name, d]))
  const childrenOf = new Map<number, Deck[]>()
  const roots: Deck[] = []
  for (const d of decks) {
    const parent = d.name.includes('::') ? byName.get(d.name.slice(0, d.name.lastIndexOf('::'))) : undefined
    if (!parent) {
      roots.push(d)
      continue
    }
    const list = childrenOf.get(parent.id) ?? []
    list.push(d)
    childrenOf.set(parent.id, list)
  }
  const build = (d: Deck, depth: number): { node: DeckNode; sum: RawCounts } => {
    const kids = (childrenOf.get(d.id) ?? []).map((k) => build(k, depth + 1))
    const sum = kids.reduce((s, k) => addRaw(s, k.sum), rawMap.get(d.id)!)
    const o = optsMap.get(d.optionsId) ?? optsMap.get(1) ?? { ...DEFAULT_OPTIONS, id: 1 }
    const node: DeckNode = {
      deck: d,
      name: leafName(d.name),
      depth,
      children: kids.map((k) => k.node),
      counts: limitCounts(sum, o),
      total: sum.total,
    }
    return { node, sum }
  }
  const tree = roots.map((r) => build(r, 0).node)
  // Как в Anki: пустая колода по умолчанию скрыта, если есть другие
  return tree.filter((n) => !(n.deck.name === DEFAULT_DECK_NAME && n.total === 0 && n.children.length === 0 && tree.length > 1))
}

/** Сегодня: count — ответов, cards — уникальных карточек, ms — время ответов */
export async function todayStats(): Promise<{ count: number; cards: number; ms: number }> {
  const t = schedTime()
  const logs = await db.revlog.where('time').aboveOrEqual(t.dayStart).toArray()
  return { count: logs.length, cards: new Set(logs.map((l) => l.cardId)).size, ms: logs.reduce((s, l) => s + l.duration, 0) }
}

// ---------- Учёба ----------

export interface StudyCtx {
  deck: Deck
  ids: number[]
  opts: DeckOptions
}

export async function studyContext(deckId: number): Promise<StudyCtx | null> {
  const deck = await db.decks.get(deckId)
  if (!deck) return null
  const [ids, opts] = await Promise.all([subtreeIds(deck), optionsFor(deck)])
  return { deck, ids, opts }
}

export async function studyCounts(ctx: StudyCtx, t = schedTime()): Promise<Counts> {
  const raws = await Promise.all(ctx.ids.map((id) => rawCounts(id, t)))
  const zero: RawCounts = { newAvail: 0, learn: 0, review: 0, newDone: 0, revDone: 0, total: 0 }
  return limitCounts(raws.reduce(addRaw, zero), ctx.opts)
}

export async function deckInfo(deckId: number) {
  const ctx = await studyContext(deckId)
  if (!ctx) return null
  const t = schedTime()
  const [counts, cards] = await Promise.all([studyCounts(ctx, t), db.cards.where('deckId').anyOf(ctx.ids).toArray()])
  const totals = { total: cards.length, notes: new Set(cards.map((c) => c.noteId)).size, new: 0, learning: 0, young: 0, mature: 0, suspended: 0 }
  for (const c of cards) {
    if (c.queue === Queue.Suspended) totals.suspended++
    else if (c.type === CardType.New) totals.new++
    else if (c.type !== CardType.Review) totals.learning++
    else if (c.ivl >= 21) totals.mature++
    else totals.young++
  }
  return { ...ctx, counts, totals, nextLearn: await nextLearningDue(ctx, t) }
}

async function firstDue(ids: number[], queue: Queue, upper: number, inclusive = true): Promise<Card | undefined> {
  let best: Card | undefined
  for (const id of ids) {
    const c = await db.cards.where(idx).between([id, queue, Dexie.minKey], [id, queue, upper], true, inclusive).first()
    if (c && (!best || c.due < best.due)) best = c
  }
  return best
}

/** Следующая карточка: обучение -> (повторения + новые вперемешку) -> обучение наперёд */
export async function pickNextCard(ctx: StudyCtx, t: SchedTime, learnAhead: boolean): Promise<Card | null> {
  const learnNow = await firstDue(ctx.ids, Queue.Learn, t.now)
  if (learnNow) return learnNow
  const dayLearn = await firstDue(ctx.ids, Queue.DayLearn, t.today)
  if (dayLearn) return dayLearn
  const counts = await studyCounts(ctx, t)
  const review = counts.review > 0 ? await firstDue(ctx.ids, Queue.Review, t.today) : undefined
  const fresh = counts.new > 0 ? await firstDue(ctx.ids, Queue.New, Number.MAX_SAFE_INTEGER) : undefined
  if (review && fresh) return Math.random() < counts.new / (counts.new + counts.review) ? fresh : review
  if (review || fresh) return (review ?? fresh)!
  return (await firstDue(ctx.ids, Queue.Learn, learnAhead ? t.dayEnd : t.now + LEARN_AHEAD_MS, false)) ?? null
}

export async function nextLearningDue(ctx: StudyCtx, t = schedTime()): Promise<number | null> {
  const c = await firstDue(ctx.ids, Queue.Learn, t.dayEnd, false)
  return c ? c.due : null
}

/** Откуда берутся карточки на экране учёбы: одна колода или все вперемешку */
export interface StudySource {
  counts(t?: SchedTime): Promise<Counts>
  next(t: SchedTime, learnAhead: boolean): Promise<Card | null>
  nextLearnDue(t?: SchedTime): Promise<number | null>
}

export function deckSource(ctx: StudyCtx): StudySource {
  return {
    counts: (t) => studyCounts(ctx, t),
    next: (t, ahead) => pickNextCard(ctx, t, ahead),
    nextLearnDue: (t) => nextLearningDue(ctx, t),
  }
}

function subtreeOf(node: DeckNode, out: number[] = []): number[] {
  out.push(node.deck.id)
  node.children.forEach((c) => subtreeOf(c, out))
  return out
}

async function takeDue(ids: number[], queue: Queue, upper: number, limit: number): Promise<Card[]> {
  if (limit <= 0) return []
  const all: Card[] = []
  for (const id of ids) {
    const range = db.cards.where(idx).between([id, queue, Dexie.minKey], [id, queue, upper], true, true)
    // IndexedDB принимает лимит не больше 2^32-1
    all.push(...(await (limit < 1e9 ? range.limit(limit) : range).toArray()))
  }
  return all.sort((a, b) => a.due - b.due).slice(0, limit)
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

/** Карточки на сегодня из всех колод (с учётом лимитов каждой колоды), в случайном порядке */
export async function buildMixedQueue(t: SchedTime): Promise<number[]> {
  const ids: number[] = []
  for (const top of await deckTree()) {
    const deckIds = subtreeOf(top)
    const dayLearn = await takeDue(deckIds, Queue.DayLearn, t.today, Number.MAX_SAFE_INTEGER)
    const reviews = await takeDue(deckIds, Queue.Review, t.today, top.counts.review)
    const fresh = await takeDue(deckIds, Queue.New, Number.MAX_SAFE_INTEGER, top.counts.new)
    ids.push(...[...dayLearn, ...reviews, ...fresh].map((c) => c.id))
  }
  return shuffle(ids)
}

const isDueToday = (c: Card, t: SchedTime) =>
  c.queue === Queue.New || ((c.queue === Queue.Review || c.queue === Queue.DayLearn) && c.due <= t.today)

export async function mixedSource(): Promise<StudySource> {
  let queue: number[] = []
  const allIds = async () => (await db.decks.toCollection().primaryKeys()) as number[]
  return {
    async counts() {
      const tree = await deckTree()
      const zero: Counts = { new: 0, learn: 0, review: 0 }
      return tree.reduce((s, n) => ({ new: s.new + n.counts.new, learn: s.learn + n.counts.learn, review: s.review + n.counts.review }), zero)
    },
    async next(t, learnAhead) {
      const ids = await allIds()
      // Карточки на шагах обучения показываем вовремя, иначе собьются интервалы
      const learnNow = await firstDue(ids, Queue.Learn, t.now)
      if (learnNow) return learnNow
      let rebuilt = false
      for (;;) {
        if (!queue.length) {
          if (rebuilt) break
          queue = await buildMixedQueue(t)
          rebuilt = true
          if (!queue.length) break
        }
        const card = await db.cards.get(queue.pop()!)
        if (card && isDueToday(card, t)) return card
      }
      return (await firstDue(ids, Queue.Learn, learnAhead ? t.dayEnd : t.now + LEARN_AHEAD_MS, false)) ?? null
    },
    async nextLearnDue(t = schedTime()) {
      const c = await firstDue(await allIds(), Queue.Learn, t.dayEnd, false)
      return c ? c.due : null
    },
  }
}

export interface CardViewData {
  card: Card
  note: Note
  nt: NoteType
  deck: Deck
  opts: DeckOptions
  tts?: TtsSettings
}

/** Озвучка колоды или ближайшей родительской колоды */
async function ttsFor(deck: Deck): Promise<TtsSettings | undefined> {
  if (deck.tts?.lang) return deck.tts
  const parts = deck.name.split('::')
  for (let i = parts.length - 1; i > 0; i--) {
    const parent = await db.decks.where('name').equals(parts.slice(0, i).join('::')).first()
    if (parent?.tts?.lang) return parent.tts
  }
  return undefined
}

export async function loadCardView(card: Card): Promise<CardViewData | null> {
  const [note, deck] = await Promise.all([db.notes.get(card.noteId), db.decks.get(card.deckId)])
  if (!note) return null
  const nt = await db.noteTypes.get(note.noteTypeId)
  const d = deck ?? (await db.decks.toCollection().first())
  if (!nt || !d) return null
  const [opts, tts] = await Promise.all([optionsFor(d), ttsFor(d)])
  return { card, note, nt, deck: d, opts, tts }
}

export interface UndoEntry {
  label: string
  cards: Card[]
  note?: Note
  revlogId?: number
  showCardId?: number
}

export async function answerCardOp(cardId: number, rating: Rating, durationMs: number): Promise<UndoEntry> {
  return db.transaction('rw', [db.cards, db.revlog, db.notes, db.decks, db.deckOptions], async () => {
    const card = await db.cards.get(cardId)
    if (!card) throw new Error('Карточка не найдена')
    const deck = await db.decks.get(card.deckId)
    const opts = deck ? await optionsFor(deck) : { ...DEFAULT_OPTIONS, id: 1 }
    const t = schedTime()
    const out = answer(card, rating, opts, t)
    await db.cards.put(out.card)
    const revlogId = await db.revlog.add({
      cardId,
      deckId: card.deckId,
      time: t.now,
      rating,
      ivl: out.logIvl,
      lastIvl: out.lastIvl,
      ease: out.card.ease,
      duration: Math.min(60_000, Math.max(0, Math.round(durationMs))),
      type: out.logType,
      isNew: card.type === CardType.New,
    })
    const before: Card[] = [card]
    let noteBefore: Note | undefined
    if (out.leech) {
      const note = await db.notes.get(card.noteId)
      if (note && !note.tags.includes('leech')) {
        noteBefore = note
        await db.notes.put({ ...note, tags: [...note.tags, 'leech'], modifiedAt: t.now })
      }
    }
    if (opts.buryNew || opts.buryReview) {
      const siblings = await db.cards.where('noteId').equals(card.noteId).toArray()
      for (const s of siblings) {
        if (s.id === card.id) continue
        const due = (s.queue === Queue.Review || s.queue === Queue.DayLearn) && s.due <= t.today
        if ((opts.buryNew && s.queue === Queue.New) || (opts.buryReview && due)) {
          before.push(s)
          await db.cards.put({ ...s, queue: Queue.SiblingBuried, modifiedAt: t.now })
        }
      }
    }
    return { label: 'ответ', cards: before, note: noteBefore, revlogId, showCardId: cardId }
  })
}

export async function applyUndo(e: UndoEntry): Promise<void> {
  await db.transaction('rw', db.cards, db.notes, db.revlog, async () => {
    if (e.cards.length) await db.cards.bulkPut(e.cards)
    if (e.note) await db.notes.put(e.note)
    if (e.revlogId) await db.revlog.delete(e.revlogId)
  })
}

/** Возвращает отложенные карточки при наступлении нового дня */
export async function unburyIfNeeded(): Promise<void> {
  const today = schedTime().today
  if ((await getConfig('lastUnburyDay', -1)) === today) return
  await db.transaction('rw', db.cards, db.config, async () => {
    await db.cards
      .where('queue')
      .anyOf(Queue.SiblingBuried, Queue.ManualBuried)
      .modify((c) => {
        c.queue = activeQueue(c)
      })
    await setConfig('lastUnburyDay', today)
  })
}

// ---------- Действия с карточками ----------

async function setQueue(ids: number[], queue: Queue, label: string): Promise<UndoEntry> {
  return db.transaction('rw', db.cards, async () => {
    const cards = (await db.cards.bulkGet(ids)).filter(isDefined)
    const now = Date.now()
    await db.cards.bulkPut(cards.map((c) => ({ ...c, queue, modifiedAt: now })))
    return { label, cards }
  })
}

export const buryCards = (ids: number[]) => setQueue(ids, Queue.ManualBuried, 'отложить')
export const suspendCards = (ids: number[]) => setQueue(ids, Queue.Suspended, 'приостановить')

export async function restoreCards(ids: number[]): Promise<void> {
  await db.cards
    .where('id')
    .anyOf(ids)
    .modify((c) => {
      if (c.queue < 0) c.queue = activeQueue(c)
    })
}

export async function setCardFlag(id: number, flag: number): Promise<UndoEntry> {
  const card = await db.cards.get(id)
  if (!card) throw new Error('Карточка не найдена')
  await db.cards.put({ ...card, flags: flag, modifiedAt: Date.now() })
  return { label: 'флажок', cards: [card] }
}

export async function toggleMark(noteId: number): Promise<UndoEntry> {
  const note = await db.notes.get(noteId)
  if (!note) throw new Error('Заметка не найдена')
  const tags = note.tags.includes('marked') ? note.tags.filter((t) => t !== 'marked') : [...note.tags, 'marked']
  await db.notes.put({ ...note, tags, modifiedAt: Date.now() })
  return { label: 'отметка', cards: [], note }
}

export async function forgetCards(ids: number[]): Promise<void> {
  await db.transaction('rw', db.cards, db.config, async () => {
    const pos = await nextPositions(ids.length)
    const cards = (await db.cards.bulkGet(ids)).filter(isDefined)
    const now = Date.now()
    await db.cards.bulkPut(
      cards.map((c, i) => ({ ...c, type: CardType.New, queue: Queue.New, due: pos + i, ivl: 0, ease: 0, left: 0, modifiedAt: now })),
    )
  })
}

// ---------- Заметки ----------

export async function nextPositions(n: number): Promise<number> {
  const pos = await getConfig('nextPos', 1)
  await setConfig('nextPos', pos + n)
  return pos
}

export function newGuid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function sortTextOf(fields: string[]): string {
  return plainText(stripCloze(fields[0] ?? '')).toLowerCase()
}

export function blankCard(noteId: number, deckId: number, ord: number, due: number, now: number): Omit<Card, 'id'> {
  return {
    noteId, deckId, ord, due, type: CardType.New, queue: Queue.New, ivl: 0, ease: 0, reps: 0, lapses: 0, left: 0,
    flags: 0, createdAt: now, modifiedAt: now,
  }
}

export async function isDuplicate(noteTypeId: number, firstField: string, excludeId?: number): Promise<boolean> {
  const key = sortTextOf([firstField])
  if (!key) return false
  const n = await db.notes
    .where('noteTypeId')
    .equals(noteTypeId)
    .filter((x) => x.sortText === key && x.id !== excludeId)
    .count()
  return n > 0
}

export async function addNote(nt: NoteType, deckId: number, fields: string[], tags: string[]): Promise<{ noteId: number; cards: number }> {
  const ords = cardOrdsForNote(nt, fields)
  if (ords.length === 0) {
    throw new Error(
      nt.kind === 'cloze' ? 'Добавьте хотя бы один пропуск: {{c1::текст}}' : 'Заполните поле для лицевой стороны карточки',
    )
  }
  return db.transaction('rw', db.notes, db.cards, db.config, async () => {
    const now = Date.now()
    const noteId = await db.notes.add({
      guid: newGuid(), noteTypeId: nt.id, fields, tags, sortText: sortTextOf(fields), createdAt: now, modifiedAt: now,
    })
    const pos = await nextPositions(1)
    await db.cards.bulkAdd(ords.map((ord) => blankCard(noteId, deckId, ord, pos, now)))
    return { noteId, cards: ords.length }
  })
}

/** Сохраняет поля и создаёт карточки для новых шаблонов. Возвращает число новых карточек */
export async function updateNote(noteId: number, fields: string[], tags: string[]): Promise<number> {
  return db.transaction('rw', [db.notes, db.cards, db.noteTypes, db.config], async () => {
    const note = await db.notes.get(noteId)
    if (!note) throw new Error('Заметка не найдена')
    const nt = await db.noteTypes.get(note.noteTypeId)
    if (!nt) throw new Error('Тип заметки не найден')
    const now = Date.now()
    await db.notes.put({ ...note, fields, tags, sortText: sortTextOf(fields), modifiedAt: now })
    const existing = await db.cards.where('noteId').equals(noteId).toArray()
    const have = new Set(existing.map((c) => c.ord))
    const missing = cardOrdsForNote(nt, fields).filter((o) => !have.has(o))
    if (missing.length) {
      const deckId = existing[0]?.deckId ?? 1
      const pos = await nextPositions(1)
      await db.cards.bulkAdd(missing.map((o) => blankCard(noteId, deckId, o, pos, now)))
    }
    return missing.length
  })
}

export async function deleteNote(noteId: number): Promise<void> {
  await db.transaction('rw', db.notes, db.cards, async () => {
    await db.cards.where('noteId').equals(noteId).delete()
    await db.notes.delete(noteId)
  })
}

export async function moveNoteCards(noteId: number, deckId: number): Promise<void> {
  await db.cards
    .where('noteId')
    .equals(noteId)
    .modify((c) => {
      c.deckId = deckId
    })
}

// ---------- Поиск ----------

export interface NoteHit {
  note: Note
  /** Карточки заметки в выбранной области поиска, по порядку шаблонов */
  cards: Card[]
}

export type CardStatusKey = 'new' | 'learn' | 'review' | 'suspended' | 'buried'

export function cardStatusKey(c: Card): CardStatusKey {
  if (c.queue === Queue.Suspended) return 'suspended'
  if (c.queue < 0) return 'buried'
  if (c.type === CardType.New) return 'new'
  if (c.queue === Queue.Learn || c.queue === Queue.DayLearn) return 'learn'
  return 'review'
}

export async function searchNotes(
  query: string,
  deckId: number,
  status: CardStatusKey | '' = '',
  limit = 200,
): Promise<{ total: number; totalCards: number; hits: NoteHit[] }> {
  let cards: Card[]
  if (deckId) {
    const deck = await db.decks.get(deckId)
    cards = deck ? await db.cards.where('deckId').anyOf(await subtreeIds(deck)).toArray() : []
  } else {
    cards = await db.cards.toArray()
  }
  const byNote = new Map<number, Card[]>()
  for (const c of cards) {
    const list = byNote.get(c.noteId)
    if (list) list.push(c)
    else byNote.set(c.noteId, [c])
  }
  const notes = deckId ? (await db.notes.bulkGet([...byNote.keys()])).filter(isDefined) : await db.notes.toArray()
  const terms = query.trim().toLowerCase().split(/s+/).filter(Boolean)
  const filtered = notes.filter((n) => {
    if (status && !(byNote.get(n.id) ?? []).some((c) => cardStatusKey(c) === status)) return false
    if (!terms.length) return true
    const hay = `${plainText(stripCloze(n.fields.join(' ')))} ${n.tags.join(' ')}`.toLowerCase()
    return terms.every((term) => hay.includes(term))
  })
  filtered.sort((a, b) => b.createdAt - a.createdAt)
  const totalCards = filtered.reduce((sum, n) => sum + (byNote.get(n.id)?.length ?? 0), 0)
  const hits = filtered.slice(0, limit).map((note) => ({ note, cards: (byNote.get(note.id) ?? []).sort((a, b) => a.ord - b.ord) }))
  return { total: filtered.length, totalCards, hits }
}
