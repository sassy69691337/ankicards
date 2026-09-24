import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, getConfig, setConfig } from '../db/db'
import { ensureSeed } from '../db/seed'
import { addNote, answerCardOp, deleteNote, createDeck } from '../db/collection'
import { linkAccount, linkInfo, syncNow, type PushRow, type Remote, type RemoteRow } from './engine'

/** Облако в памяти, ведёт себя как таблица records */
class FakeRemote implements Remote {
  rows = new Map<string, RemoteRow & { device: string }>()
  media = new Map<string, Blob>()
  seq = 0
  pushes = 0
  pushedRows = 0

  async countRecords() {
    return [...this.rows.values()].filter((r) => !r.deleted).length
  }
  async pull(after: number, device: string, limit: number) {
    return [...this.rows.values()]
      .filter((r) => r.seq > after && r.device !== device)
      .sort((a, b) => a.seq - b.seq)
      .slice(0, limit)
      .map(({ device: _d, ...r }) => ({ ...r, data: r.data == null ? null : JSON.parse(JSON.stringify(r.data)) }))
  }
  async push(rows: PushRow[], device: string) {
    this.pushes++
    this.pushedRows += rows.length
    for (const r of rows) {
      this.rows.set(`${r.kind}:${r.id}`, { ...r, data: r.data == null ? null : JSON.parse(JSON.stringify(r.data)), device, seq: ++this.seq })
    }
  }
  async deleteAll() {
    this.rows.clear()
  }
  async listMedia() {
    return [...this.media.keys()]
  }
  async uploadMedia(name: string, blob: Blob) {
    this.media.set(name, blob)
  }
  async downloadMedia(name: string) {
    return this.media.get(name)!
  }
  async deleteAllMedia() {
    this.media.clear()
  }
  /** Изменение «с другого устройства» */
  writeFromOtherDevice(kind: string, id: string, data: unknown, deleted = false) {
    this.rows.set(`${kind}:${id}`, { kind, id, data, deleted, device: 'other', seq: ++this.seq })
  }
}

async function freshDevice() {
  await db.delete()
  await db.open()
  await ensureSeed()
}

async function sampleCollection() {
  const nt = (await db.noteTypes.toArray()).find((n) => n.name === 'Слово (+ обратная)')!
  const deckId = await createDeck('English')
  await addNote(nt, deckId, ['cat', 'кошка', ''], ['animals'])
  await addNote(nt, deckId, ['dog', 'собака', 'Good dog'], [])
  const card = (await db.cards.toArray())[0]
  await answerCardOp(card.id, 3, 5000)
  await db.media.put({ name: 'pic.png', blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) })
  return deckId
}

const snapshot = async () => ({
  decks: (await db.decks.toArray()).map((d) => d.name).sort(),
  notes: (await db.notes.toArray()).map((n) => n.fields[0]).sort(),
  cards: (await db.cards.toArray()).map((c) => `${c.id}:${c.queue}:${c.due}`).sort(),
  revlog: await db.revlog.count(),
  nextPos: await getConfig('nextPos', 0),
  media: (await db.media.toCollection().primaryKeys()).sort(),
})

beforeEach(freshDevice)

describe('синхронизация', () => {
  it('телефон -> облако -> новый телефон', async () => {
    const remote = new FakeRemote()
    await sampleCollection()
    const before = await snapshot()
    expect((await linkInfo(remote)).remote).toBe(0)
    await linkAccount(remote, 'user-1', 'upload')
    expect(await getConfig('sync.user', null)).toBe('user-1')
    expect(remote.media.has('pic.png')).toBe(true)

    await freshDevice()
    await linkAccount(remote, 'user-1', 'download')
    expect(await snapshot()).toEqual(before)
    expect((await db.media.get('pic.png'))?.blob.size).toBe(3)
  })

  it('отправляются только изменения', async () => {
    const remote = new FakeRemote()
    await sampleCollection()
    await linkAccount(remote, 'u', 'upload')
    const r0 = await syncNow(remote)
    expect(r0.pushed).toBe(0)
    const card = (await db.cards.toArray()).find((c) => c.reps === 0)!
    await answerCardOp(card.id, 3, 1000)
    const r1 = await syncNow(remote)
    // карточка, запись истории, отложенная обратная карточка
    expect(r1.pushed).toBeGreaterThanOrEqual(2)
    expect(r1.pushed).toBeLessThanOrEqual(4)
    expect(r1.pulled).toBe(0)
  })

  it('удаление доходит до облака и до другого телефона', async () => {
    const remote = new FakeRemote()
    await sampleCollection()
    await linkAccount(remote, 'u', 'upload')
    const cat = (await db.notes.toArray()).find((n) => n.fields[0] === 'cat')!
    await deleteNote(cat.id)
    await syncNow(remote)
    expect(remote.rows.get(`note:${cat.id}`)?.deleted).toBe(true)

    await freshDevice()
    await linkAccount(remote, 'u', 'download')
    expect((await db.notes.toArray()).map((n) => n.fields[0])).toEqual(['dog'])
    expect(await db.cards.count()).toBe(2)
  })

  it('изменения из облака применяются и не отправляются обратно', async () => {
    const remote = new FakeRemote()
    await sampleCollection()
    await linkAccount(remote, 'u', 'upload')
    const deck = (await db.decks.where('name').equals('English').first())!
    remote.writeFromOtherDevice('deck', String(deck.id), { ...deck, name: 'English 2' })
    remote.writeFromOtherDevice('config', 'rolloverHour', { key: 'rolloverHour', value: 6 })
    const pushesBefore = remote.pushedRows
    const r = await syncNow(remote)
    expect(r.pulled).toBe(2)
    expect(r.pushed).toBe(0)
    expect(remote.pushedRows).toBe(pushesBefore)
    expect((await db.decks.get(deck.id))?.name).toBe('English 2')
    expect(await getConfig('rolloverHour', 4)).toBe(6)
  })

  it('замена облака данными телефона', async () => {
    const remote = new FakeRemote()
    remote.writeFromOtherDevice('note', '999', { id: 999, fields: ['old'] })
    await sampleCollection()
    expect(await linkInfo(remote)).toEqual({ remote: 1, localNotes: 2 })
    await linkAccount(remote, 'u', 'replace')
    expect(remote.rows.has('note:999')).toBe(false)
    expect(await db.notes.count()).toBe(2)
  })

  it('служебные ключи не уходят в облако', async () => {
    const remote = new FakeRemote()
    await sampleCollection()
    await setConfig('sync.lastAt', 1)
    await linkAccount(remote, 'u', 'upload')
    expect([...remote.rows.keys()].some((k) => k.startsWith('config:sync.'))).toBe(false)
  })
})
