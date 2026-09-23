import { describe, expect, it } from 'vitest'
import { answer, fuzz, previewIntervals, activeQueue } from './scheduler'
import { dayNumber, dayStart, schedTime } from './time'
import { DEFAULT_OPTIONS } from '../db/defaults'
import { CardType, Queue, type Card, type DeckOptions } from '../db/types'

const opts: DeckOptions = { ...DEFAULT_OPTIONS, id: 1 }
const t = schedTime(new Date(2026, 5, 10, 12, 0).getTime())

function newCard(over: Partial<Card> = {}): Card {
  return {
    id: 1, noteId: 1, deckId: 1, ord: 0, type: CardType.New, queue: Queue.New, due: 1, ivl: 0, ease: 0,
    reps: 0, lapses: 0, left: 0, flags: 0, createdAt: 0, modifiedAt: 0, ...over,
  }
}
const reviewCard = (ivl: number, over: Partial<Card> = {}) =>
  newCard({ type: CardType.Review, queue: Queue.Review, ivl, ease: 2500, due: t.today, reps: 5, ...over })

describe('обучение новых карточек', () => {
  it('Good на новой -> второй шаг (10 мин)', () => {
    const { card } = answer(newCard(), 3, opts, t, null)
    expect(card.type).toBe(CardType.Learn)
    expect(card.queue).toBe(Queue.Learn)
    expect(card.due).toBe(t.now + 10 * 60_000)
    expect(card.left).toBe(1)
    expect(card.ease).toBe(2500)
  })
  it('Again -> 1 мин, Hard -> среднее первых шагов', () => {
    expect(answer(newCard(), 1, opts, t, null).card.due).toBe(t.now + 60_000)
    expect(answer(newCard(), 2, opts, t, null).card.due).toBe(t.now + 5.5 * 60_000)
  })
  it('Good на последнем шаге -> выпуск с интервалом 1 день', () => {
    const step1 = answer(newCard(), 3, opts, t, null).card
    const { card } = answer(step1, 3, opts, t, null)
    expect(card.type).toBe(CardType.Review)
    expect(card.queue).toBe(Queue.Review)
    expect(card.ivl).toBe(1)
    expect(card.due).toBe(t.today + 1)
  })
  it('Easy -> сразу 4 дня', () => {
    const { card } = answer(newCard(), 4, opts, t, null)
    expect(card.ivl).toBe(4)
    expect(card.queue).toBe(Queue.Review)
  })
  it('шаг длиной в день -> очередь DayLearn', () => {
    const o = { ...opts, learnSteps: [10, 1440] }
    const { card } = answer(newCard(), 3, o, t, null)
    expect(card.queue).toBe(Queue.DayLearn)
    expect(card.due).toBe(t.today + 1)
  })
  it('без шагов — сразу выпуск', () => {
    const { card } = answer(newCard(), 1, { ...opts, learnSteps: [] }, t, null)
    expect(card.queue).toBe(Queue.Review)
  })
})

describe('повторения', () => {
  it('интервалы Hard/Good/Easy', () => {
    expect(answer(reviewCard(10), 2, opts, t, null).card.ivl).toBe(12)
    expect(answer(reviewCard(10), 3, opts, t, null).card.ivl).toBe(25)
    expect(answer(reviewCard(10), 4, opts, t, null).card.ivl).toBe(33)
  })
  it('лёгкость меняется', () => {
    expect(answer(reviewCard(10), 2, opts, t, null).card.ease).toBe(2350)
    expect(answer(reviewCard(10), 3, opts, t, null).card.ease).toBe(2500)
    expect(answer(reviewCard(10), 4, opts, t, null).card.ease).toBe(2650)
  })
  it('просрочка увеличивает интервал Good', () => {
    const late = reviewCard(10, { due: t.today - 4 })
    expect(answer(late, 3, opts, t, null).card.ivl).toBe(30)
  })
  it('интервал не превышает максимум', () => {
    expect(answer(reviewCard(30000), 4, opts, t, null).card.ivl).toBe(opts.maxIvl)
  })
  it('ошибка -> переобучение', () => {
    const { card, logType } = answer(reviewCard(10), 1, opts, t, null)
    expect(logType).toBe(1)
    expect(card.type).toBe(CardType.Relearn)
    expect(card.queue).toBe(Queue.Learn)
    expect(card.lapses).toBe(1)
    expect(card.ease).toBe(2300)
    expect(card.ivl).toBe(1)
    expect(card.due).toBe(t.now + 10 * 60_000)
    const back = answer(card, 3, opts, t, null).card
    expect(back.type).toBe(CardType.Review)
    expect(back.ivl).toBe(1)
  })
  it('лёгкость не ниже 130%', () => {
    expect(answer(reviewCard(10, { ease: 1350 }), 1, opts, t, null).card.ease).toBe(1300)
  })
  it('пиявка на 8-й ошибке', () => {
    expect(answer(reviewCard(10, { lapses: 6 }), 1, opts, t, null).leech).toBe(false)
    expect(answer(reviewCard(10, { lapses: 7 }), 1, opts, t, null).leech).toBe(true)
    const s = answer(reviewCard(10, { lapses: 7 }), 1, { ...opts, leechAction: 'suspend' }, t, null)
    expect(s.card.queue).toBe(Queue.Suspended)
  })
})

describe('fuzz и подписи', () => {
  it('fuzz в пределах диапазона', () => {
    for (let i = 0; i < 50; i++) {
      const v = fuzz(100, 36500, Math.random)
      expect(v).toBeGreaterThanOrEqual(93)
      expect(v).toBeLessThanOrEqual(107)
    }
    expect(fuzz(2, 36500, Math.random)).toBe(2)
  })
  it('подписи кнопок для новой карточки', () => {
    const p = previewIntervals(newCard(), opts, t)
    expect(p[1]).toBe(60)
    expect(p[3]).toBe(600)
    expect(p[4]).toBe(4 * 86400)
  })
  it('восстановление очереди', () => {
    expect(activeQueue({ type: CardType.Learn, due: Date.now() })).toBe(Queue.Learn)
    expect(activeQueue({ type: CardType.Learn, due: 20000 })).toBe(Queue.DayLearn)
    expect(activeQueue({ type: CardType.Review, due: 1 })).toBe(Queue.Review)
  })
})

describe('дни', () => {
  it('до 4 утра — ещё вчерашний день', () => {
    const late = new Date(2026, 5, 11, 2, 0).getTime()
    const morning = new Date(2026, 5, 11, 5, 0).getTime()
    expect(dayNumber(late)).toBe(dayNumber(new Date(2026, 5, 10, 20, 0).getTime()))
    expect(dayNumber(morning)).toBe(dayNumber(late) + 1)
    expect(dayStart(dayNumber(morning))).toBe(new Date(2026, 5, 11, 4, 0).getTime())
  })
})
