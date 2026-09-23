import { describe, expect, it } from 'vitest'
import { cardOrdsForNote, compareAnswer, renderCard, templateUsesField } from './template'
import { DEFAULT_NOTE_TYPES } from '../db/defaults'
import { stripHtml } from './text'

const byName = (n: string) => DEFAULT_NOTE_TYPES.find((t) => t.name === n)!
const basic = byName('Основная')
const reversed = byName('Основная (+ обратная)')
const optional = byName('Основная (обратная по желанию)')
const typeIn = byName('Ввод ответа')
const cloze = byName('Пропуски')
const word = byName('Слово (+ обратная)')

describe('рендер шаблонов', () => {
  it('поля и FrontSide', () => {
    const { q, a } = renderCard(basic, { fields: ['dog', 'собака'], tags: [] }, 0, 'D')
    expect(q).toBe('dog')
    expect(stripHtml(a)).toBe('dog собака')
    expect(a).toContain('<hr id=answer>')
  })
  it('условные секции', () => {
    const withEx = renderCard(word, { fields: ['cat', 'кошка', 'The cat sleeps'], tags: [] }, 0, 'D')
    expect(withEx.a).toContain('class="example"')
    const noEx = renderCard(word, { fields: ['cat', 'кошка', ''], tags: [] }, 0, 'D')
    expect(noEx.a).not.toContain('example')
  })
  it('обратная карточка', () => {
    const { q } = renderCard(reversed, { fields: ['dog', 'собака'], tags: [] }, 1, 'D')
    expect(q).toBe('собака')
  })
  it('пропуски', () => {
    const note = { fields: ['{{c1::Paris}} is the capital of {{c2::France::country}}', ''], tags: [] }
    const c1 = renderCard(cloze, note, 0, 'D')
    expect(stripHtml(c1.q)).toBe('[...] is the capital of France')
    expect(stripHtml(c1.a)).toBe('Paris is the capital of France')
    const c2 = renderCard(cloze, note, 1, 'D')
    expect(stripHtml(c2.q)).toBe('Paris is the capital of [country]')
  })
  it('ввод ответа', () => {
    const note = { fields: ['dog', 'собака'], tags: [] }
    expect(renderCard(typeIn, note, 0, 'D').q).toContain('class="typeans"')
    const ok = renderCard(typeIn, note, 0, 'D', 'собака').a
    expect(ok).toContain('typeGood')
    expect(ok).not.toContain('typeans"')
    const bad = renderCard(typeIn, note, 0, 'D', 'собако').a
    expect(bad).toContain('typeBad')
  })
  it('tts-тег', () => {
    const nt = { ...basic, templates: [{ name: 'c', qfmt: '{{Лицо}}{{tts en_US:Лицо}}', afmt: '' }] }
    const { q } = renderCard(nt, { fields: ['hello', ''], tags: [] }, 0, 'D')
    expect(q).toContain('data-lang="en-US"')
    expect(q).toContain('data-text="hello"')
  })
  it('templateUsesField', () => {
    expect(templateUsesField('{{Слово}}', 'Слово')).toBe(true)
    expect(templateUsesField('{{text:Слово}}', 'Слово')).toBe(true)
    expect(templateUsesField('{{#Слово}}x{{/Слово}}', 'Слово')).toBe(false)
  })
})

describe('генерация карточек', () => {
  it('обычные и обратные', () => {
    expect(cardOrdsForNote(basic, ['a', 'b'])).toEqual([0])
    expect(cardOrdsForNote(basic, ['', 'b'])).toEqual([])
    expect(cardOrdsForNote(reversed, ['a', 'b'])).toEqual([0, 1])
  })
  it('обратная по желанию', () => {
    expect(cardOrdsForNote(optional, ['a', 'b', ''])).toEqual([0])
    expect(cardOrdsForNote(optional, ['a', 'b', 'y'])).toEqual([0, 1])
  })
  it('пропуски', () => {
    expect(cardOrdsForNote(cloze, ['{{c1::a}} {{c3::b}} {{c1::c}}', ''])).toEqual([0, 2])
    expect(cardOrdsForNote(cloze, ['нет пропусков', ''])).toEqual([])
  })
})

describe('сравнение ответа', () => {
  it('совпадение и пусто', () => {
    expect(compareAnswer('abc', 'abc')).toBe('<span class="typeGood">abc</span>')
    expect(compareAnswer('abc', '')).toContain('typeExpected')
  })
  it('частичное совпадение', () => {
    const html = compareAnswer('house', 'hose')
    expect(html).toContain('typeMissed">u<')
  })
})
