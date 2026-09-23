import Dexie, { type EntityTable } from 'dexie'
import type { Card, ConfigEntry, Deck, DeckOptions, MediaFile, Note, NoteType, RevLog } from './types'

class AnkiDb extends Dexie {
  decks!: EntityTable<Deck, 'id'>
  deckOptions!: EntityTable<DeckOptions, 'id'>
  noteTypes!: EntityTable<NoteType, 'id'>
  notes!: EntityTable<Note, 'id'>
  cards!: EntityTable<Card, 'id'>
  revlog!: EntityTable<RevLog, 'id'>
  media!: EntityTable<MediaFile, 'name'>
  config!: EntityTable<ConfigEntry, 'key'>

  constructor() {
    super('ankicards')
    this.version(1).stores({ decks: '++id, name', config: 'key' })
    this.version(2)
      .stores({
        decks: '++id, name',
        deckOptions: '++id',
        noteTypes: '++id, name',
        notes: '++id, guid, noteTypeId, *tags, modifiedAt',
        cards: '++id, noteId, deckId, queue, [deckId+queue+due]',
        revlog: '++id, cardId, time, [deckId+time]',
        media: 'name',
        config: 'key',
      })
      .upgrade((tx) =>
        tx
          .table('decks')
          .toCollection()
          .modify((d: Partial<Deck>) => {
            d.optionsId ??= 1
          }),
      )
  }
}

export const db = new AnkiDb()

export async function getConfig<T>(key: string, fallback: T): Promise<T> {
  const e = await db.config.get(key)
  return e === undefined ? fallback : (e.value as T)
}

export async function setConfig(key: string, value: unknown): Promise<void> {
  await db.config.put({ key, value })
}

// Просим браузер не очищать данные (актуально для iOS Safari)
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}
