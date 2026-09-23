import { db } from './db'
import { DEFAULT_DECK_NAME, DEFAULT_NOTE_TYPES, DEFAULT_OPTIONS } from './defaults'

/** Создаёт пресет опций, встроенные типы заметок и колоду по умолчанию */
export async function ensureSeed(): Promise<void> {
  await db.transaction('rw', db.deckOptions, db.noteTypes, db.decks, async () => {
    if ((await db.deckOptions.count()) === 0) await db.deckOptions.add({ ...DEFAULT_OPTIONS, id: 1 })
    if ((await db.noteTypes.count()) === 0) {
      const now = Date.now()
      await db.noteTypes.bulkAdd(DEFAULT_NOTE_TYPES.map((nt, i) => ({ ...nt, createdAt: now + i })))
    }
    if ((await db.decks.count()) === 0) {
      await db.decks.add({ name: DEFAULT_DECK_NAME, optionsId: 1, createdAt: Date.now() })
    }
  })
}
