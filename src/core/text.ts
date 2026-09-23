const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const hex = e[1] === 'x' || e[1] === 'X'
      const code = hex ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>|<\/(div|p|li)>/gi, ' ')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

/** Текст без HTML и тегов [sound:...] — для поиска и озвучки */
export function plainText(html: string): string {
  return stripHtml(html.replace(/\[sound:[^\]]*\]/g, ''))
}

export function isEmptyField(v: string): boolean {
  return !/<img|<video|<audio|\[sound:/i.test(v) && stripHtml(v) === ''
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c])
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Текст из textarea -> HTML поля */
export function fromEditor(text: string): string {
  return text.replace(/\r?\n/g, '<br>')
}

/** HTML поля -> текст для textarea */
export function toEditor(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n')
}

export function parseTags(s: string): string[] {
  return [...new Set(s.split(/[\s,]+/).filter(Boolean))]
}
