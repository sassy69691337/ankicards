// Запись данных из .apkg в коллекцию
import { db } from '../db/db'
import { createDeck, nextPositions, sortTextOf } from '../db/collection'
import { DEFAULT_DECK_NAME, DEFAULT_OPTIONS } from '../db/defaults'
import { CardType, Queue, type Card, type DeckOptions, type Note, type NoteType, type RevLog } from '../db/types'
import { activeQueue } from '../core/scheduler'
import { schedTime } from '../core/time'
import { clearMediaCache } from '../core/media'
import type { AnkiCard, AnkiConf, AnkiModel, ApkgData } from './apkgRead'
import { emptyReport, type ImportReport, type Progress } from './importText'
import { mimeOf } from './files'

export interface ApkgOptions {
  /** Перенести интервалы и историю повторений */
  withProgress: boolean
  /** Что делать с заметками, которые уже есть (по GUID) */
  dupMode: 'skip' | 'update'
}

export interface ApkgSummary {
  notes: number
  cards: number
  media: number
  decks: string[]
  hasProgress: boolean
}

const CHUNK = 1000
const MEDIA_BATCH = 40

const ankiDeckName = (name: string) => (name === 'Default' ? DEFAULT_DECK_NAME : name)

export function summarize(data: ApkgData): ApkgSummary {
  const used = new Set(data.cards.map((c) => c.odid || c.did))
  const decks = [...used].map((id) => ankiDeckName(data.decks.get(id)?.name ?? 'Импорт')).sort((a, b) => a.localeCompare(b, 'ru'))
  return {
    notes: data.notes.length,
    cards: data.cards.length,
    media: data.media.length,
    decks,
    hasProgress: data.cards.some((c) => c.type !== 0) || data.revlog.length > 0,
  }
}

function sameShape(nt: NoteType, m: AnkiModel): boolean {
  return (
    nt.kind === (m.type === 1 ? 'cloze' : 'standard') &&
    nt.fields.length === m.flds.length &&
    nt.fields.every((f, i) => f === m.flds[i].name) &&
    nt.templates.length === m.tmpls.length &&
    nt.templates.every((t, i) => t.qfmt === m.tmpls[i].qfmt && t.afmt === m.tmpls[i].afmt)
  )
}

const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)

function confToOptions(c: AnkiConf): Omit<DeckOptions, 'id'> {
  const d = DEFAULT_OPTIONS
  const steps = (v: unknown, def: number[]) => (Array.isArray(v) && v.every((x) => typeof x === 'number' && x > 0) ? (v as number[]) : def)
  return {
    ...d,
    name: c.name || 'Импорт',
    newPerDay: n(c.new?.perDay, d.newPerDay),
    learnSteps: steps(c.new?.delays, d.learnSteps),
    graduatingIvl: n(c.new?.ints?.[0], d.graduatingIvl),
    easyIvl: n(c.new?.ints?.[1], d.easyIvl),
    startingEase: n(c.new?.initialFactor, d.startingEase),
    buryNew: c.new?.bury ?? d.buryNew,
    revPerDay: n(c.rev?.perDay, d.revPerDay),
    easyBonus: n(c.rev?.ease4, d.easyBonus),
    intervalModifier: n(c.rev?.ivlFct, d.intervalModifier),
    maxIvl: n(c.rev?.maxIvl, d.maxIvl),
    hardFactor: n(c.rev?.hardFactor, d.hardFactor),
    buryReview: c.rev?.bury ?? d.buryReview,
    relearnSteps: steps(c.lapse?.delays, d.relearnSteps),
    lapseMult: n(c.lapse?.mult, d.lapseMult),
    minIvl: n(c.lapse?.minInt, d.minIvl),
    leechThreshold: n(c.lapse?.leechFails, d.leechThreshold),
    leechAction: c.lapse?.leechAction === 0 ? 'suspend' : 'tag',
    autoplayAudio: c.autoplay ?? d.autoplayAudio,
  }
}

const optionsKey = (o: Omit<DeckOptions, 'id' | 'name'> & { id?: number; name?: string }) => {
  const rest: Record<string, unknown> = { ...o }
  delete rest.id
  delete rest.name
  return JSON.stringify(rest, Object.keys(rest).sort())
}

