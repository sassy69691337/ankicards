import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import initSqlJs, { type SqlJsStatic } from 'sql.js'
import { strToU8, zipSync } from 'fflate'
import { db } from '../db/db'
import { ensureSeed } from '../db/seed'
import { CardType, Queue } from '../db/types'
import { schedTime } from '../core/time'
import { parseText } from './textParse'
import { importTextRows, suggestPlan } from './importText'
import { readApkg, NEW_FORMAT_MSG } from './apkgRead'
import { importApkg, summarize } from './importApkg'
import { createBackup, restoreBackup } from './backup'
import { exportDeckText } from './exportText'

let SQL: SqlJsStatic

beforeAll(async () => {
  SQL = await initSqlJs({ locateFile: (f) => `node_modules/sql.js/dist/${f}` })
})

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSeed()
})

const buf = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer
const basicType = async () => (await db.noteTypes.toArray()).find((n) => n.name === 'Основная')!
const wordType = async () => (await db.noteTypes.toArray()).find((n) => n.name === 'Слово (+ обратная)')!

describe('разбор текста', () => {
  it('определяет разделитель ; и кавычки с переносами', () => {
    const p = parseText(buf('dog;собака\n"big\nhouse";"дом; большой"\n'))
    expect(p.delimiter).toBe(';')
    expect(p.rows).toEqual([
      ['dog', 'собака'],
      ['big\nhouse', 'дом; большой'],
    ])
  })
  it('заголовки Anki', () => {
    const p = parseText(buf('#separator:tab\n#html:true\n#tags column:3\n#deck:Words\na\tb\tt1 t2\n'))
    expect(p.delimiter).toBe('\t')
    expect(p.headers.html).toBe(true)
    expect(p.headers.tagsColumn).toBe(2)
    expect(p.rows[0]).toEqual(['a', 'b', 't1 t2'])
    expect(p.firstLine).toBe(5)
  })
  it('Windows-1251', () => {
    const cp1251 = new Uint8Array([0xea, 0xee, 0xf2, 0x2c, 0x63, 0x61, 0x74]) // "кот,cat"
    const p = parseText(cp1251.buffer)
    expect(p.encoding).toBe('Windows-1251')
    expect(p.rows[0]).toEqual(['кот', 'cat'])
  })
})

describe('импорт текста', () => {
  it('добавляет заметки, пропускает дубли и пустые строки', async () => {
    const nt = await basicType()
    const p = parseText(buf('Front,Back,Tags\ncat,кот,animals\ndog,собака,animals\ncat,кошка,\n,только оборот,\n'))
    const plan = suggestPlan(p, nt, 1, null)
    expect(plan.skipFirstRow).toBe(true)
    plan.tagsColumn = 2
    const r = await importTextRows(p, plan)
    expect(r.added).toBe(2)
    expect(r.skipped).toBe(1)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0].line).toBe(5)
    const notes = await db.notes.toArray()
    expect(notes.map((n) => n.fields[0]).sort()).toEqual(['cat', 'dog'])
    expect(notes[0].tags).toEqual(['animals'])
    expect(await db.cards.count()).toBe(2)
  })
  it('режим обновления и экранирование HTML', async () => {
    const nt = await basicType()
    const first = parseText(buf('cat\tкот\n'))
    await importTextRows(first, suggestPlan(first, nt, 1, null))
    const second = parseText(buf('cat\t<b>кошка</b>\n'))
    const plan = { ...suggestPlan(second, nt, 1, null), dupMode: 'update' as const }
    const r = await importTextRows(second, plan)
    expect(r.updated).toBe(1)
    const note = (await db.notes.toArray())[0]
    expect(note.fields[1]).toBe('&lt;b&gt;кошка&lt;/b&gt;')
  })
  it('дубли внутри файла в режиме обновления не ломают базу', async () => {
    const nt = await basicType()
    const p = parseText(buf('cat\tкот\ncat\tкошка\n'))
    const r = await importTextRows(p, { ...suggestPlan(p, nt, 1, null), dupMode: 'update' })
    expect(r).toMatchObject({ added: 1, skipped: 1, updated: 0 })
    expect((await db.notes.toArray()).every((n) => n.id > 0)).toBe(true)
  })
  it('колонка колоды создаёт колоды', async () => {
    const nt = await wordType()
    const p = parseText(buf('#separator:tab\n#deck column:1\nEnglish::Food\tapple\tяблоко\t\n'))
    const plan = suggestPlan(p, nt, 1, null)
    expect(plan.fieldColumns).toEqual([1, 2, 3, null])
    await importTextRows(p, plan)
    const deck = await db.decks.where('name').equals('English::Food').first()
    expect(deck).toBeDefined()
    expect(await db.cards.where('deckId').equals(deck!.id).count()).toBe(2)
  })
})

