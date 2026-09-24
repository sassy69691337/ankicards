// Разбор CSV/TXT, включая заголовки формата Anki (#separator:, #html:, #deck column: ...)
import Papa from 'papaparse'

export interface TextHeaders {
  separator?: string
  html?: boolean
  tags?: string[]
  columns?: string
  notetype?: string
  deck?: string
  /** Номера колонок, с 0 */
  notetypeColumn?: number
  deckColumn?: number
  tagsColumn?: number
  guidColumn?: number
  ifMatches?: DupMode
}

export type DupMode = 'skip' | 'update' | 'duplicate'

export interface ParsedText {
  rows: string[][]
  headers: TextHeaders
  delimiter: string
  encoding: string
  /** Номер строки файла (с 1) для первой строки данных */
  firstLine: number
  columnCount: number
}

export function decodeText(buf: ArrayBuffer): { text: string; encoding: string } {
  const bytes = new Uint8Array(buf)
  let text: string
  let encoding = 'UTF-8'
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    text = new TextDecoder('utf-16le').decode(bytes)
    encoding = 'UTF-16'
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    text = new TextDecoder('utf-16be').decode(bytes)
    encoding = 'UTF-16'
  } else {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      // Excel в русской Windows сохраняет CSV в Windows-1251
      text = new TextDecoder('windows-1251').decode(bytes)
      encoding = 'Windows-1251'
    }
  }
  return { text: text.replace(/^﻿/, ''), encoding }
}

const SEPARATORS: Record<string, string> = {
  tab: '\t',
  comma: ',',
  semicolon: ';',
  space: ' ',
  pipe: '|',
  colon: ':',
}

export const SEPARATOR_LABELS: { value: string; label: string }[] = [
  { value: '\t', label: 'Табуляция' },
  { value: ';', label: 'Точка с запятой' },
  { value: ',', label: 'Запятая' },
  { value: '|', label: 'Вертикальная черта' },
  { value: ':', label: 'Двоеточие' },
  { value: ' ', label: 'Пробел' },
]

export function parseHeaders(text: string): { headers: TextHeaders; body: string; headerLines: number } {
  const lines = text.split(/\r?\n/)
  const h: TextHeaders = {}
  const col = (v: string) => {
    const n = parseInt(v, 10)
    return n > 0 ? n - 1 : undefined
  }
  let i = 0
  for (; i < lines.length; i++) {
    const m = /^#([a-z ]+):(.*)$/i.exec(lines[i].trim())
    if (!m) break
    const key = m[1].trim().toLowerCase()
    const val = m[2].trim()
    switch (key) {
      case 'separator':
        h.separator = SEPARATORS[val.toLowerCase()] ?? (val.length === 1 ? val : undefined)
        break
      case 'html':
        h.html = val.toLowerCase() === 'true'
        break
      case 'tags':
        h.tags = val.split(/\s+/).filter(Boolean)
        break
      case 'columns':
        h.columns = val
        break
      case 'notetype':
        h.notetype = val
        break
      case 'deck':
        h.deck = val
        break
      case 'notetype column':
        h.notetypeColumn = col(val)
        break
      case 'deck column':
        h.deckColumn = col(val)
        break
      case 'tags column':
        h.tagsColumn = col(val)
        break
      case 'guid column':
        h.guidColumn = col(val)
        break
      case 'if matches': {
        const v = val.toLowerCase()
        h.ifMatches = v.startsWith('update') ? 'update' : v.startsWith('keep both') ? 'duplicate' : 'skip'
        break
      }
      default:
        // неизвестный заголовок — пропускаем
        break
    }
  }
  return { headers: h, body: lines.slice(i).join('\n'), headerLines: i }
}

export function detectDelimiter(body: string): string {
  const sample = body.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30)
  if (!sample.length) return '\t'
  let best = '\t'
  let bestScore = 0
  for (const d of ['\t', ';', ',', '|']) {
    const res = Papa.parse<string[]>(sample.join('\n'), { delimiter: d, skipEmptyLines: true })
    const counts = res.data.map((r) => r.length)
    const cols = Math.min(...counts)
    if (cols < 2) continue
    const consistent = counts.filter((c) => c === counts[0]).length / counts.length
    const score = consistent * 10 + Math.min(cols, 5)
    if (score > bestScore) {
      bestScore = score
      best = d
    }
  }
  return best
}

export function parseRows(body: string, delimiter: string): string[][] {
  const res = Papa.parse<string[]>(body, { delimiter, skipEmptyLines: 'greedy', quoteChar: '"' })
  return res.data
}

export function parseText(buf: ArrayBuffer, delimiterOverride?: string): ParsedText {
  const { text, encoding } = decodeText(buf)
  const { headers, body, headerLines } = parseHeaders(text)
  const delimiter = delimiterOverride ?? headers.separator ?? detectDelimiter(body)
  const rows = parseRows(body, delimiter)
  return {
    rows,
    headers,
    delimiter,
    encoding,
    firstLine: headerLines + 1,
    columnCount: rows.reduce((m, r) => Math.max(m, r.length), 0),
  }
}

/** Названия колонок из #columns: */
export function columnNames(parsed: ParsedText): string[] | null {
  if (!parsed.headers.columns) return null
  return parseRows(parsed.headers.columns, parsed.delimiter)[0] ?? null
}
