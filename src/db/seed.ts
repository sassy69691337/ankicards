import { db } from './db'
import { DEFAULT_DECK_NAME, DEFAULT_NOTE_TYPES, DEFAULT_OPTIONS, NO_REVERSE_FIELD, WORD_REVERSE_QFMT, WORD_TYPE_NAME } from './defaults'

/** Создаёт пресет опций, встроенные типы заметок и колоду по умолчанию */
export async function ensureSeed(): Promise<void> {
  await db.transaction('rw', db.deckOptions, db.noteTypes, db.decks, async () => {
    if ((await db.deckOptions.count()) === 0) await db.deckOptions.add({ ...DEFAULT_OPTIONS, id: 1 })
    if ((await db.noteTypes.count()) === 0) {
      const now = Date.now()
      await db.noteTypes.bulkAdd(DEFAULT_NOTE_TYPES.map((nt, i) => ({ ...nt, createdAt: now + i })))
    }
    if ((await db.decks.count()) === 0) {
      await db.decks.add({ name: DEFAULT_DECK_NAME, optionsId: 1, createdAt: Date.now() })
    }
    await addReverseFlag()
  })
}

/**
 * Встроенный тип «Слово (+ обратная)» получает поле-флаг «Без обратной».
 * Пустое поле (в том числе у всех прежних заметок) — обратная карточка создаётся, как раньше.
 * Уже созданные карточки, интервалы и история не меняются
 */
async function addReverseFlag() {
  const word = await db.noteTypes.where('name').equals(WORD_TYPE_NAME).first()
  if (
    !word ||
    word.kind !== 'standard' ||
    word.fields.join('|') !== 'Слово|Перевод|Пример' ||
    word.templates.length !== 2 ||
    word.templates[1].qfmt.trim() !== '{{Перевод}}'
  ) {
    return
  }
  await db.noteTypes.update(word.id, {
    fields: [...word.fields, NO_REVERSE_FIELD],
    templates: word.templates.map((t, i) => (i === 1 ? { ...t, qfmt: WORD_REVERSE_QFMT } : t)),
  })
}
