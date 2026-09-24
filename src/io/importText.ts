// Импорт строк CSV/TXT в коллекцию
import { db } from '../db/db'
import { NO_REVERSE_FIELD } from '../db/defaults'
import { blankCard, createDeck, newGuid, nextPositions, sortTextOf } from '../db/collection'
import type { Card, Note, NoteType } from '../db/types'
import { cardOrdsForNote } from '../core/template'
import { escapeHtml, parseTags } from '../core/text'
import type { DupMode, ParsedText } from './textParse'

export interface ImportReport {
  added: number
  updated: number
  skipped: number
  cards: number
  media: number
  errors: { line: number; reason: string }[]
  deckIds: number[]
}

export const emptyReport = (): ImportReport => ({ added: 0, updated: 0, skipped: 0, cards: 0, media: 0, errors: [], deckIds: [] })

export interface TextPlan {
  noteTypeId: number
  deckId: number
  /** Для каждого поля типа — номер колонки или null */
  fieldColumns: (number | null)[]
  tagsColumn: number | null
  deckColumn: number | null
  guidColumn: number | null
  notetypeColumn: number | null
  extraTags: string[]
  html: boolean
  dupMode: DupMode
  skipFirstRow: boolean
}

export type Progress = (stage: string, done: number, total: number) => void

const CHUNK = 500

function toHtml(v: string, html: boolean): string {
  const s = v.trim()
  return html ? s : escapeHtml(s).replace(/\r?\n/g, '<br>')
}

/** Предлагаемое сопоставление колонок */
export function suggestPlan(parsed: ParsedText, nt: NoteType, deckId: number, names: string[] | null): TextPlan {
  const h = parsed.headers
  const special = new Set([h.tagsColumn, h.deckColumn, h.guidColumn, h.notetypeColumn].filter((v) => v !== undefined))
  let tagsColumn = h.tagsColumn ?? null
  if (tagsColumn === null && names) {
    const i = names.findIndex((n) => /^tags?$|^метки$|^теги$/i.test(n.trim()))
    if (i >= 0) {
      tagsColumn = i
      special.add(i)
    }
  }
  const free = Array.from({ length: parsed.columnCount }, (_, i) => i).filter((i) => !special.has(i))
  const fieldColumns = nt.fields.map((f, i) => {
    if (names) {
      const byName = names.findIndex((n) => n.trim().toLowerCase() === f.toLowerCase())
      if (byName >= 0 && !special.has(byName)) return byName
    }
    // Поле-флаг обратной карточки заполняется только колонкой с таким же названием
    if (f === NO_REVERSE_FIELD) return null
    return free[i] ?? null
  })
  const first = parsed.rows[0]?.map((c) => c.trim().toLowerCase()) ?? []
  const looksLikeHeader =
    !names &&
    first.length > 1 &&
    first.some((c) => nt.fields.some((f) => f.toLowerCase() === c) || /^(front|back|word|translation|tags|слово|перевод|пример|вопрос|ответ)$/.test(c))
  return {
    noteTypeId: nt.id,
    deckId,
    fieldColumns,
    tagsColumn,
    deckColumn: h.deckColumn ?? null,
    guidColumn: h.guidColumn ?? null,
    notetypeColumn: h.notetypeColumn ?? null,
    extraTags: h.tags ?? [],
    html: h.html ?? false,
    dupMode: h.ifMatches ?? 'skip',
    skipFirstRow: looksLikeHeader,
  }
}

interface Pending {
  note: Omit<Note, 'id'>
  ords: number[]
  deckId: number
}

