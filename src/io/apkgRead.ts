// Чтение .apkg / .colpkg (формат Anki со схемой 11, без zstd)
import { strFromU8, unzipSync } from 'fflate'
import type { SqlJsStatic, SqlValue } from 'sql.js'

export interface AnkiModel {
  id: number
  name: string
  type: number
  flds: { name: string; ord: number }[]
  tmpls: { name: string; ord: number; qfmt: string; afmt: string }[]
  css: string
}

export interface AnkiDeck {
  id: number
  name: string
  conf?: number
  dyn?: number
}

export interface AnkiConf {
  id: number
  name?: string
  autoplay?: boolean
  new?: { perDay?: number; delays?: number[]; ints?: number[]; initialFactor?: number; bury?: boolean }
  rev?: { perDay?: number; ease4?: number; ivlFct?: number; maxIvl?: number; hardFactor?: number; bury?: boolean }
  lapse?: { delays?: number[]; mult?: number; minInt?: number; leechFails?: number; leechAction?: number }
}

export interface AnkiNote {
  id: number
  guid: string
  mid: number
  tags: string[]
  flds: string[]
}

export interface AnkiCard {
  id: number
  nid: number
  did: number
  ord: number
  type: number
  queue: number
  due: number
  ivl: number
  factor: number
  reps: number
  lapses: number
  left: number
  odue: number
  odid: number
  flags: number
}

export interface AnkiRev {
  id: number
  cid: number
  ease: number
  ivl: number
  lastIvl: number
  factor: number
  time: number
  type: number
}

export interface ApkgData {
  crt: number
  models: Map<number, AnkiModel>
  decks: Map<number, AnkiDeck>
  confs: Map<number, AnkiConf>
  notes: AnkiNote[]
  cards: AnkiCard[]
  revlog: AnkiRev[]
  /** Номер файла в архиве -> имя медиафайла */
  media: [string, string][]
  readMedia: (indices: string[]) => Record<string, Uint8Array>
}

export class ApkgError extends Error {}

export const NEW_FORMAT_MSG =
  'Колода сохранена в новом формате Anki (сжатие zstd), он не поддерживается. Экспортируйте её заново с галочкой «Поддержка старых версий Anki» (Support older Anki versions).'

function rows(db: import('sql.js').Database, sql: string): SqlValue[][] {
  const res = db.exec(sql)
  return res[0]?.values ?? []
}

const num = (v: SqlValue) => Number(v ?? 0)
const str = (v: SqlValue) => (v == null ? '' : String(v))

function parseJson<T>(s: string, what: string): T {
  try {
    return JSON.parse(s) as T
  } catch {
    throw new ApkgError(`Не удалось прочитать ${what} из колоды`)
  }
}

export function readApkg(bytes: Uint8Array, SQL: SqlJsStatic): ApkgData {
  const seen = new Set<string>()
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        seen.add(f.name)
        return f.name === 'collection.anki21' || f.name === 'collection.anki2' || f.name === 'media'
      },
    })
  } catch {
    throw new ApkgError('Файл повреждён или это не колода Anki (.apkg)')
  }
  // Если есть anki21b, то collection.anki2 — заглушка «обновите Anki»
  if (seen.has('collection.anki21b') && !files['collection.anki21']) throw new ApkgError(NEW_FORMAT_MSG)
  const dbBytes = files['collection.anki21'] ?? files['collection.anki2']
  if (!dbBytes) throw new ApkgError('В архиве нет базы Anki. Это точно файл .apkg?')

  let db: import('sql.js').Database
  try {
    db = new SQL.Database(dbBytes)
  } catch {
    throw new ApkgError('Не удалось открыть базу колоды')
  }
  try {
    const col = rows(db, 'SELECT crt, models, decks, dconf FROM col')[0]
    if (!col) throw new ApkgError('В базе колоды нет данных')
    const modelsRaw = str(col[1])
    if (!modelsRaw || modelsRaw === '{}') throw new ApkgError(NEW_FORMAT_MSG)

    const models = new Map<number, AnkiModel>()
    for (const m of Object.values(parseJson<Record<string, AnkiModel>>(modelsRaw, 'типы заметок'))) {
      models.set(Number(m.id), {
        id: Number(m.id),
        name: String(m.name ?? 'Импорт'),
        type: Number(m.type ?? 0),
        flds: [...(m.flds ?? [])].sort((a, b) => a.ord - b.ord),
        tmpls: [...(m.tmpls ?? [])].sort((a, b) => a.ord - b.ord),
        css: String(m.css ?? ''),
      })
    }
    const decks = new Map<number, AnkiDeck>()
    for (const d of Object.values(parseJson<Record<string, AnkiDeck>>(str(col[2]) || '{}', 'колоды'))) {
      decks.set(Number(d.id), { ...d, id: Number(d.id), name: String(d.name) })
    }
    const confs = new Map<number, AnkiConf>()
    for (const c of Object.values(parseJson<Record<string, AnkiConf>>(str(col[3]) || '{}', 'настройки'))) {
      confs.set(Number(c.id), { ...c, id: Number(c.id) })
    }

    const notes: AnkiNote[] = rows(db, 'SELECT id, guid, mid, tags, flds FROM notes ORDER BY id').map((r) => ({
      id: num(r[0]),
      guid: str(r[1]),
      mid: num(r[2]),
      tags: str(r[3]).split(/\s+/).filter(Boolean),
      flds: str(r[4]).split('\x1f'),
    }))
    const cards: AnkiCard[] = rows(
      db,
      'SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags FROM cards ORDER BY id',
    ).map((r) => ({
      id: num(r[0]),
      nid: num(r[1]),
      did: num(r[2]),
      ord: num(r[3]),
      type: num(r[4]),
      queue: num(r[5]),
      due: num(r[6]),
      ivl: num(r[7]),
      factor: num(r[8]),
      reps: num(r[9]),
      lapses: num(r[10]),
      left: num(r[11]),
      odue: num(r[12]),
      odid: num(r[13]),
      flags: num(r[14]),
    }))
    let revlog: AnkiRev[] = []
    try {
      revlog = rows(db, 'SELECT id, cid, ease, ivl, lastIvl, factor, time, type FROM revlog ORDER BY id').map((r) => ({
        id: num(r[0]),
        cid: num(r[1]),
        ease: num(r[2]),
        ivl: num(r[3]),
        lastIvl: num(r[4]),
        factor: num(r[5]),
        time: num(r[6]),
        type: num(r[7]),
      }))
    } catch {
      // истории может не быть — не страшно
    }

    let media: [string, string][] = []
    if (files.media) {
      try {
        const map = JSON.parse(strFromU8(files.media)) as Record<string, string>
        media = Object.entries(map).filter(([k, v]) => seen.has(k) && typeof v === 'string' && v)
      } catch {
        media = [] // медиа в новом формате (protobuf) — пропускаем
      }
    }

    return {
      crt: num(col[0]),
      models,
      decks,
      confs,
      notes,
      cards,
      revlog,
      media,
      readMedia: (indices) => {
        const want = new Set(indices)
        return unzipSync(bytes, { filter: (f) => want.has(f.name) })
      },
    }
  } finally {
    db.close()
  }
}
