// Синхронизация локальной базы с облаком.
// Изменения находим сравнением хешей записей с тем, что уже отправлено (таблица syncState),
// поэтому в облако попадает всё: правки, ответы, импорт, отмена, восстановление из копии.
import type { Table } from 'dexie'
import { db, getConfig, setConfig } from '../db/db'
import { ensureSeed } from '../db/seed'
import { mimeOf } from '../io/files'

export interface PushRow {
  kind: string
  id: string
  data: unknown
  deleted: boolean
}

export interface RemoteRow extends PushRow {
  seq: number
}

/** Облако. Реализации: Supabase и память (для тестов) */
export interface Remote {
  countRecords(): Promise<number>
  pull(after: number, device: string, limit: number): Promise<RemoteRow[]>
  push(rows: PushRow[], device: string): Promise<void>
  deleteAll(): Promise<void>
  listMedia(): Promise<string[]>
  uploadMedia(name: string, blob: Blob): Promise<void>
  downloadMedia(name: string): Promise<Blob>
  deleteAllMedia(): Promise<void>
}

export const SYNC_PREFIX = 'sync.'
const PAGE = 1000
const PUSH_BATCH = 500
const MAX_MEDIA_BYTES = 45 * 1024 * 1024

type AnyTable = Table<Record<string, unknown>, number | string>

const KINDS: { kind: string; table: () => AnyTable; numeric: boolean }[] = [
  { kind: 'deckOptions', table: () => db.deckOptions as unknown as AnyTable, numeric: true },
  { kind: 'deck', table: () => db.decks as unknown as AnyTable, numeric: true },
  { kind: 'noteType', table: () => db.noteTypes as unknown as AnyTable, numeric: true },
  { kind: 'note', table: () => db.notes as unknown as AnyTable, numeric: true },
  { kind: 'card', table: () => db.cards as unknown as AnyTable, numeric: true },
  { kind: 'revlog', table: () => db.revlog as unknown as AnyTable, numeric: true },
  { kind: 'config', table: () => db.config as unknown as AnyTable, numeric: false },
]
const kindInfo = new Map(KINDS.map((k) => [k.kind, k]))

// ---------- Хеш записи ----------

