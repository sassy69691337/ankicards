// Планировщик в стиле Anki (SM-2, v2/v3): шаги обучения, лёгкость, интервалы, пиявки.
import { CardType, Queue, type Card, type DeckOptions } from '../db/types'
import type { SchedTime } from './time'

export type Rating = 1 | 2 | 3 | 4
/** Генератор случайных чисел для fuzz; null — без fuzz */
export type Rng = (() => number) | null

const DAY_SECS = 86_400
const MIN_EASE = 1300

export interface AnswerOutcome {
  card: Card
  logType: 0 | 1 | 2
  logIvl: number
  lastIvl: number
  leech: boolean
}

export function answer(card: Card, rating: Rating, o: DeckOptions, t: SchedTime, rng: Rng = Math.random): AnswerOutcome {
  const c: Card = { ...card, reps: card.reps + 1, modifiedAt: t.now }
  const logType: 0 | 1 | 2 = card.type === CardType.Review ? 1 : card.type === CardType.Relearn ? 2 : 0
  const lastIvl = logInterval(card, t)
  let leech = false

  if (card.type === CardType.New || card.type === CardType.Learn) {
    if (card.type === CardType.New) {
      c.type = CardType.Learn
      c.left = o.learnSteps.length
      c.ease = o.startingEase
    }
    stepLearning(c, rating, o.learnSteps, false, o, t, rng)
  } else if (card.type === CardType.Relearn) {
    stepLearning(c, rating, o.relearnSteps, true, o, t, rng)
  } else if (rating === 1) {
    leech = lapse(c, o, t)
  } else {
    review(c, card, rating, o, t, rng)
  }
  return { card: c, logType, logIvl: logInterval(c, t), lastIvl, leech }
}

function logInterval(c: Card, t: SchedTime): number {
  if (c.queue === Queue.Learn) return -Math.max(0, Math.round((c.due - t.now) / 1000))
  if (c.queue === Queue.DayLearn) return c.due - t.today
  return c.ivl
}

function stepLearning(c: Card, rating: Rating, steps: number[], relearn: boolean, o: DeckOptions, t: SchedTime, rng: Rng) {
  const n = steps.length
  if (n === 0 || rating === 4) return graduate(c, relearn, rating === 4, o, t, rng)
  const idx = Math.min(Math.max(n - c.left, 0), n - 1)
  if (rating === 1) {
    c.left = n
    return scheduleStep(c, steps[0] * 60, t)
  }
  if (rating === 2) {
    let delay: number
    if (idx === 0) delay = n > 1 ? (steps[0] + steps[1]) / 2 : Math.min(steps[0] * 1.5, steps[0] + 1440)
    else delay = steps[idx]
    return scheduleStep(c, delay * 60, t)
  }
  if (idx + 1 >= n) return graduate(c, relearn, false, o, t, rng)
  c.left = n - (idx + 1)
  scheduleStep(c, steps[idx + 1] * 60, t)
}

function scheduleStep(c: Card, secs: number, t: SchedTime) {
  if (secs >= DAY_SECS) {
    c.queue = Queue.DayLearn
    c.due = t.today + Math.max(1, Math.round(secs / DAY_SECS))
  } else {
    c.queue = Queue.Learn
    c.due = t.now + Math.round(secs * 1000)
  }
}

function graduate(c: Card, relearn: boolean, easy: boolean, o: DeckOptions, t: SchedTime, rng: Rng) {
  let ivl: number
  if (relearn) ivl = easy ? c.ivl + 1 : c.ivl
  else ivl = easy ? o.easyIvl : o.graduatingIvl
  ivl = Math.min(o.maxIvl, Math.max(1, fuzz(ivl, o.maxIvl, rng)))
  c.type = CardType.Review
  c.queue = Queue.Review
  c.ivl = ivl
  c.due = t.today + ivl
  c.left = 0
}

function lapse(c: Card, o: DeckOptions, t: SchedTime): boolean {
  c.lapses += 1
  c.ease = Math.max(MIN_EASE, c.ease - 200)
  c.ivl = Math.max(o.minIvl, Math.round(c.ivl * o.lapseMult))
  const th = o.leechThreshold
  const leech = th > 0 && c.lapses >= th && (c.lapses - th) % Math.max(1, Math.floor(th / 2)) === 0
  if (o.relearnSteps.length > 0) {
    c.type = CardType.Relearn
    c.left = o.relearnSteps.length
    scheduleStep(c, o.relearnSteps[0] * 60, t)
  } else {
    c.queue = Queue.Review
    c.due = t.today + c.ivl
  }
  if (leech && o.leechAction === 'suspend') c.queue = Queue.Suspended
  return leech
}

export function reviewIntervals(card: Card, o: DeckOptions, t: SchedTime) {
  const late = Math.max(0, t.today - card.due)
  const ease = card.ease / 1000
  const m = o.intervalModifier
  const cap = (x: number, min: number) => Math.min(o.maxIvl, Math.max(min, 1, Math.round(x)))
  const hard = cap(card.ivl * o.hardFactor * m, o.hardFactor > 1 ? card.ivl + 1 : 1)
  const good = cap((card.ivl + late / 2) * ease * m, hard + 1)
  const easy = cap((card.ivl + late) * ease * o.easyBonus * m, good + 1)
  return { hard, good, easy }
}

function review(c: Card, card: Card, rating: 2 | 3 | 4, o: DeckOptions, t: SchedTime, rng: Rng) {
  const iv = reviewIntervals(card, o, t)
  const base = rating === 2 ? iv.hard : rating === 3 ? iv.good : iv.easy
  const min = rating === 2 ? 1 : rating === 3 ? iv.hard + 1 : iv.good + 1
  const ivl = Math.min(o.maxIvl, Math.max(fuzz(base, o.maxIvl, rng), min))
  c.ivl = ivl
  c.due = t.today + ivl
  if (rating === 2) c.ease = Math.max(MIN_EASE, card.ease - 150)
  else if (rating === 4) c.ease = card.ease + 150
}

const FUZZ_RANGES: [number, number, number][] = [
  [2.5, 7, 0.15],
  [7, 20, 0.1],
  [20, Infinity, 0.05],
]

export function fuzz(ivl: number, maxIvl: number, rng: Rng): number {
  if (!rng || ivl < 2.5) return Math.round(ivl)
  let delta = 1
  for (const [s, e, f] of FUZZ_RANGES) delta += f * Math.max(Math.min(ivl, e) - s, 0)
  const lo = Math.max(2, Math.round(ivl - delta))
  const hi = Math.min(maxIvl, Math.round(ivl + delta))
  if (hi <= lo) return Math.min(maxIvl, lo)
  return lo + Math.floor(rng() * (hi - lo + 1))
}

/** Интервалы для подписей на кнопках, в секундах */
export function previewIntervals(card: Card, o: DeckOptions, t: SchedTime): Record<Rating, number> {
  const res = {} as Record<Rating, number>
  for (const r of [1, 2, 3, 4] as Rating[]) {
    const { card: c } = answer(card, r, o, t, null)
    res[r] = c.queue === Queue.Learn ? Math.max(0, (c.due - t.now) / 1000) : Math.max(0, c.due - t.today) * DAY_SECS
  }
  return res
}

/** Очередь, в которую возвращается карточка после снятия приостановки/откладывания */
export function activeQueue(c: Pick<Card, 'type' | 'due'>): Queue {
  switch (c.type) {
    case CardType.New:
      return Queue.New
    case CardType.Review:
      return Queue.Review
    default:
      return c.due > 1e11 ? Queue.Learn : Queue.DayLearn
  }
}
