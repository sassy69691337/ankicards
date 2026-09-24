import { cardStatusKey } from '../../db/collection'
import type { Card, NoteType } from '../../db/types'
import { schedTime } from '../../core/time'
import { formatDay } from '../../core/format'
import type { BadgeTone } from '../../ui/List'

export function cardStatus(c: Card): { label: string; tone: BadgeTone } {
  switch (cardStatusKey(c)) {
    case 'suspended':
      return { label: 'Приостановлена', tone: 'outline' }
    case 'buried':
      return { label: 'Отложена', tone: 'outline' }
    case 'new':
      return { label: 'Новая', tone: 'neutral' }
    case 'learn':
      return { label: 'Изучается', tone: 'warning' }
    default: {
      const days = c.due - schedTime().today
      return { label: days <= 0 ? 'Повторить сегодня' : `Повтор ${formatDay(c.due)}`, tone: 'success' }
    }
  }
}

/** Название карточки: шаблон («Слово → перевод») или номер пропуска */
export const cardName = (nt: Pick<NoteType, 'kind' | 'templates'> | undefined, ord: number) =>
  nt?.kind === 'cloze' ? `Пропуск ${ord + 1}` : (nt?.templates[ord]?.name ?? `Карточка ${ord + 1}`)