// ---------- APKG ----------

function buildApkg(opts: { anki21b?: boolean; withMedia?: boolean } = {}): Uint8Array {
  const d = new SQL.Database()
  d.run(`CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text);
    CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text);
    CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text);
    CREATE TABLE revlog (id integer primary key, cid integer, usn integer, ease integer, ivl integer, lastIvl integer, factor integer, time integer, type integer);`)
  const crt = Math.floor(Date.now() / 1000) - 100 * 86400
  const models = {
    '1600000000000': {
      id: 1600000000000,
      name: 'Basic (and reversed card)',
      type: 0,
      css: '.card { font-size: 20px; }',
      flds: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }],
      tmpls: [
        { name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr id=answer>{{Back}}' },
        { name: 'Card 2', ord: 1, qfmt: '{{Back}}', afmt: '{{FrontSide}}<hr id=answer>{{Front}}' },
      ],
    },
  }
  const decks = { '1': { id: 1, name: 'Default', conf: 1 }, '1700000000000': { id: 1700000000000, name: 'Spanish::Verbs', conf: 2 } }
  const dconf = {
    '1': { id: 1, name: 'Default' },
    '2': { id: 2, name: 'Fast', new: { perDay: 50, delays: [1, 5, 30], ints: [2, 5, 0], initialFactor: 2300 }, rev: { perDay: 500 } },
  }
  d.run('INSERT INTO col VALUES (1, ?, 0, 0, 11, 0, 0, 0, "{}", ?, ?, ?, "{}")', [crt, JSON.stringify(models), JSON.stringify(decks), JSON.stringify(dconf)])
  d.run('INSERT INTO notes VALUES (10, "guid-a", 1600000000000, 0, 0, " verbs ", ?, "hablar", 0, 0, "")', ['hablar\x1fговорить <img src="speak.png">'])
  d.run('INSERT INTO notes VALUES (11, "guid-b", 1600000000000, 0, 0, "", ?, "comer", 0, 0, "")', ['comer [sound:comer.mp3]\x1fесть'])
  // hablar: карточка 1 на повторении (due через 3 дня), карточка 2 новая
  d.run('INSERT INTO cards VALUES (100, 10, 1700000000000, 0, 0, 0, 2, 2, 103, 15, 2600, 7, 1, 0, 0, 0, 1, "")')
  d.run('INSERT INTO cards VALUES (101, 10, 1700000000000, 1, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, "")')
  // comer: карточка 1 приостановлена на повторении, карточка 2 новая
  d.run('INSERT INTO cards VALUES (102, 11, 1700000000000, 0, 0, 0, 2, -1, 90, 30, 2500, 5, 0, 0, 0, 0, 0, "")')
  d.run('INSERT INTO cards VALUES (103, 11, 1700000000000, 1, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, "")')
  d.run('INSERT INTO revlog VALUES (1690000000000, 100, 0, 3, 15, 6, 2600, 8000, 1)')
  const dbBytes = d.export()
  d.close()
  const files: Record<string, Uint8Array> = { [opts.anki21b ? 'collection.anki2' : 'collection.anki21']: dbBytes }
  if (opts.anki21b) files['collection.anki21b'] = new Uint8Array([1, 2, 3])
  if (opts.withMedia !== false) {
    files.media = strToU8(JSON.stringify({ '0': 'speak.png', '1': 'comer.mp3' }))
    files['0'] = new Uint8Array([137, 80, 78, 71])
    files['1'] = new Uint8Array([73, 68, 51])
  }
  return zipSync(files)
}