export async function importApkg(data: ApkgData, opts: ApkgOptions, progress?: Progress): Promise<ImportReport> {
  const report = emptyReport()
  const now = Date.now()
  const t = schedTime(now)
  // Сдвиг между днём Anki (от col.crt) и нашим номером дня
  const ankiToday = Math.floor((now / 1000 - data.crt) / 86400)
  const dayOffset = t.today - ankiToday

  // ---- Типы заметок
  progress?.('Типы заметок', 0, 1)
  const noteTypes = await db.noteTypes.toArray()
  const ntMap = new Map<number, NoteType>()
  for (const mid of new Set(data.notes.map((x) => x.mid))) {
    const m = data.models.get(mid)
    if (!m) continue
    let nt = noteTypes.find((x) => x.ankiId === m.id && sameShape(x, m)) ?? noteTypes.find((x) => x.name === m.name && sameShape(x, m))
    if (!nt) {
      let name = m.name
      for (let i = 2; noteTypes.some((x) => x.name === name); i++) name = `${m.name} (${i})`
      const fresh: Omit<NoteType, 'id'> = {
        name,
        kind: m.type === 1 ? 'cloze' : 'standard',
        fields: m.flds.map((f) => f.name),
        templates: m.tmpls.map((x) => ({ name: x.name, qfmt: x.qfmt, afmt: x.afmt })),
        css: m.css,
        createdAt: now,
        ankiId: m.id,
      }
      const id = await db.noteTypes.add(fresh)
      nt = { ...fresh, id }
      noteTypes.push(nt)
    }
    ntMap.set(mid, nt)
  }

  // ---- Колоды и их настройки
  const presets = await db.deckOptions.toArray()
  const presetByKey = new Map(presets.map((p) => [optionsKey(p), p.id]))
  const confPreset = new Map<number, number>()
  const presetFor = async (confId: number | undefined): Promise<number> => {
    const conf = confId !== undefined ? data.confs.get(confId) : undefined
    if (!conf) return 1
    const cached = confPreset.get(conf.id)
    if (cached) return cached
    const o = confToOptions(conf)
    let id = presetByKey.get(optionsKey(o))
    if (!id) {
      id = await db.deckOptions.add(o)
      presetByKey.set(optionsKey(o), id)
    }
    confPreset.set(conf.id, id)
    return id
  }
  const deckMap = new Map<number, number>()
  for (const did of new Set(data.cards.map((c) => c.odid || c.did))) {
    const ad = data.decks.get(did)
    const name = ankiDeckName(ad?.name ?? 'Импорт')
    const existed = await db.decks.where('name').equals(name).first()
    const id = existed?.id ?? (await createDeck(name))
    if (!existed && opts.withProgress) await db.decks.update(id, { optionsId: await presetFor(ad?.conf) })
    deckMap.set(did, id)
  }
  report.deckIds = [...new Set(deckMap.values())]

  // ---- Заметки
  const guids = data.notes.map((x) => x.guid)
  const existing = new Map<string, Note>()
  for (let i = 0; i < guids.length; i += 5000) {
    for (const note of await db.notes.where('guid').anyOf(guids.slice(i, i + 5000)).toArray()) existing.set(note.guid, note)
  }
  const noteIdMap = new Map<number, number>()
  for (let start = 0; start < data.notes.length; start += CHUNK) {
    progress?.('Заметки', start, data.notes.length)
    const chunk = data.notes.slice(start, start + CHUNK)
    const toAdd: { ankiId: number; note: Omit<Note, 'id'> }[] = []
    const toUpdate: Note[] = []
    for (const an of chunk) {
      const nt = ntMap.get(an.mid)
      if (!nt) {
        report.errors.push({ line: 0, reason: `заметка ${an.id}: неизвестный тип` })
        continue
      }
      const fields = nt.fields.map((_, i) => an.flds[i] ?? '')
      const ex = existing.get(an.guid)
      if (ex) {
        if (opts.dupMode === 'update' && ex.noteTypeId === nt.id) {
          toUpdate.push({ ...ex, fields, tags: an.tags, sortText: sortTextOf(fields), modifiedAt: now })
          report.updated++
        } else {
          report.skipped++
        }
        continue
      }
      toAdd.push({
        ankiId: an.id,
        note: {
          guid: an.guid,
          noteTypeId: nt.id,
          fields,
          tags: an.tags,
          sortText: sortTextOf(fields),
          createdAt: an.id,
          modifiedAt: now,
        },
      })
    }
    await db.transaction('rw', db.notes, async () => {
      if (toUpdate.length) await db.notes.bulkPut(toUpdate)
      if (!toAdd.length) return
      const ids = await db.notes.bulkAdd(
        toAdd.map((x) => x.note),
        { allKeys: true },
      )
      toAdd.forEach((x, i) => noteIdMap.set(x.ankiId, ids[i]))
    })
    report.added += toAdd.length
  }

  // ---- Карточки
  const newCards = data.cards.filter((c) => noteIdMap.has(c.nid))
  const newDues = newCards.filter((c) => c.type === 0).map((c) => (c.odid ? c.odue : c.due))
  const minNewDue = newDues.length ? Math.min(...newDues) : 0
  const noteRank = new Map(data.notes.map((x, i) => [x.id, i]))
  const span = Math.max(data.notes.length, newDues.length ? Math.max(...newDues) - minNewDue + 1 : 0)
  const posBase = await db.transaction('rw', db.config, () => nextPositions(span + 1))

  const convert = (c: AnkiCard): Omit<Card, 'id'> => {
    const base = {
      noteId: noteIdMap.get(c.nid)!,
      deckId: deckMap.get(c.odid || c.did) ?? report.deckIds[0],
      ord: c.ord,
      flags: c.flags & 7,
      createdAt: c.id,
      modifiedAt: now,
    }
    const due = c.odid ? c.odue : c.due
    if (!opts.withProgress || c.type === 0) {
      const pos = opts.withProgress ? posBase + (due - minNewDue) : posBase + (noteRank.get(c.nid) ?? 0)
      const queue = opts.withProgress && c.queue === -1 ? Queue.Suspended : Queue.New
      return { ...base, type: CardType.New, queue, due: pos, ivl: 0, ease: 0, reps: 0, lapses: 0, left: 0 }
    }
    const type = c.type === 1 ? CardType.Learn : c.type === 3 ? CardType.Relearn : CardType.Review
    let ourDue: number
    if (type === CardType.Review) ourDue = due + dayOffset
    else ourDue = due > 1e9 ? due * 1000 : due + dayOffset // секунды -> мс, либо номер дня
    const card = {
      ...base,
      type,
      queue: Queue.New as Queue,
      due: ourDue,
      ivl: Math.max(0, c.ivl),
      ease: c.factor || DEFAULT_OPTIONS.startingEase,
      reps: c.reps,
      lapses: c.lapses,
      left: c.left % 1000,
    }
    card.queue = c.queue === -1 ? Queue.Suspended : activeQueue(card)
    return card
  }

  const cardIdMap = new Map<number, { id: number; deckId: number }>()
  for (let start = 0; start < newCards.length; start += CHUNK) {
    progress?.('Карточки', start, newCards.length)
    const chunk = newCards.slice(start, start + CHUNK)
    const converted = chunk.map(convert)
    const ids = await db.cards.bulkAdd(converted, { allKeys: true })
    chunk.forEach((c, i) => cardIdMap.set(c.id, { id: ids[i], deckId: converted[i].deckId }))
    report.cards += chunk.length
  }

  // ---- История повторений
  if (opts.withProgress) {
    const logs: Omit<RevLog, 'id'>[] = []
    for (const r of data.revlog) {
      const card = cardIdMap.get(r.cid)
      if (!card || r.type > 2) continue
      logs.push({
        cardId: card.id,
        deckId: card.deckId,
        time: r.id,
        rating: r.ease,
        ivl: r.ivl,
        lastIvl: r.lastIvl,
        ease: r.factor,
        duration: Math.min(60_000, Math.max(0, r.time)),
        type: r.type as 0 | 1 | 2,
        isNew: r.type === 0 && r.lastIvl === 0,
      })
    }
    for (let start = 0; start < logs.length; start += 5000) {
      progress?.('История', start, logs.length)
      await db.revlog.bulkAdd(logs.slice(start, start + 5000))
    }
  }

  // ---- Медиа
  for (let start = 0; start < data.media.length; start += MEDIA_BATCH) {
    progress?.('Медиафайлы', start, data.media.length)
    const batch = data.media.slice(start, start + MEDIA_BATCH)
    const files = data.readMedia(batch.map(([idx]) => idx))
    const rows = batch
      .filter(([idx]) => files[idx])
      .map(([idx, name]) => ({ name, blob: new Blob([files[idx] as Uint8Array<ArrayBuffer>], { type: mimeOf(name) }) }))
    await db.media.bulkPut(rows)
    report.media += rows.length
  }
  clearMediaCache()
  progress?.('Готово', 1, 1)
  return report
}