export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : stableStringify(x))).join(',')}]`
  const obj = v as Record<string, unknown>
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

/** cyrb53 — быстрый 53-битный хеш строки */
export function hashString(str: string): number {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

const hashRecord = (row: unknown) => hashString(stableStringify(row))
const stateKey = (kind: string, id: string) => `${kind}:${id}`

function idOf(kind: string, row: Record<string, unknown>): string {
  return kind === 'config' ? String(row.key) : String(row.id)
}

// ---------- Отправка ----------

async function collectChanges(): Promise<(PushRow & { h: number })[]> {
  const state = new Map((await db.syncState.toArray()).map((s) => [s.k, s.h]))
  const seen = new Set<string>()
  const out: (PushRow & { h: number })[] = []
  for (const { kind, table } of KINDS) {
    for (const row of await table().toArray()) {
      const id = idOf(kind, row)
      if (kind === 'config' && id.startsWith(SYNC_PREFIX)) continue
      const k = stateKey(kind, id)
      seen.add(k)
      const h = hashRecord(row)
      if (state.get(k) !== h) out.push({ kind, id, data: row, deleted: false, h })
    }
  }
  for (const k of state.keys()) {
    if (k.startsWith('media:') || seen.has(k)) continue
    const i = k.indexOf(':')
    out.push({ kind: k.slice(0, i), id: k.slice(i + 1), data: null, deleted: true, h: 0 })
  }
  return out
}

async function pushRecords(remote: Remote, device: string): Promise<number> {
  const changes = await collectChanges()
  for (let i = 0; i < changes.length; i += PUSH_BATCH) {
    const batch = changes.slice(i, i + PUSH_BATCH)
    await remote.push(
      batch.map(({ kind, id, data, deleted }) => ({ kind, id, data, deleted })),
      device,
    )
    await db.transaction('rw', db.syncState, async () => {
      await db.syncState.bulkPut(batch.filter((b) => !b.deleted).map((b) => ({ k: stateKey(b.kind, b.id), h: b.h })))
      await db.syncState.bulkDelete(batch.filter((b) => b.deleted).map((b) => stateKey(b.kind, b.id)))
    })
  }
  return changes.length
}

// ---------- Получение ----------

async function applyRows(rows: RemoteRow[]) {
  const tables = KINDS.map((k) => k.table())
  await db.transaction('rw', [...tables, db.syncState], async () => {
    for (const { kind, table, numeric } of KINDS) {
      const mine = rows.filter((r) => r.kind === kind && !(kind === 'config' && r.id.startsWith(SYNC_PREFIX)))
      if (!mine.length) continue
      const puts = mine.filter((r) => !r.deleted && r.data && typeof r.data === 'object')
      const dels = mine.filter((r) => r.deleted)
      if (puts.length) {
        const data = puts.map((r) => r.data as Record<string, unknown>)
        await table().bulkPut(data)
        await db.syncState.bulkPut(puts.map((r, i) => ({ k: stateKey(kind, r.id), h: hashRecord(data[i]) })))
      }
      if (dels.length) {
        await table().bulkDelete(dels.map((r) => (numeric ? Number(r.id) : r.id)))
        await db.syncState.bulkDelete(dels.map((r) => stateKey(kind, r.id)))
      }
    }
  })
}

async function pullRecords(remote: Remote, device: string): Promise<number> {
  let cursor = await getConfig('sync.cursor', 0)
  let total = 0
  for (;;) {
    const rows = await remote.pull(cursor, device, PAGE)
    if (!rows.length) break
    await applyRows(rows.filter((r) => kindInfo.has(r.kind)))
    cursor = Math.max(cursor, ...rows.map((r) => r.seq))
    await setConfig('sync.cursor', cursor)
    total += rows.length
    if (rows.length < PAGE) break
  }
  return total
}

// ---------- Медиа ----------

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let next = 0
  const worker = async () => {
    while (next < items.length) await fn(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
}

async function pushMedia(remote: Remote): Promise<number> {
  const done = new Set((await db.syncState.where('k').startsWith('media:').primaryKeys()).map((k) => String(k).slice(6)))
  const names = (await db.media.toCollection().primaryKeys()).map(String).filter((n) => !done.has(n))
  let count = 0
  await pool(names, 4, async (name) => {
    const file = await db.media.get(name)
    if (!file || file.blob.size > MAX_MEDIA_BYTES) return
    await remote.uploadMedia(name, file.blob)
    await db.syncState.put({ k: `media:${name}`, h: file.blob.size })
    count++
  })
  return count
}

async function pullMedia(remote: Remote): Promise<number> {
  const local = new Set((await db.media.toCollection().primaryKeys()).map(String))
  const missing = (await remote.listMedia()).filter((n) => !local.has(n))
  await pool(missing, 4, async (name) => {
    const blob = await remote.downloadMedia(name)
    const typed = blob.type ? blob : new Blob([blob], { type: mimeOf(name) })
    await db.media.put({ name, blob: typed })
    await db.syncState.put({ k: `media:${name}`, h: typed.size })
  })
  return missing.length
}

// ---------- Публичные операции ----------

export interface SyncResult {
  pulled: number
  pushed: number
  media: number
}

/** Обычная синхронизация: сначала забрать изменения из облака, потом отправить свои */
export async function syncNow(remote: Remote): Promise<SyncResult> {
  const device = await getConfig('sync.device', '')
  if (!device) throw new Error('Синхронизация не подключена')
  const pulled = await pullRecords(remote, device)
  const pushed = await pushRecords(remote, device)
  let media = 0
  if (pulled > 0) media += await pullMedia(remote)
  media += await pushMedia(remote)
  await setConfig('sync.lastAt', Date.now())
  return { pulled, pushed, media }
}

export async function linkInfo(remote: Remote): Promise<{ remote: number; localNotes: number }> {
  const [remoteCount, localNotes] = await Promise.all([remote.countRecords(), db.notes.count()])
  return { remote: remoteCount, localNotes }
}

/** Стирает коллекцию на устройстве (кроме служебных ключей синхронизации) */
async function wipeLocal() {
  const tables = [...KINDS.map((k) => k.table()), db.media, db.syncState]
  await db.transaction('rw', tables, async () => {
    const keep = (await db.config.toArray()).filter((c) => c.key.startsWith(SYNC_PREFIX))
    await Promise.all(tables.map((t) => t.clear()))
    await db.config.bulkPut(keep)
  })
}

export type LinkMode = 'upload' | 'download' | 'replace'

/**
 * Привязывает устройство к аккаунту.
 * upload — облако пустое, отправляем данные телефона;
 * download — берём данные из облака, телефон очищается;
 * replace — стираем облако и отправляем данные телефона.
 */
export async function linkAccount(remote: Remote, userId: string, mode: LinkMode): Promise<SyncResult> {
  await setConfig('sync.user', null)
  await setConfig('sync.device', crypto.randomUUID())
  await setConfig('sync.cursor', 0)
  await db.syncState.clear()
  if (mode === 'replace') {
    await remote.deleteAll()
    await remote.deleteAllMedia()
  }
  if (mode === 'download') await wipeLocal()
  let result = await syncNow(remote)
  if (mode === 'download') {
    await ensureSeed()
    result = { ...result, pushed: result.pushed + (await syncNow(remote)).pushed }
  }
  await setConfig('sync.user', userId)
  return result
}

export async function linkedUser(): Promise<string | null> {
  return getConfig<string | null>('sync.user', null)
}
