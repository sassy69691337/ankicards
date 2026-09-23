import type { NoteType } from '../db/types'
import { escapeHtml, isEmptyField, plainText, stripHtml } from './text'

export type Side = 'q' | 'a'
export type TypeMode = 'input' | 'compare' | 'hide'

export interface RenderCtx {
  fields: Record<string, string>
  tags: string[]
  deck: string
  noteType: string
  cardName: string
  /** Номер пропуска (c1 = 1), 0 для обычных типов */
  clozeOrd: number
  side: Side
  typeMode: TypeMode
  typed: string | null
  frontSide: string
}

export const SPEAKER_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>'

// ---------- Парсер шаблонов ----------

type TNode =
  | { k: 'text'; v: string }
  | { k: 'var'; v: string }
  | { k: 'sec'; v: string; neg: boolean; body: TNode[] }

const parseCache = new Map<string, TNode[]>()

function parseTemplate(src: string): TNode[] {
  const cached = parseCache.get(src)
  if (cached) return cached
  const root: TNode[] = []
  const stack: { name: string; body: TNode[] }[] = [{ name: '', body: root }]
  const re = /\{\{([\s\S]*?)\}\}/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const body = stack[stack.length - 1].body
    if (m.index > last) body.push({ k: 'text', v: src.slice(last, m.index) })
    last = re.lastIndex
    const tag = m[1].trim()
    const head = tag[0]
    if (head === '#' || head === '^') {
      const sec = { k: 'sec' as const, v: tag.slice(1).trim(), neg: head === '^', body: [] as TNode[] }
      body.push(sec)
      stack.push({ name: sec.v, body: sec.body })
    } else if (head === '/') {
      const name = tag.slice(1).trim()
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].name === name) {
          stack.length = i
          break
        }
      }
    } else if (tag) {
      body.push({ k: 'var', v: tag })
    }
  }
  if (last < src.length) stack[stack.length - 1].body.push({ k: 'text', v: src.slice(last) })
  if (parseCache.size > 500) parseCache.clear()
  parseCache.set(src, root)
  return root
}

export function renderTemplate(src: string, ctx: RenderCtx): string {
  return renderNodes(parseTemplate(src), ctx)
}

function renderNodes(nodes: TNode[], ctx: RenderCtx): string {
  let out = ''
  for (const n of nodes) {
    if (n.k === 'text') out += n.v
    else if (n.k === 'var') out += renderVar(n.v, ctx)
    else if (sectionIsTrue(n.v, ctx) !== n.neg) out += renderNodes(n.body, ctx)
  }
  return out
}

function sectionIsTrue(name: string, ctx: RenderCtx): boolean {
  if (Object.hasOwn(ctx.fields, name)) return !isEmptyField(ctx.fields[name])
  const cm = /^c(\d+)$/.exec(name)
  if (cm) return ctx.clozeOrd === Number(cm[1])
  if (name === 'Tags') return ctx.tags.length > 0
  return false
}

function lookup(name: string, ctx: RenderCtx): string | undefined {
  if (Object.hasOwn(ctx.fields, name)) return ctx.fields[name]
  switch (name) {
    case 'FrontSide':
      return ctx.frontSide
    case 'Tags':
      return ctx.tags.join(' ')
    case 'Deck':
      return ctx.deck
    case 'Subdeck':
      return ctx.deck.split('::').pop() ?? ''
    case 'Type':
      return ctx.noteType
    case 'Card':
      return ctx.cardName
    case 'CardFlag':
      return ''
  }
  return undefined
}

function renderVar(tag: string, ctx: RenderCtx): string {
  if (/^tts\s/i.test(tag)) return renderTts(tag, ctx)
  const parts = tag.split(':')
  const name = parts.pop()!.trim()
  const filters = parts.map((p) => p.trim().toLowerCase())
  const raw = lookup(name, ctx)
  if (raw === undefined) return ''
  if (filters.includes('type')) return renderType(raw, filters.includes('cloze'), ctx)
  let value = raw
  // Фильтры применяются справа налево: {{text:cloze:F}} = text(cloze(F))
  for (let i = filters.length - 1; i >= 0; i--) value = applyFilter(filters[i], value, ctx)
  return value
}

