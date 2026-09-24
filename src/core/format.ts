import { dayStart } from './time'

const nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })

export function formatInterval(secs: number): string {
  if (secs < 60) return '<1 мин'
  const mins = secs / 60
  if (mins < 59.5) return `${Math.round(mins)} мин`
  const hours = mins / 60
  if (hours < 23.95) return `${nf1.format(hours)} ч`
  const days = hours / 24
  if (days < 29.5) return `${Math.round(days)} д`
  const months = days / 30.44
  if (months < 11.95) return `${nf1.format(months)} мес`
  return `${nf1.format(days / 365.25)} г`
}

export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return forms[2]
  if (b > 1 && b < 5) return forms[1]
  if (b === 1) return forms[0]
  return forms[2]
}

export const cardsWord = (n: number) => plural(n, ['карточка', 'карточки', 'карточек'])

export function formatDay(day: number): string {
  const d = new Date(dayStart(day))
  // Год показываем, только если он не текущий
  const year = d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' as const } : {}
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', ...year })
}

/** "1m 10m 1h 1d" -> минуты. null при ошибке */
export function parseSteps(s: string): number[] | null {
  const out: number[] = []
  for (const tok of s.trim().split(/[\s,;]+/).filter(Boolean)) {
    const m = /^(\d+(?:[.,]\d+)?)\s*(s|m|h|d|с|м|ч|д)?$/i.exec(tok)
    if (!m) return null
    const v = parseFloat(m[1].replace(',', '.'))
    const u = (m[2] ?? 'm').toLowerCase()
    const mult = u === 's' || u === 'с' ? 1 / 60 : u === 'h' || u === 'ч' ? 60 : u === 'd' || u === 'д' ? 1440 : 1
    if (!(v > 0)) return null
    out.push(v * mult)
  }
  return out
}

export function formatSteps(steps: number[]): string {
  return steps
    .map((m) => {
      if (m >= 1440 && m % 1440 === 0) return `${m / 1440}d`
      if (m >= 60 && m % 60 === 0) return `${m / 60}h`
      if (m < 1) return `${Math.round(m * 60)}s`
      return `${+m.toFixed(2)}m`
    })
    .join(' ')
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
