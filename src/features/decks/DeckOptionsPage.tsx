import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, Plus, Volume2, X } from 'lucide-react'
import { db } from '../../db/db'
import { leafName, optionsFor } from '../../db/collection'
import { DEFAULT_OPTIONS } from '../../db/defaults'
import type { DeckOptions, TtsSettings } from '../../db/types'
import { parseSteps, plural } from '../../core/format'
import { TTS_LANGS, speak, ttsSupported } from '../../core/tts'
import { PageBody, PageHeader, StickyActions } from '../../ui/PageHeader'
import { ListGroup } from '../../ui/List'
import { FieldError, FormRow, NumberInput, Select, Switch, inputCls } from '../../ui/forms'
import { Button } from '../../ui/Button'
import { LogoMark } from '../../ui/Logo'
import { choiceDialog, confirmDialog } from '../../ui/dialogs'
import { toast } from '../../ui/toast'
import { cn } from '../../ui/cn'

const decksWord = (n: number) => plural(n, ['колоде', 'колодах', 'колодах'])

export default function DeckOptionsPage() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const data = useLiveQuery(async () => {
    const deck = await db.decks.get(id)
    if (!deck) return null
    const [opts, all, noteTypes] = await Promise.all([optionsFor(deck), db.decks.toArray(), db.noteTypes.toArray()])
    const fields = [...new Set(noteTypes.flatMap((n) => n.fields))]
    const users = all.filter((d) => d.optionsId === opts.id).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    return { deck, opts, users, fields }
  }, [id])

  const [o, setO] = useState<DeckOptions | null>(null)
  const [tts, setTts] = useState<TtsSettings>({ lang: '', field: '', auto: true })
  const [showUsers, setShowUsers] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!data || o) return
    setO(data.opts)
    setTts(data.deck.tts ?? { lang: '', field: data.fields[0] ?? '', auto: true })
  }, [data, o])

  if (data === null) return <PageHeader title="Колода не найдена" back="/" />
  if (!data || !o) return <PageHeader title="Настройки колоды" back={`/deck/${id}`} />

  const shared = data.users.length
  const set = (patch: Partial<DeckOptions>) => setO({ ...o, ...patch })

  async function save(scope: 'shared' | 'own') {
    if (!data || !o || busy) return
    if (scope === 'shared' && shared > 1) {
      const ok = await confirmDialog({
        title: `Применить ко всем ${shared} колодам?`,
        message: `Профиль «${o.name}» общий: ${data.users.map((d) => leafName(d.name)).join(', ')}. Изменения затронут все эти колоды.`,
        confirmText: `Применить к ${shared} ${plural(shared, ['колоде', 'колодам', 'колодам'])}`,
      })
      if (!ok) return
    }
    setBusy(true)
    try {
      await db.transaction('rw', db.deckOptions, db.decks, async () => {
        if (scope === 'own') {
          // Копия текущих значений формы привязывается только к этой колоде
          const copy: Partial<DeckOptions> = { ...o, name: data.deck.name }
          delete copy.id
          const newId = await db.deckOptions.add(copy as Omit<DeckOptions, 'id'>)
          await db.decks.update(data.deck.id, { optionsId: newId, tts })
        } else {
          await db.deckOptions.put(o)
          await db.decks.update(data.deck.id, { tts })
        }
      })
      toast(scope === 'own' ? 'Создан отдельный профиль для этой колоды' : 'Настройки сохранены')
      nav(`/deck/${id}`)
    } catch (e) {
      toast(`Не сохранено: ${e instanceof Error ? e.message : String(e)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function createOwn() {
    const v = await choiceDialog({
      title: 'Создать отдельный профиль?',
      message: `Текущие значения формы скопируются в новый профиль, который будет использоваться только колодой «${leafName(data!.deck.name)}». Остальные колоды не изменятся.`,
      choices: [{ value: 'own', label: 'Создать отдельный' }],
    })
    if (v) await save('own')
  }

  async function reset() {
    if (!o) return
    const ok = await confirmDialog({ title: 'Сбросить настройки?', message: 'Значения в форме вернутся к стандартным. Изменения применятся только после сохранения.', confirmText: 'Сбросить' })
    if (!ok) return
    setO({ ...DEFAULT_OPTIONS, id: o.id, name: o.name })
  }

  const sample = TTS_LANGS.find((l) => l.code === tts.lang)?.sample ?? 'Hello'

  return (
    <>
      <PageHeader title="Настройки колоды" subtitle={leafName(data.deck.name)} back={`/deck/${id}`} />
      <PageBody>
        <section className="rounded-[24px] bg-surface p-4 ring-1 ring-line/70">
          <div className="flex items-start gap-3.5">
            <span className="grid size-13 shrink-0 place-items-center rounded-[16px] bg-accent-soft text-accent-text" aria-hidden>
              <LogoMark className="size-8" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="break-words text-[17px] font-semibold leading-[22px]">{shared > 1 ? 'Общий профиль' : `Профиль «${o.name}»`}</p>
              {shared > 1 ? (
                <button
                  type="button"
                  aria-expanded={showUsers}
                  onClick={() => setShowUsers(!showUsers)}
                  className="mt-0.5 inline-flex min-h-11 items-center gap-1 text-left text-[15px] text-accent-text underline-offset-2 hover:underline"
                >
                  Используется в {shared} {decksWord(shared)}
                  <ChevronDown className={cn('size-4 transition-transform', showUsers && 'rotate-180')} />
                </button>
              ) : (
                <p className="mt-0.5 text-[15px] text-muted">Используется только в этой колоде</p>
              )}
            </div>
          </div>
          {showUsers && shared > 1 && (
            <ul className="mt-3 space-y-1 rounded-[16px] bg-surface-2/70 px-4 py-3 text-[15px]">
              {data.users.map((d) => (
                <li key={d.id} className="break-words">
                  {d.name.split('::').join(' › ')}
                  {d.id === data.deck.id && <span className="text-muted"> — эта колода</span>}
                </li>
              ))}
            </ul>
          )}
          {shared > 1 && (
            <Button variant="soft" className="mt-3 w-full" onClick={() => void createOwn()}>
              Создать отдельный
            </Button>
          )}
        </section>

        <ListGroup title="Лимиты в день">
          <FormRow label="Новых карточек" hint="0–9999; 0 — новые не показываются" htmlFor="o-new">
            <NumberInput id="o-new" value={o.newPerDay} onChange={(v) => set({ newPerDay: v })} max={9999} suffix="шт" />
          </FormRow>
          <FormRow label="Повторений" hint="0–99999" htmlFor="o-rev">
            <NumberInput id="o-rev" value={o.revPerDay} onChange={(v) => set({ revPerDay: v })} max={99999} suffix="шт" />
          </FormRow>
        </ListGroup>

        <ListGroup title="Обучение">
          <FormRow stacked label="Шаги обучения" hint="Когда новая карточка появится снова. Без шагов карточка сразу получает интервал выпуска.">
            <StepsInput label="Шаги обучения" value={o.learnSteps} onChange={(learnSteps) => set({ learnSteps })} />
          </FormRow>
          <FormRow label="Интервал выпуска" hint="после последнего шага" htmlFor="o-grad">
            <NumberInput id="o-grad" value={o.graduatingIvl} onChange={(v) => set({ graduatingIvl: v })} min={1} max={36500} suffix="дн" />
          </FormRow>
          <FormRow label="Интервал «Легко»" hint="для новой карточки" htmlFor="o-easy">
            <NumberInput id="o-easy" value={o.easyIvl} onChange={(v) => set({ easyIvl: v })} min={1} max={36500} suffix="дн" />
          </FormRow>
        </ListGroup>

        <ListGroup title="Повторное обучение">
          <FormRow stacked label="Шаги переучивания" hint="Для забытых карточек. Без шагов карточка сразу получает новый интервал.">
            <StepsInput label="Шаги переучивания" value={o.relearnSteps} onChange={(relearnSteps) => set({ relearnSteps })} />
          </FormRow>
          <FormRow label="Новый интервал" hint="доля от прежнего; 0 — минимальный интервал" htmlFor="o-lapse">
            <NumberInput id="o-lapse" value={Math.round(o.lapseMult * 100)} onChange={(v) => set({ lapseMult: v / 100 })} max={100} suffix="%" />
          </FormRow>
          <FormRow label="Минимальный интервал" htmlFor="o-min">
            <NumberInput id="o-min" value={o.minIvl} onChange={(v) => set({ minIvl: v })} min={1} max={36500} suffix="дн" />
          </FormRow>
        </ListGroup>

        <section>
          <button
            type="button"
            aria-expanded={advanced}
            onClick={() => setAdvanced(!advanced)}
            className="flex min-h-14 w-full items-center justify-between gap-3 rounded-[24px] bg-surface px-4 text-left text-[17px] font-semibold ring-1 ring-line/70 transition hover:bg-surface-2/60"
          >
            Расширенные настройки
            <ChevronDown className={cn('size-5 shrink-0 text-muted transition-transform', advanced && 'rotate-180')} />
          </button>
          {advanced && (
            <div className="mt-4 space-y-6">
              <ListGroup>
                <FormRow label="Начальная лёгкость" hint="131–500%" htmlFor="o-ease">
                  <NumberInput id="o-ease" value={o.startingEase / 10} onChange={(v) => set({ startingEase: Math.round(v * 10) })} min={131} max={500} suffix="%" />
                </FormRow>
                <FormRow label="Максимальный интервал" htmlFor="o-max">
                  <NumberInput id="o-max" value={o.maxIvl} onChange={(v) => set({ maxIvl: v })} min={1} max={36500} suffix="дн" />
                </FormRow>
                <FormRow label="Бонус «Легко»" hint="100–500%" htmlFor="o-bonus">
                  <NumberInput id="o-bonus" value={Math.round(o.easyBonus * 100)} onChange={(v) => set({ easyBonus: v / 100 })} min={100} max={500} suffix="%" />
                </FormRow>
                <FormRow label="Множитель «Трудно»" hint="50–200%" htmlFor="o-hard">
                  <NumberInput id="o-hard" value={Math.round(o.hardFactor * 100)} onChange={(v) => set({ hardFactor: v / 100 })} min={50} max={200} suffix="%" />
                </FormRow>
                <FormRow label="Модификатор интервала" hint="10–500%" htmlFor="o-mod">
                  <NumberInput id="o-mod" value={Math.round(o.intervalModifier * 100)} onChange={(v) => set({ intervalModifier: v / 100 })} min={10} max={500} suffix="%" />
                </FormRow>
              </ListGroup>

              <ListGroup title="Трудные карточки" footer="В Anki такие карточки называют «пиявками»: их часто забывают. 0 — не отмечать.">
                <FormRow label="Порог" hint="число ошибок" htmlFor="o-leech">
                  <NumberInput id="o-leech" value={o.leechThreshold} onChange={(v) => set({ leechThreshold: v })} max={99} suffix="раз" />
                </FormRow>
                <FormRow label="Действие" htmlFor="o-leech-act">
                  <Select id="o-leech-act" value={o.leechAction} onChange={(e) => set({ leechAction: e.target.value as DeckOptions['leechAction'] })} className="w-44">
                    <option value="tag">Только метка</option>
                    <option value="suspend">Приостановить</option>
                  </Select>
                </FormRow>
              </ListGroup>

              <ListGroup title="Связанные карточки" footer="Например, прямая и обратная карточки одного слова не покажутся в один день.">
                <FormRow label="Откладывать новые" htmlFor="o-bury-new">
                  <Switch id="o-bury-new" checked={o.buryNew} onChange={(v) => set({ buryNew: v })} />
                </FormRow>
                <FormRow label="Откладывать повторения" htmlFor="o-bury-rev">
                  <Switch id="o-bury-rev" checked={o.buryReview} onChange={(v) => set({ buryReview: v })} />
                </FormRow>
              </ListGroup>
            </div>
          )}
        </section>

        <ListGroup
          title="Звук и озвучка"
          footer={ttsSupported ? 'Используется голос системы. Поле озвучивается на той стороне карточки, где оно появляется.' : 'Браузер не поддерживает синтез речи.'}
        >
          <FormRow label="Автовоспроизведение аудио" htmlFor="o-autoplay">
            <Switch id="o-autoplay" checked={o.autoplayAudio} onChange={(v) => set({ autoplayAudio: v })} />
          </FormRow>
          <FormRow stacked label="Язык озвучки" htmlFor="o-tts-lang">
            <Select id="o-tts-lang" value={tts.lang} onChange={(e) => setTts({ ...tts, lang: e.target.value })}>
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
              <FormRow stacked label="Озвучивать поле" htmlFor="o-tts-field">
                <Select id="o-tts-field" value={tts.field} onChange={(e) => setTts({ ...tts, field: e.target.value })}>
                  {data.fields.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </Select>
              </FormRow>
              <FormRow label="Озвучивать автоматически" htmlFor="o-tts-auto">
                <Switch id="o-tts-auto" checked={tts.auto} onChange={(v) => setTts({ ...tts, auto: v })} />
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

        <Button variant="ghost" className="w-full text-muted" onClick={() => void reset()}>
          Сбросить к стандартным
        </Button>

        <StickyActions>
          <Button size="lg" className="w-full" loading={busy} onClick={() => void save('shared')}>
            {shared > 1 ? `Сохранить для всех (${shared})` : 'Сохранить'}
          </Button>
        </StickyActions>
      </PageBody>
    </>
  )
}

/** Минуты → «30 с», «10 мин», «1 ч», «2 дн» */
function stepLabel(m: number): string {
  if (m >= 1440 && m % 1440 === 0) return `${m / 1440} дн`
  if (m >= 60 && m % 60 === 0) return `${m / 60} ч`
  if (m < 1) return `${Math.round(m * 60)} с`
  return `${+m.toFixed(2)} мин`
}

/**
 * Шаги чипами. Ввод в прежнем формате: 30s 1m 10m 1h 1d (или с, м, ч, д), можно несколько через пробел.
 * Число без единицы — минуты, как и раньше. Неверный ввод не применяется
 */
function StepsInput({ value, onChange, label }: { value: number[]; onChange: (v: number[]) => void; label: string }) {
  const [text, setText] = useState('')
  const [error, setError] = useState(false)
  const inputId = `steps-${label}`

  const add = () => {
    if (!text.trim()) return
    const parsed = parseSteps(text)
    if (!parsed) {
      setError(true)
      return
    }
    onChange([...value, ...parsed])
    setText('')
    setError(false)
  }

  return (
    <div>
      {value.length > 0 ? (
        <ul className="mb-2.5 flex flex-wrap gap-2" aria-label={label}>
          {value.map((m, i) => (
            <li key={i} className="inline-flex min-h-10 items-center rounded-full bg-surface-2 pl-3.5 text-[15px] font-medium tabular-nums ring-1 ring-inset ring-line">
              {stepLabel(m)}
              <button
                type="button"
                aria-label={`Удалить шаг ${stepLabel(m)}`}
                onClick={() => onChange(value.filter((_, k) => k !== i))}
                className="grid size-10 place-items-center rounded-full text-muted hover:text-fg"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-2.5 text-[15px] text-muted">Шагов нет</p>
      )}
      <div className="flex gap-2">
        <input
          id={inputId}
          value={text}
          aria-label={`Добавить: ${label}`}
          aria-invalid={error}
          placeholder="например, 10m или 1h 1d"
          autoCapitalize="off"
          autoCorrect="off"
          enterKeyHint="done"
          onChange={(e) => {
            setText(e.target.value)
            setError(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          className={cn(inputCls, 'min-h-12 flex-1 py-2.5')}
        />
        <Button variant="soft" className="shrink-0" onClick={add} disabled={!text.trim()}>
          <Plus className="size-5" />
          Шаг
        </Button>
      </div>
      {error ? (
        <FieldError>Неверный формат. Примеры: 30s, 10m, 1h, 1d</FieldError>
      ) : (
        <p className="mt-1.5 text-sm text-muted">Единицы: s — секунды, m — минуты, h — часы, d — дни</p>
      )}
    </div>
  )
}