describe('APKG', () => {
  it('читает колоду', () => {
    const data = readApkg(buildApkg(), SQL)
    const s = summarize(data)
    expect(s).toMatchObject({ notes: 2, cards: 4, media: 2, decks: ['Spanish::Verbs'], hasProgress: true })
    expect(data.notes[0].tags).toEqual(['verbs'])
    expect(data.notes[0].flds[0]).toBe('hablar')
  })

  it('понятная ошибка для формата zstd', () => {
    expect(() => readApkg(buildApkg({ anki21b: true }), SQL)).toThrow(NEW_FORMAT_MSG)
  })

  it('импорт с прогрессом', async () => {
    const r = await importApkg(readApkg(buildApkg(), SQL), { withProgress: true, dupMode: 'skip' })
    expect(r).toMatchObject({ added: 2, cards: 4, media: 2 })
    const deck = await db.decks.where('name').equals('Spanish::Verbs').first()
    expect(deck).toBeDefined()
    expect(await db.decks.where('name').equals('Spanish').count()).toBe(1)
    const opts = await db.deckOptions.get(deck!.optionsId)
    expect(opts).toMatchObject({ newPerDay: 50, learnSteps: [1, 5, 30], graduatingIvl: 2, startingEase: 2300 })

    const nt = (await db.noteTypes.toArray()).find((n) => n.ankiId === 1600000000000)!
    expect(nt.fields).toEqual(['Front', 'Back'])
    const cards = await db.cards.toArray()
    const review = cards.find((c) => c.type === CardType.Review && c.queue === Queue.Review)!
    expect(review.due).toBe(schedTime().today + 3)
    expect(review.ivl).toBe(15)
    expect(review.ease).toBe(2600)
    expect(review.flags).toBe(1)
    expect(cards.filter((c) => c.queue === Queue.Suspended)).toHaveLength(1)
    const fresh = cards.filter((c) => c.type === CardType.New).sort((a, b) => a.due - b.due)
    expect(fresh[1].due - fresh[0].due).toBe(1)
    expect(await db.revlog.count()).toBe(1)
    expect((await db.media.get('speak.png'))?.blob.type).toBe('image/png')
  })

  it('без прогресса все карточки новые; повторный импорт не дублирует', async () => {
    const bytes = buildApkg()
    await importApkg(readApkg(bytes, SQL), { withProgress: false, dupMode: 'skip' })
    const cards = await db.cards.toArray()
    expect(cards.every((c) => c.type === CardType.New && c.queue === Queue.New)).toBe(true)
    expect(await db.revlog.count()).toBe(0)
    const again = await importApkg(readApkg(bytes, SQL), { withProgress: false, dupMode: 'skip' })
    expect(again).toMatchObject({ added: 0, skipped: 2 })
    expect(await db.notes.count()).toBe(2)
    expect(await db.noteTypes.where('name').equals('Basic (and reversed card)').count()).toBe(1)
  })
})

describe('резервная копия и экспорт', () => {
  it('копия восстанавливает всё, включая медиа', async () => {
    await importApkg(readApkg(buildApkg(), SQL), { withProgress: true, dupMode: 'skip' })
    const counts = async () => [await db.notes.count(), await db.cards.count(), await db.revlog.count(), await db.media.count(), await db.decks.count()]
    const before = await counts()
    const { blob } = await createBackup()
    await db.notes.clear()
    await db.cards.clear()
    await db.media.clear()
    await restoreBackup(new Uint8Array(await blob.arrayBuffer()))
    expect(await counts()).toEqual(before)
    expect((await db.media.get('comer.mp3'))?.blob.size).toBe(3)
  })

  it('экспорт TXT читается обратно', async () => {
    await importApkg(readApkg(buildApkg(), SQL), { withProgress: false, dupMode: 'skip' })
    const deck = (await db.decks.where('name').equals('Spanish').first())!
    const { blob, notes } = await exportDeckText(deck.id, 'anki')
    expect(notes).toBe(2)
    const text = await blob.text()
    const p = parseText(buf(text))
    expect(p.headers).toMatchObject({ html: true, guidColumn: 0, notetypeColumn: 1, deckColumn: 2, tagsColumn: 5 })
    // Импорт в пустую базу: всё возвращается на место
    await db.notes.clear()
    await db.cards.clear()
    const nt = (await db.noteTypes.toArray()).find((n) => n.ankiId)!
    const r = await importTextRows(p, suggestPlan(p, nt, 1, null))
    expect(r.added).toBe(2)
    expect(await db.cards.count()).toBe(4)
    const hablar = (await db.notes.toArray()).find((n) => n.guid === 'guid-a')!
    expect(hablar.fields[1]).toBe('говорить <img src="speak.png">')
    expect(hablar.tags).toEqual(['verbs'])
  })

  it('экспорт CSV для таблиц', async () => {
    const nt = await basicType()
    const p = parseText(buf('cat\tкот\n'))
    await importTextRows(p, suggestPlan(p, nt, 1, null))
    const { blob } = await exportDeckText(1, 'csv')
    const text = await blob.text()
    expect(text.replace(/^﻿/, '')).toBe('cat;кот;')
  })
})