export async function importTextRows(parsed: ParsedText, plan: TextPlan, progress?: Progress): Promise<ImportReport> {
  const report = emptyReport()
  const noteTypes = await db.noteTypes.toArray()
  const defaultNt = noteTypes.find((n) => n.id === plan.noteTypeId)
  if (!defaultNt) throw new Error('Тип заметки не найден')
  const ntByName = new Map(noteTypes.map((n) => [n.name.toLowerCase(), n]))

  // Существующие заметки: по GUID и по первому полю внутри типа
  const existing = await db.notes.toArray()
  const byGuid = new Map(existing.map((n) => [n.guid, n]))
  const byKey = new Map(existing.map((n) => [`${n.noteTypeId}\u0001${n.sortText}`, n]))

  const deckCache = new Map<string, number>()
  const deckFor = async (name: string | undefined): Promise<number> => {
    if (!name?.trim()) return plan.deckId
    const key = name.trim()
    let id = deckCache.get(key)
    if (id === undefined) {
      id = await createDeck(key)
      deckCache.set(key, id)
    }
    return id
  }

  const rows = plan.skipFirstRow ? parsed.rows.slice(1) : parsed.rows
  const lineOf = (i: number) => parsed.firstLine + i + (plan.skipFirstRow ? 1 : 0)
  const decksUsed = new Set<number>()
  const now = Date.now()

  for (let start = 0; start < rows.length; start += CHUNK) {
    progress?.('Заметки', start, rows.length)
    const pending: Pending[] = []
    const updates: Note[] = []
    for (let k = start; k < Math.min(rows.length, start + CHUNK); k++) {
      const row = rows[k]
      const line = lineOf(k)
      const ntName = plan.notetypeColumn !== null ? row[plan.notetypeColumn]?.trim().toLowerCase() : ''
      const nt: NoteType = (ntName && ntByName.get(ntName)) || defaultNt
      // Если тип из колонки отличается, поля берём подряд после служебных колонок
      const columns =
        nt === defaultNt
          ? plan.fieldColumns
          : nt.fields.map((_, i) => {
              const skip = new Set([plan.tagsColumn, plan.deckColumn, plan.guidColumn, plan.notetypeColumn])
              return Array.from({ length: row.length }, (_, j) => j).filter((j) => !skip.has(j))[i] ?? null
            })
      const fields = nt.fields.map((_, i) => {
        const c = columns[i]
        return c === null || c === undefined ? '' : toHtml(row[c] ?? '', plan.html)
      })
      if (fields.every((f) => !f)) continue
      const tagCell = plan.tagsColumn !== null ? (row[plan.tagsColumn] ?? '') : ''
      const tags = [...new Set([...parseTags(tagCell), ...plan.extraTags])]
      const guid = plan.guidColumn !== null ? row[plan.guidColumn]?.trim() : ''
      const sortText = sortTextOf(fields)
      const key = `${nt.id}\u0001${sortText}`
      const match = (guid && byGuid.get(guid)) || (sortText && plan.dupMode !== 'duplicate' ? byKey.get(key) : undefined)

      if (match && plan.dupMode !== 'duplicate') {
        if (plan.dupMode === 'update' && match.noteTypeId === nt.id && match.id > 0) {
          const upd = { ...match, fields, tags, sortText, modifiedAt: now }
          updates.push(upd)
          byKey.set(key, upd)
          report.updated++
        } else {
          report.skipped++
        }
        continue
      }
      const ords = cardOrdsForNote(nt, fields)
      if (!ords.length) {
        report.errors.push({
          line,
          reason: nt.kind === 'cloze' ? 'нет пропусков {{c1::...}}' : 'пустое поле для лицевой стороны',
        })
        continue
      }
      const deckId = await deckFor(plan.deckColumn !== null ? row[plan.deckColumn] : undefined)
      decksUsed.add(deckId)
      const note: Omit<Note, 'id'> = {
        guid: guid || newGuid(),
        noteTypeId: nt.id,
        fields,
        tags,
        sortText,
        createdAt: now + k,
        modifiedAt: now,
      }
      pending.push({ note, ords, deckId })
      // Дубли внутри самого файла тоже ловим
      const placeholder = { ...note, id: -1 } as Note
      if (sortText) byKey.set(key, placeholder)
      if (note.guid) byGuid.set(note.guid, placeholder)
    }

    await db.transaction('rw', [db.notes, db.cards, db.config], async () => {
      if (updates.length) await db.notes.bulkPut(updates)
      if (!pending.length) return
      const ids = await db.notes.bulkAdd(
        pending.map((p) => p.note),
        { allKeys: true },
      )
      const base = await nextPositions(pending.length)
      const cards: Omit<Card, 'id'>[] = []
      pending.forEach((p, i) => {
        for (const ord of p.ords) cards.push(blankCard(ids[i], p.deckId, ord, base + i, now))
      })
      await db.cards.bulkAdd(cards)
      report.added += pending.length
      report.cards += cards.length
    })
  }

  report.deckIds = [...decksUsed]
  progress?.('Готово', rows.length, rows.length)
  return report
}