const FURI_RE = / ?([^ >[\]]+?)\[(.+?)\]/g

function applyFilter(f: string, v: string, ctx: RenderCtx): string {
  switch (f) {
    case 'cloze':
      return renderCloze(v, ctx.clozeOrd, ctx.side)
    case 'cloze-only':
      return clozeAnswers(v, ctx.clozeOrd).join(', ')
    case 'text':
      return stripHtml(v)
    case 'hint':
      return isEmptyField(v) ? '' : `<a class="hint-btn" href="#">Подсказка</a><div class="hint">${v}</div>`
    case 'furigana':
      return v.replace(FURI_RE, '<ruby><rb>$1</rb><rt>$2</rt></ruby>')
    case 'kanji':
      return v.replace(FURI_RE, '$1')
    case 'kana':
      return v.replace(FURI_RE, '$2')
    default:
      return v
  }
}

function renderType(raw: string, cloze: boolean, ctx: RenderCtx): string {
  if (ctx.typeMode === 'hide') return ''
  if (ctx.typeMode === 'input') {
    return '<input type="text" class="typeans" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="Ваш ответ">'
  }
  const expected = cloze ? clozeAnswers(raw, ctx.clozeOrd).join(', ') : stripHtml(raw)
  return `<div class="typeans-result">${compareAnswer(expected, ctx.typed ?? '')}</div>`
}

function renderTts(tag: string, ctx: RenderCtx): string {
  const m = /^tts\s+([A-Za-z]{2,3}(?:[_-][A-Za-z0-9]+)?)[^:]*:([\s\S]+)$/.exec(tag)
  if (!m) return ''
  const lang = m[1].replace('_', '-')
  const text = plainText(renderVar(m[2], ctx))
  if (!text) return ''
  return `<button type="button" class="tts" data-lang="${escapeHtml(lang)}" data-text="${escapeHtml(text)}" aria-label="Озвучить">${SPEAKER_ICON}</button>`
}

/** Используется ли поле в шаблоне как {{Поле}} или {{фильтр:Поле}} */
export function templateUsesField(tmpl: string, field: string): boolean {
  for (const m of tmpl.matchAll(/\{\{([^}]*)\}\}/g)) {
    const tag = m[1].trim()
    if (/^[#^/]/.test(tag)) continue
    if (tag.split(':').pop()!.trim() === field) return true
  }
  return false
}

// ---------- Пропуски (cloze) ----------

export const CLOZE_RE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g

export function renderCloze(text: string, ord: number, side: Side): string {
  return text.replace(CLOZE_RE, (_m, n: string, content: string, hint?: string) => {
    if (Number(n) !== ord) return `<span class="cloze-inactive">${content}</span>`
    if (side === 'q') return `<span class="cloze">[${hint?.trim() ? hint : '...'}]</span>`
    return `<span class="cloze">${content}</span>`
  })
}

export function clozeNumbers(text: string): number[] {
  const s = new Set<number>()
  for (const m of text.matchAll(CLOZE_RE)) s.add(Number(m[1]))
  return [...s]
}

export function clozeAnswers(text: string, ord: number): string[] {
  return [...text.matchAll(CLOZE_RE)].filter((m) => Number(m[1]) === ord).map((m) => stripHtml(m[2]))
}

export function stripCloze(text: string): string {
  return text.replace(CLOZE_RE, '$2')
}

// ---------- Карточки ----------

type NoteTypeShape = Pick<NoteType, 'name' | 'kind' | 'fields' | 'templates'>

export function fieldMap(nt: NoteTypeShape, fields: string[]): Record<string, string> {
  const m: Record<string, string> = {}
  nt.fields.forEach((f, i) => {
    m[f] = fields[i] ?? ''
  })
  return m
}

/** Какие карточки (ord) должна породить заметка */
export function cardOrdsForNote(nt: NoteTypeShape, fields: string[]): number[] {
  if (nt.kind === 'cloze') {
    const qfmt = nt.templates[0]?.qfmt ?? ''
    const names = [...qfmt.matchAll(/\{\{[^}]*?cloze:([^}]+?)\s*\}\}/g)].map((m) => m[1].trim())
    const nums = new Set<number>()
    nt.fields.forEach((name, i) => {
      if (names.length === 0 || names.includes(name)) clozeNumbers(fields[i] ?? '').forEach((n) => nums.add(n))
    })
    return [...nums].filter((n) => n > 0).sort((a, b) => a - b).map((n) => n - 1)
  }
  const ctx = (values: string[]): RenderCtx => ({
    fields: fieldMap(nt, values),
    tags: [],
    deck: '',
    noteType: nt.name,
    cardName: '',
    clozeOrd: 0,
    side: 'q',
    typeMode: 'input',
    typed: null,
    frontSide: '',
  })
  const empty = nt.fields.map(() => '')
  const ords: number[] = []
  nt.templates.forEach((t, i) => {
    const q = renderTemplate(t.qfmt, ctx(fields)).trim()
    const e = renderTemplate(t.qfmt, ctx(empty)).trim()
    if (q !== e) ords.push(i)
  })
  return ords
}

