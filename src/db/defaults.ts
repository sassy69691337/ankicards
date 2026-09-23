import type { CardTemplate, DeckOptions, NoteType } from './types'

export const DEFAULT_DECK_NAME = 'По умолчанию'

export const DEFAULT_OPTIONS: Omit<DeckOptions, 'id'> = {
  name: 'По умолчанию',
  newPerDay: 20,
  revPerDay: 200,
  learnSteps: [1, 10],
  relearnSteps: [10],
  graduatingIvl: 1,
  easyIvl: 4,
  startingEase: 2500,
  easyBonus: 1.3,
  hardFactor: 1.2,
  intervalModifier: 1,
  maxIvl: 36500,
  minIvl: 1,
  lapseMult: 0,
  leechThreshold: 8,
  leechAction: 'tag',
  buryNew: true,
  buryReview: true,
  autoplayAudio: true,
}

const CSS = `.card {
  font-size: 26px;
  text-align: center;
}
`

const WORD_CSS = `${CSS}
.example {
  margin-top: 14px;
  font-size: 18px;
  font-style: italic;
  opacity: 0.7;
}
`

const answer = (front: string, back: string): CardTemplate['afmt'] =>
  `${front}\n\n<hr id=answer>\n\n${back}`

export const DEFAULT_NOTE_TYPES: Omit<NoteType, 'id' | 'createdAt'>[] = [
  {
    name: 'Слово (+ обратная)',
    kind: 'standard',
    fields: ['Слово', 'Перевод', 'Пример'],
    templates: [
      {
        name: 'Слово → перевод',
        qfmt: '{{Слово}}',
        afmt: answer('{{FrontSide}}', '{{Перевод}}\n{{#Пример}}<div class="example">{{Пример}}</div>{{/Пример}}'),
      },
      {
        name: 'Перевод → слово',
        qfmt: '{{Перевод}}',
        afmt: answer('{{FrontSide}}', '{{Слово}}\n{{#Пример}}<div class="example">{{Пример}}</div>{{/Пример}}'),
      },
    ],
    css: WORD_CSS,
  },
  {
    name: 'Основная',
    kind: 'standard',
    fields: ['Лицо', 'Оборот'],
    templates: [{ name: 'Карточка 1', qfmt: '{{Лицо}}', afmt: answer('{{FrontSide}}', '{{Оборот}}') }],
    css: CSS,
  },
  {
    name: 'Основная (+ обратная)',
    kind: 'standard',
    fields: ['Лицо', 'Оборот'],
    templates: [
      { name: 'Карточка 1', qfmt: '{{Лицо}}', afmt: answer('{{FrontSide}}', '{{Оборот}}') },
      { name: 'Карточка 2', qfmt: '{{Оборот}}', afmt: answer('{{FrontSide}}', '{{Лицо}}') },
    ],
    css: CSS,
  },
  {
    name: 'Основная (обратная по желанию)',
    kind: 'standard',
    fields: ['Лицо', 'Оборот', 'Добавить обратную'],
    templates: [
      { name: 'Карточка 1', qfmt: '{{Лицо}}', afmt: answer('{{FrontSide}}', '{{Оборот}}') },
      {
        name: 'Карточка 2',
        qfmt: '{{#Добавить обратную}}{{Оборот}}{{/Добавить обратную}}',
        afmt: answer('{{FrontSide}}', '{{Лицо}}'),
      },
    ],
    css: CSS,
  },
  {
    name: 'Ввод ответа',
    kind: 'standard',
    fields: ['Лицо', 'Оборот'],
    templates: [{ name: 'Карточка 1', qfmt: '{{Лицо}}\n\n{{type:Оборот}}', afmt: answer('{{Лицо}}', '{{type:Оборот}}') }],
    css: CSS,
  },
  {
    name: 'Пропуски',
    kind: 'cloze',
    fields: ['Текст', 'Дополнительно'],
    templates: [{ name: 'Пропуск', qfmt: '{{cloze:Текст}}', afmt: '{{cloze:Текст}}<br>\n{{Дополнительно}}' }],
    css: CSS,
  },
]
