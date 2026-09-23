export const DAY_MS = 86_400_000

let rolloverHour = 4

/** Час, в который начинается новый день (как в Anki, по умолчанию 4:00) */
export function setRolloverHour(h: number) {
  rolloverHour = h
}

export function getRolloverHour() {
  return rolloverHour
}

/** Номер дня с учётом часа смены дня (локальное время) */
export function dayNumber(ms: number, rollover = rolloverHour): number {
  const d = new Date(ms - rollover * 3_600_000)
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS)
}

/** Момент начала дня с номером day */
export function dayStart(day: number, rollover = rolloverHour): number {
  const d = new Date(day * DAY_MS)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), rollover).getTime()
}

export interface SchedTime {
  now: number
  today: number
  dayStart: number
  dayEnd: number
}

export function schedTime(now = Date.now()): SchedTime {
  const today = dayNumber(now)
  return { now, today, dayStart: dayStart(today), dayEnd: dayStart(today + 1) }
}
