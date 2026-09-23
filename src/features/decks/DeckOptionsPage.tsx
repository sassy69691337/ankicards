import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Volume2 } from 'lucide-react'
import { db } from '../../db/db'
import { leafName, optionsFor } from '../../db/collection'
import { DEFAULT_OPTIONS } from '../../db/defaults'
import type { DeckOptions, TtsSettings } from '../../db/types'
import { formatSteps, parseSteps } from '../../core/format'
import { TTS_LANGS, speak, ttsSupported } from '../../core/tts'
import { PageBody, PageHeader } from '../../ui/PageHeader'
import { ListGroup } from '../../ui/List'
import { FormRow, Input, NumberInput, Select, Switch } from '../../ui/forms'
import { Button } from '../../ui/Button'
import { confirmDialog } from '../../ui/dialogs'
import { toast } from '../../ui/toast'
import { cn } from '../../ui/cn'

export default function DeckOptionsPage() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const data = useLiveQuery(async () => {
    const deck = await db.decks.get(id)
    if (!deck) return null
    const [opts, users, noteTypes] = await Promise.all([
      optionsFor(deck),
      db.decks.toArray(),
      db.noteTypes.toArray(),
    ])
    const fields = [...new Set(noteTypes.flatMap((n) => n.fields))]
    return { deck, opts, shared: users.filter((d) => d.optionsId === opts.id).length, fields }
  }, [id])

  const [o, setO] = useState<DeckOptions | null>(null)
  const [learn, setLearn] = useState('')
  const [relearn, setRelearn] = useState('')
  const [tts, setTts] = useState<TtsSettings>({ lang: '', field: '', auto: true })

  useEffect(() => {
    if (!data || o) return
    setO(data.opts)
    setLearn(formatSteps(data.opts.learnSteps))
    setRelearn(formatSteps(data.opts.relearnSteps))
    setTts(data.deck.tts ?? { lang: '', field: data.fields[0] ?? '', auto: true })
  }, [data, o])

  if (data === null) return <PageHeader title="Колода не найдена" back="/" />
  if (!data || !o) return <PageHeader title="Настройки" back={`/deck/${id}`} />

  const set = (patch: Partial<DeckOptions>) => setO({ ...o, ...patch })
  const learnOk = parseSteps(learn) !== null
  const relearnOk = parseSteps(relearn) !== null

  async function save(scope: 'shared' | 'own') {
    if (!data || !o) return
    const learnSteps = parseSteps(learn)
    const relearnSteps = parseSteps(relearn)
    if (!learnSteps || !relearnSteps) {
      toast('Неверный формат шагов. Пример: 1m 10m 1d', 'error')
      return
    }
    const next = { ...o, learnSteps, relearnSteps }
    await db.transaction('rw', db.deckOptions, db.decks, async () => {
      if (scope === 'own') {
        const copy: Partial<DeckOptions> = { ...next, name: data.deck.name }
        delete copy.id
        const newId = await db.deckOptions.add(copy as Omit<DeckOptions, 'id'>)
        await db.decks.update(data.deck.id, { optionsId: newId, tts })
      } else {
        await db.deckOptions.put(next)
        await db.decks.update(data.deck.id, { tts })
      }
    })
    toast('Настройки сохранены')
    nav(`/deck/${id}`)
  }

  async function reset() {
    if (!o) return
    const ok = await confirmDialog({ title: 'Сбросить настройки?', message: 'Все значения вернутся к стандартным.', confirmText: 'Сбросить' })
    if (!ok) return
    const next = { ...DEFAULT_OPTIONS, id: o.id, name: o.name }
    setO(next)
    setLearn(formatSteps(next.learnSteps))
    setRelearn(formatSteps(next.relearnSteps))
  }

  const sample = TTS_LANGS.find((l) => l.code === tts.lang)?.sample ?? 'Hello'

  return (
    <>
      <PageHeader title="Настройки колоды" subtitle={leafName(data.deck.name)} back={`/deck/${id}`} />
      <PageBody>
        {data.shared > 1 && (
          <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            Эти настройки общие для {data.shared} колод. Изменения применятся ко всем, либо сохраните отдельную копию для этой колоды.
          </p>
        )}

        <ListGroup title="Лимиты в день">
          <FormRow label="Новых карточек">
            <NumberInput value={o.newPerDay} onChange={(v) => set({ newPerDay: Math.round(v) })} max={9999} />
          </FormRow>
          <FormRow label="Повторений">
            <NumberInput value={o.revPerDay} onChange={(v) => set({ revPerDay: Math.round(v) })} max={99999} />
          </FormRow>
        </ListGroup>

        <ListGroup title="Новые карточки" footer="Шаги: 30s, 1m, 10m, 1h, 1d — через пробел.">
          <FormRow label="Шаги обучения">
            <Input value={learn} onChange={(e) => setLearn(e.target.value)} className={cn('w-32 py-2 text-right', !learnOk && 'border-red-500')} />
          </FormRow>
          <FormRow label="Интервал выпуска" hint="после последнего шага">
            <NumberInput value={o.graduatingIvl} onChange={(v) => set({ graduatingIvl: Math.round(v) })} min={1} suffix="д" />
          </FormRow>
          <FormRow label="Интервал «Легко»">
            <NumberInput value={o.easyIvl} onChange={(v) => set({ easyIvl: Math.round(v) })} min={1} suffix="д" />
          </FormRow>
          <FormRow label="Начальная лёгкость">
            <NumberInput value={o.startingEase / 10} onChange={(v) => set({ startingEase: Math.round(v * 10) })} min={131} max={500} suffix="%" />
          </FormRow>
        </ListGroup>

        <ListGroup title="Забытые карточки">
          <FormRow label="Шаги переобучения">
            <Input value={relearn} onChange={(e) => setRelearn(e.target.value)} className={cn('w-32 py-2 text-right', !relearnOk && 'border-red-500')} />
          </FormRow>
          <FormRow label="Новый интервал" hint="доля от прежнего">
            <NumberInput value={Math.round(o.lapseMult * 100)} onChange={(v) => set({ lapseMult: v / 100 })} max={100} suffix="%" />
          </FormRow>
          <FormRow label="Минимальный интервал">
            <NumberInput value={o.minIvl} onChange={(v) => set({ minIvl: Math.round(v) })} min={1} suffix="д" />
          </FormRow>
          <FormRow label="Порог «пиявки»" hint="число ошибок">
            <NumberInput value={o.leechThreshold} onChange={(v) => set({ leechThreshold: Math.round(v) })} max={99} />
          </FormRow>
          <FormRow label="Действие с пиявкой">
            <Select value={o.leechAction} onChange={(e) => set({ leechAction: e.target.value as DeckOptions['leechAction'] })} className="w-40">
              <option value="tag">Только метка</option>
              <option value="suspend">Приостановить</option>
            </Select>
          </FormRow>
        </ListGroup>

        <ListGroup title="Повторения">
          <FormRow label="Максимальный интервал">
            <NumberInput value={o.maxIvl} onChange={(v) => set({ maxIvl: Math.round(v) })} min={1} max={36500} suffix="д" />
          </FormRow>
          <FormRow label="Бонус «Легко»">
            <NumberInput value={Math.round(o.easyBonus * 100)} onChange={(v) => set({ easyBonus: v / 100 })} min={100} max={500} suffix="%" />
          </FormRow>
          <FormRow label="Множитель «Трудно»">
            <NumberInput value={Math.round(o.hardFactor * 100)} onChange={(v) => set({ hardFactor: v / 100 })} min={50} max={200} suffix="%" />
          </FormRow>
          <FormRow label="Модификатор интервала">
            <NumberInput value={Math.round(o.intervalModifier * 100)} onChange={(v) => set({ intervalModifier: v / 100 })} min={10} max={500} suffix="%" />
          </FormRow>
        </ListGroup>

        <ListGroup title="Связанные карточки" footer="Например, прямая и обратная карточки одного слова не покажутся в один день.">
          <FormRow label="Откладывать новые">
            <Switch label="Откладывать новые" checked={o.buryNew} onChange={(v) => set({ buryNew: v })} />
          </FormRow>
          <FormRow label="Откладывать повторения">
            <Switch label="Откладывать повторения" checked={o.buryReview} onChange={(v) => set({ buryReview: v })} />
          </FormRow>
        </ListGroup>

        <ListGroup title="Звук">
          <FormRow label="Автовоспроизведение аудио">
            <Switch label="Автовоспроизведение" checked={o.autoplayAudio} onChange={(v) => set({ autoplayAudio: v })} />
          </FormRow>
        </ListGroup>

        <ListGroup
          title="Озвучка (TTS)"
          footer={ttsSupported ? 'Используется голос системы. Поле озвучивается на той стороне карточки, где оно появляется.' : 'Браузер не поддерживает синтез речи.'}
        >
          <FormRow label="Язык">
            <Select value={tts.lang} onChange={(e) => setTts({ ...tts, lang: e.target.value })} className="w-52">
              <option value="">Выключено</option>
              {TTS_LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </Select>
          </FormRow>
          {tts.lang && (
            <>
              <FormRow label="Поле">
                <Select value={tts.field} onChange={(e) => setTts({ ...tts, field: e.target.value })} className="w-52">
                  {data.fields.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </Select>
              </FormRow>
              <FormRow label="Озвучивать автоматически">
                <Switch label="Автоматически" checked={tts.auto} onChange={(v) => setTts({ ...tts, auto: v })} />
              </FormRow>
              <FormRow label="Проверить голос">
                <Button size="sm" variant="soft" onClick={() => speak(sample, tts.lang)}>
                  <Volume2 className="size-4" />
                  Прослушать
                </Button>
              </FormRow>
            </>
          )}
        </ListGroup>

        <div className="space-y-2 pt-2">
          <Button size="lg" className="w-full" disabled={!learnOk || !relearnOk} onClick={() => void save('shared')}>
            {data.shared > 1 ? `Сохранить для всех (${data.shared})` : 'Сохранить'}
          </Button>
          {data.shared > 1 && (
            <Button size="lg" variant="secondary" className="w-full" disabled={!learnOk || !relearnOk} onClick={() => void save('own')}>
              Только для этой колоды
            </Button>
          )}
          <Button variant="ghost" className="w-full text-muted" onClick={() => void reset()}>
            Сбросить к стандартным
          </Button>
        </div>
      </PageBody>
    </>
  )
}
