// Полная резервная копия: zip с collection.json и папкой media/
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { db, setConfig } from '../db/db'
import type { Card, ConfigEntry, Deck, DeckOptions, Note, NoteType, RevLog } from '../db/types'
import { clearMediaCache } from '../core/media'
import { mimeOf } from './files'

const FORMAT = 'ankicards-backup'

interface BackupData {
  format: typeof FORMAT
  version: 1
  createdAt: number
  decks: Deck[]
  deckOptions: DeckOptions[]
  noteTypes: NoteType[]
  notes: Note[]
  cards: Card[]
  revlog: RevLog[]
  config: ConfigEntry[]
}

export async function createBackup(): Promise<{ blob: Blob; notes: number; media: number }> {
  const [decks, deckOptions, noteTypes, notes, cards, revlog, config, media] = await Promise.all([
    db.decks.toArray(),
    db.deckOptions.toArray(),
    db.noteTypes.toArray(),
    db.notes.toArray(),
    db.cards.toArray(),
    db.revlog.toArray(),
    db.config.toArray(),
    db.media.toArray(),
  ])
  const data: BackupData = { format: FORMAT, version: 1, createdAt: Date.now(), decks, deckOptions, noteTypes, notes, cards, revlog, config }
  const files: Zippable = { 'collection.json': [strToU8(JSON.stringify(data)), { level: 6 }] }
  for (const m of media) {
    files[`media/${encodeURIComponent(m.name)}`] = [new Uint8Array(await m.blob.arrayBuffer()), { level: 0 }]
  }
  const zip = zipSync(files)
  return { blob: new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), notes: notes.length, media: media.length }
}

export async function markBackupDone() {
  await setConfig('lastBackupAt', Date.now())
}

export function readBackup(bytes: Uint8Array): { data: BackupData; media: Record<string, Uint8Array> } {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new Error('Это не файл резервной копии AnkiCards')
  }
  const json = files['collection.json']
  if (!json) throw new Error('Это не файл резервной копии AnkiCards')
  const data = JSON.parse(strFromU8(json)) as BackupData
  if (data.format !== FORMAT) throw new Error('Это не файл резервной копии AnkiCards')
  const media: Record<string, Uint8Array> = {}
  for (const [path, content] of Object.entries(files)) {
    if (path.startsWith('media/') && path.length > 6) media[decodeURIComponent(path.slice(6))] = content
  }
  return { data, media }
}

/** Полностью заменяет коллекцию содержимым копии */
export async function restoreBackup(bytes: Uint8Array): Promise<{ notes: number; cards: number }> {
  const { data, media } = readBackup(bytes)
  await db.transaction('rw', [db.decks, db.deckOptions, db.noteTypes, db.notes, db.cards, db.revlog, db.config, db.media], async () => {
    await Promise.all([
      db.decks.clear(),
      db.deckOptions.clear(),
      db.noteTypes.clear(),
      db.notes.clear(),
      db.cards.clear(),
      db.revlog.clear(),
      db.config.clear(),
      db.media.clear(),
    ])
    await db.decks.bulkAdd(data.decks)
    await db.deckOptions.bulkAdd(data.deckOptions)
    await db.noteTypes.bulkAdd(data.noteTypes)
    await db.notes.bulkAdd(data.notes)
    await db.cards.bulkAdd(data.cards)
    await db.revlog.bulkAdd(data.revlog)
    await db.config.bulkAdd(data.config)
    await db.media.bulkAdd(
      Object.entries(media).map(([name, content]) => ({ name, blob: new Blob([content as Uint8Array<ArrayBuffer>], { type: mimeOf(name) }) })),
    )
  })
  clearMediaCache()
  return { notes: data.notes.length, cards: data.cards.length }
}
