// Модель данных близка к Anki, чтобы импорт APKG был прямым.

export const CardType = { New: 0, Learn: 1, Review: 2, Relearn: 3 } as const
export type CardType = (typeof CardType)[keyof typeof CardType]

export const Queue = {
  ManualBuried: -3,
  SiblingBuried: -2,
  Suspended: -1,
  New: 0,
  /** Внутридневное обучение, due — timestamp в мс */
  Learn: 1,
  /** Повторение, due — номер дня */
  Review: 2,
  /** Обучение с шагом ≥ 1 дня, due — номер дня */
  DayLearn: 3,
} as const
export type Queue = (typeof Queue)[keyof typeof Queue]

export interface TtsSettings {
  lang: string
  field: string
  auto: boolean
}

export interface Deck {
  id: number
  name: string
  optionsId: number
  createdAt: number
  tts?: TtsSettings
}

export interface DeckOptions {
  id: number
  name: string
  newPerDay: number
  revPerDay: number
  /** Шаги в минутах */
  learnSteps: number[]
  relearnSteps: number[]
  graduatingIvl: number
  easyIvl: number
  /** В промилле: 2500 = 250% */
  startingEase: number
  easyBonus: number
  hardFactor: number
  intervalModifier: number
  maxIvl: number
  minIvl: number
  lapseMult: number
  leechThreshold: number
  leechAction: 'tag' | 'suspend'
  buryNew: boolean
  buryReview: boolean
  autoplayAudio: boolean
}

export interface CardTemplate {
  name: string
  qfmt: string
  afmt: string
}

export interface NoteType {
  id: number
  name: string
  kind: 'standard' | 'cloze'
  fields: string[]
  templates: CardTemplate[]
  css: string
  createdAt: number
  /** id типа в Anki, если импортирован из APKG */
  ankiId?: number
}

export interface Note {
  id: number
  guid: string
  noteTypeId: number
  fields: string[]
  tags: string[]
  /** Первое поле без HTML в нижнем регистре: поиск дублей */
  sortText: string
  createdAt: number
  modifiedAt: number
}

export interface Card {
  id: number
  noteId: number
  deckId: number
  ord: number
  type: CardType
  queue: Queue
  due: number
  ivl: number
  /** В промилле, 0 у новых карточек */
  ease: number
  reps: number
  lapses: number
  /** Сколько шагов обучения осталось */
  left: number
  flags: number
  createdAt: number
  modifiedAt: number
}

export interface RevLog {
  id: number
  cardId: number
  deckId: number
  time: number
  rating: number
  /** > 0 — дни, < 0 — секунды (как в Anki) */
  ivl: number
  lastIvl: number
  ease: number
  duration: number
  /** 0 — обучение, 1 — повторение, 2 — переобучение */
  type: 0 | 1 | 2
  isNew: boolean
}

export interface MediaFile {
  name: string
  blob: Blob
}

export interface ConfigEntry {
  key: string
  value: unknown
}
