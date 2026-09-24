// Экспорт колоды в текст: формат Anki (TXT) или простой CSV для таблиц
import Papa from 'papaparse'
import { db } from '../db/db'
import { subtreeIds } from '../db/collection'
import { stripHtml } from '../core/text'

export type TextExportKind = 'anki' | 'csv'

export async function exportDeckText(deckId: number, kind: TextExportKind): Promise<{ blob: Blob; notes: number }> {
  const deck = await db.decks.get(deckId)
  if (!deck) throw new Error('Колода не найдена')
  const ids = await subtreeIds(deck)
  const cards = await db.cards.where('deckId').anyOf(ids).toArray()
  const deckOfNote = new Map<number, number>()
  for (const c of cards.sort((a, b) => a.ord - b.ord)) if (!deckOfNote.has(c.noteId)) deckOfNote.set(c.noteId, c.deckId)
  const notes = (await db.notes.bulkGet([...deckOfNote.keys()])).filter((n) => n !== undefined)
  notes.sort((a, b) => a.createdAt - b.createdAt)
  const noteTypes = new Map((await db.noteTypes.toArray()).map((n) => [n.id, n]))
  const deckNames = new Map((await db.decks.toArray()).map((d) => [d.id, d.name]))

  if (kind === 'csv') {
    // Простой CSV: поля без HTML + метки, с BOM, чтобы Excel понял кириллицу
    const maxFields = Math.max(0, ...notes.map((n) => n.fields.length))
    const rows = notes.map((n) => {
      const cells = n.fields.map((f) => stripHtml(f.replace(/<br\s*\/?>/gi, '\n')))
      while (cells.length < maxFields) cells.push('')
      return [...cells, n.tags.join(' ')]
    })
    const csv = Papa.unparse(rows, { delimiter: ';', newline: '\r\n' })
    return { blob: new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), notes: notes.length }
  }

  // Формат Anki: guid, тип, колода, поля..., метки
  const maxFields = Math.max(0, ...notes.map((n) => n.fields.length))
  const rows = notes.map((n) => {
    const fields = [...n.fields]
    while (fields.length < maxFields) fields.push('')
    return [n.guid, noteTypes.get(n.noteTypeId)?.name ?? '', deckNames.get(deckOfNote.get(n.id)!) ?? deck.name, ...fields, n.tags.join(' ')]
  })
  const header = [
    '#separator:tab',
    '#html:true',
    '#guid column:1',
    '#notetype column:2',
    '#deck column:3',
    `#tags column:${maxFields + 4}`,
  ].join('\n')
  const body = Papa.unparse(rows, { delimiter: '\t', newline: '\n' })
  return { blob: new Blob([`${header}\n${body}\n`], { type: 'text/plain;charset=utf-8' }), notes: notes.length }
}
