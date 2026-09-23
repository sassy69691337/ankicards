import Dexie, { type EntityTable } from 'dexie'

export interface Deck {
  id: number
  name: string
  createdAt: number
}

export interface Config {
  key: string
  value: unknown
}

class AnkiDb extends Dexie {
  decks!: EntityTable<Deck, 'id'>
  config!: EntityTable<Config, 'key'>

  constructor() {
    super('ankicards')
    this.version(1).stores({
      decks: '++id, name',
      config: 'key',
    })
  }
}

export const db = new AnkiDb()

// Просим браузер не очищать данные (актуально для iOS Safari)
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}