export function renderCard(
  nt: NoteTypeShape,
  note: { fields: string[]; tags: string[] },
  ord: number,
  deck: string,
  typed: string | null = null,
): { q: string; a: string } {
  const cloze = nt.kind === 'cloze'
  const tmpl = cloze ? nt.templates[0] : nt.templates[ord]
  if (!tmpl) return { q: '<p>Шаблон карточки не найден</p>', a: '' }
  const base = {
    fields: fieldMap(nt, note.fields),
    tags: note.tags,
    deck,
    noteType: nt.name,
    cardName: cloze ? `Пропуск ${ord + 1}` : tmpl.name,
    clozeOrd: cloze ? ord + 1 : 0,
    typed,
    frontSide: '',
  }
  const q = renderTemplate(tmpl.qfmt, { ...base, side: 'q', typeMode: 'input' })
  const afmtHasType = /\{\{[^}]*type:/.test(tmpl.afmt)
  const front = renderTemplate(tmpl.qfmt, { ...base, side: 'q', typeMode: afmtHasType ? 'hide' : 'compare' })
  const a = renderTemplate(tmpl.afmt, { ...base, side: 'a', typeMode: 'compare', frontSide: front })
  return { q, a }
}

// ---------- Сравнение введённого ответа ----------

export function compareAnswer(expected: string, typed: string): string {
  const exp = expected.trim()
  const got = typed.trim()
  if (!got) return `<span class="typeExpected">${escapeHtml(exp)}</span>`
  if (got === exp) return `<span class="typeGood">${escapeHtml(exp)}</span>`
  const a = Array.from(got)
  const b = Array.from(exp)
  const arrow = '<br><span class="typeArrow">↓</span><br>'
  if (a.length * b.length > 250_000) {
    return `<span class="typeBad">${escapeHtml(got)}</span>${arrow}<span class="typeExpected">${escapeHtml(exp)}</span>`
  }
  // Наибольшая общая подпоследовательность
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const aOk = new Array<boolean>(a.length).fill(false)
  const bOk = new Array<boolean>(b.length).fill(false)
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      aOk[i] = true
      bOk[j] = true
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  return spans(a, aOk, 'typeGood', 'typeBad') + arrow + spans(b, bOk, 'typeGood', 'typeMissed')
}

function spans(chars: string[], ok: boolean[], good: string, bad: string): string {
  let out = ''
  let buf = ''
  let cur: boolean | null = null
  const flush = () => {
    if (buf) out += `<span class="${cur ? good : bad}">${escapeHtml(buf)}</span>`
    buf = ''
  }
  chars.forEach((ch, k) => {
    if (ok[k] !== cur) {
      flush()
      cur = ok[k]
    }
    buf += ch
  })
  flush()
  return out
}
