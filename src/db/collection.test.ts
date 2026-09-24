import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { ensureSeed } from './seed'
import { addNote, answerCardOp, buildMixedQueue, createDeck, createUniqueDeck, deckNameFromFile, mixedSource } from './collection'
import { schedTime } from '../core/time'
import { Queue } from './types'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSeed()
})

async function fill(deckName: string, words: number) {
  const nt = (await db.noteTypes.toArray()).find((n) => n.name === 'Основная')!
  const deckId = await createDeck(deckName)
  for (let i = 0; i < words; i++) await addNote(nt, deckId, [`${deckName}-${i}`, 'x'], [])
  return deckId
}

describe('учёба вперемешку', () => {
  it('берёт карточки из всех колод с учётом лимита каждой', async () => {
    const a = await fill('Итальянский', 30)
    const b = await fill('Английский', 5)
    const queue = await buildMixedQueue(schedTime())
    const cards = await db.cards.bulkGet(queue)
    const fromA = cards.filter((c) => c!.deckId === a).length
    const fromB = cards.filter((c) => c!.deckId === b).length
    expect(fromA).toBe(20) // лимит 20 новых в день
    expect(fromB).toBe(5)
  })

  it('порядок случайный', async () => {
    await fill('A', 20)
    await fill('B', 20)
    const orders = new Set<string>()
    for (let i = 0; i < 5; i++) orders.add((await buildMixedQueue(schedTime())).join(','))
    expect(orders.size).toBeGreaterThan(1)
  })

  it('проходит все карточки и не повторяет отвеченные', async () => {
    await fill('A', 3)
    await fill('B', 3)
    const src = await mixedSource()
    const seen = new Set<number>()
    for (let i = 0; i < 6; i++) {
      const card = await src.next(schedTime(), false)
      expect(card).not.toBeNull()
      expect(seen.has(card!.id)).toBe(false)
      seen.add(card!.id)
      await answerCardOp(card!.id, 4, 1000) // «Легко» — сразу в повторения
    }
    expect(await src.next(schedTime(), false)).toBeNull()
    expect((await db.cards.toArray()).every((c) => c.queue === Queue.Review)).toBe(true)
    expect(await src.counts()).toEqual({ new: 0, learn: 0, review: 0 })
  })
})

describe('колода для импорта', () => {
  it('имя из файла и уникальность', async () => {
    expect(deckNameFromFile('italian_words.txt')).toBe('italian words')
    expect(deckNameFromFile('.csv')).toBe('Импорт')
    const first = await createUniqueDeck('italian words')
    const second = await createUniqueDeck('italian words')
    expect(first).not.toBe(second)
    expect((await db.decks.get(second))?.name).toBe('italian words (2)')
  })
})
