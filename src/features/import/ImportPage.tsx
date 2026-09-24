import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { CircleAlert, CircleCheck, FileSpreadsheet, FileUp, Package } from 'lucide-react'
import { db } from '../../db/db'
import { createUniqueDeck, deckNameFromFile } from '../../db/collection'
import type { NoteType } from '../../db/types'
import { cardsWord, errMsg, plural } from '../../core/format'
import { parseTags } from '../../core/text'
import { columnNames, parseText, SEPARATOR_LABELS, type DupMode, type ParsedText } from '../../io/textParse'
import { importTextRows, suggestPlan, type ImportReport, type TextPlan } from '../../io/importText'
import type { ApkgData } from '../../io/apkgRead'
import { importApkg, summarize, type ApkgOptions } from '../../io/importApkg'
import { fileExt, formatBytes } from '../../io/files'
import { PageBody, PageHeader } from '../../ui/PageHeader'
import { ListGroup } from '../../ui/List'
import { Field, FormRow, Input, Segmented, Select, Switch } from '../../ui/forms'
import { Button } from '../../ui/Button'
import { cn } from '../../ui/cn'
import { DeckOptionsList } from '../editor/DeckSelect'
import { requestSync } from '../../sync/cloud'

type Step =
  | { kind: 'pick' }
  | { kind: 'reading'; name: string }
  | { kind: 'text'; file: File; parsed: ParsedText }
  | { kind: 'apkg'; file: File; data: ApkgData }
  | { kind: 'running'; stage: string; done: number; total: number }
  | { kind: 'done'; report: ImportReport }
  | { kind: 'error'; message: string }

const TEXT_EXT = ['csv', 'txt', 'tsv', 'tab']
const NEW_DECK = -2
const APKG_EXT = ['apkg', 'colpkg']

export default function ImportPage() {
  const [params] = useSearchParams()
  const [step, setStep] = useState<Step>({ kind: 'pick' })
  const targetDeck = Number(params.get('deck')) || 0

  const progress = (stage: string, done: number, total: number) => setStep({ kind: 'running', stage, done, total })

  async function onFile(file: File) {
    const ext = fileExt(file.name)
    setStep({ kind: 'reading', name: file.name })
    try {
      const buf = await file.arrayBuffer()
      if (APKG_EXT.includes(ext)) {
        const [{ loadSql }, { readApkg }] = await Promise.all([import('../../io/sql'), import('../../io/apkgRead')])
        const SQL = await loadSql()
        await new Promise((r) => setTimeout(r, 30))
        setStep({ kind: 'apkg', file, data: readApkg(new Uint8Array(buf), SQL) })
      } else if (TEXT_EXT.includes(ext) || file.type.startsWith('text/')) {
        const parsed = parseText(buf)
        if (!parsed.rows.length) throw new Error('В файле нет строк с данными')
        setStep({ kind: 'text', file, parsed })
      } else {
        throw new Error('Поддерживаются файлы .csv, .txt и .apkg')
      }
    } catch (e) {
      setStep({ kind: 'error', message: errMsg(e) })
    }
  }

  const reset = () => setStep({ kind: 'pick' })

  return (
    <>
      <PageHeader title="Импорт" back={targetDeck ? `/deck/${targetDeck}` : '/'} />
      <PageBody>
        {step.kind === 'pick' && <PickFile onFile={onFile} />}
        {step.kind === 'reading' && <Working title={`Читаю ${step.name}…`} />}
        {step.kind === 'error' && (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-2xl bg-red-500/10 p-4 text-red-700 dark:text-red-300">
              <CircleAlert className="size-5 shrink-0" />
              <p className="text-sm">{step.message}</p>
            </div>
            <Button variant="secondary" className="w-full" onClick={reset}>
              Выбрать другой файл
            </Button>
          </div>
        )}
        {step.kind === 'text' && (
          <TextImport
            file={step.file}
            initial={step.parsed}
            targetDeck={targetDeck}
            onCancel={reset}
            onRun={async (parsed, plan, newDeck) => {
              let created: number | null = null
              try {
                if (newDeck !== null) {
                  created = await createUniqueDeck(newDeck)
                  plan = { ...plan, deckId: created }
                }
                const report = await importTextRows(parsed, plan, progress)
                // Ничего не добавилось (всё — повторы) — пустую колоду не оставляем
                if (created && (await db.cards.where('deckId').equals(created).count()) === 0) {
                  await db.decks.delete(created)
                  report.deckIds = report.deckIds.filter((d) => d !== created)
                }
                setStep({ kind: 'done', report })
                void requestSync()
              } catch (e) {
                setStep({ kind: 'error', message: errMsg(e) })
              }
            }}
          />
        )}
        {step.kind === 'apkg' && (
          <ApkgImport
            file={step.file}
            data={step.data}
            onCancel={reset}
            onRun={async (opts) => {
              try {
                const report = await importApkg(step.data, { ...opts, defaultDeckName: deckNameFromFile(step.file.name) }, progress)
                setStep({ kind: 'done', report })
                void requestSync()
              } catch (e) {
                setStep({ kind: 'error', message: errMsg(e) })
              }
            }}
          />
        )}
        {step.kind === 'running' && (
          <Working title={step.stage} value={step.total ? step.done / step.total : undefined} hint="Не закрывайте приложение до окончания импорта" />
        )}
        {step.kind === 'done' && <Done report={step.report} onMore={reset} />}
      </PageBody>
    </>
  )
}

function PickFile({ onFile }: { onFile: (f: File) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          const f = e.dataTransfer.files[0]
          if (f) onFile(f)
        }}
        className={cn(
          'flex w-full flex-col items-center rounded-3xl border-2 border-dashed px-6 py-10 text-center transition',
          drag ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-accent/60',
        )}
      >
        <span className="mb-4 grid size-16 place-items-center rounded-2xl bg-accent-soft text-accent">
          <FileUp className="size-8" />
        </span>
        <span className="text-lg font-semibold">Выберите файл</span>
        <span className="mt-1 text-sm text-muted">CSV, TXT или колода Anki (.apkg)</span>
      </button>
      <input
        ref={input}
        type="file"
        accept=".csv,.txt,.tsv,.apkg,.colpkg,text/csv,text/plain,text/tab-separated-values,application/zip,application/octet-stream"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onFile(f)
        }}
      />
      <ListGroup>
        <Hint icon={<FileSpreadsheet />} title="CSV и TXT">
          Одна строка — одна карточка, колонки через табуляцию, запятую или точку с запятой. Например: <code className="rounded bg-surface-2 px-1">apple;яблоко</code>. Подойдут таблицы из Excel и Google Таблиц, а также
          файлы, экспортированные из Anki.
        </Hint>
        <Hint icon={<Package />} title="Колода Anki (.apkg)">
          Карточки, картинки, звуки и прогресс. В Anki или AnkiDroid при экспорте включите «Поддержка старых версий Anki» (Support older Anki versions).
        </Hint>
      </ListGroup>
    </div>
  )
}

function Hint({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-3.5">
      <span className="mt-0.5 text-accent [&_svg]:size-5">{icon}</span>
      <div>
        <div className="text-[15px] font-medium">{title}</div>
        <p className="mt-0.5 text-sm text-muted">{children}</p>
      </div>
    </div>
  )
}

function Working({ title, value, hint }: { title: string; value?: number; hint?: string }) {
  return (
    <div className="rounded-3xl border border-line bg-surface p-6 text-center">
      <p className="font-semibold">{title}</p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
        {value === undefined ? (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
        ) : (
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.round(value * 100)}%` }} />
        )}
      </div>
      {hint && <p className="mt-3 text-xs text-muted">{hint}</p>}
    </div>
  )
}

function Done({ report, onMore }: { report: ImportReport; onMore: () => void }) {
  const nav = useNavigate()
  const r = report
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center rounded-3xl border border-line bg-surface p-6 text-center">
        <span className="mb-3 grid size-16 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <CircleCheck className="size-9" />
        </span>
        <h2 className="text-xl font-bold">Импорт завершён</h2>
        <p className="mt-1 text-muted">
          Добавлено {r.added} {plural(r.added, ['заметка', 'заметки', 'заметок'])} ({r.cards} {cardsWord(r.cards)})
        </p>
      </div>
      <ListGroup>
        <FormRow label="Добавлено заметок">
          <span className="tabular-nums text-muted">{r.added}</span>
        </FormRow>
        {r.updated > 0 && (
          <FormRow label="Обновлено">
            <span className="tabular-nums text-muted">{r.updated}</span>
          </FormRow>
        )}
        {r.skipped > 0 && (
          <FormRow label="Пропущено (уже были)">
            <span className="tabular-nums text-muted">{r.skipped}</span>
          </FormRow>
        )}
        {r.media > 0 && (
          <FormRow label="Медиафайлов">
            <span className="tabular-nums text-muted">{r.media}</span>
          </FormRow>
        )}
        {r.errors.length > 0 && (
          <FormRow label="С ошибками">
            <span className="tabular-nums text-red-600 dark:text-red-400">{r.errors.length}</span>
          </FormRow>
        )}
      </ListGroup>
      {r.errors.length > 0 && (
        <ListGroup title="Не импортированы" footer={r.errors.length > 20 ? `и ещё ${r.errors.length - 20}` : undefined}>
          {r.errors.slice(0, 20).map((e, i) => (
            <div key={i} className="px-4 py-2.5 text-sm">
              {e.line > 0 && <span className="font-medium">Строка {e.line}: </span>}
              <span className="text-muted">{e.reason}</span>
            </div>
          ))}
        </ListGroup>
      )}
      <div className="space-y-2">
        {r.deckIds.length === 1 ? (
          <Button size="lg" className="w-full" onClick={() => nav(`/deck/${r.deckIds[0]}`)}>
            Открыть колоду
          </Button>
        ) : (
          <Button size="lg" className="w-full" onClick={() => nav('/')}>
            К колодам
          </Button>
        )}
        <Button variant="ghost" className="w-full" onClick={onMore}>
          Импортировать ещё файл
        </Button>
      </div>
    </div>
  )
}

// ---------- CSV / TXT ----------

function TextImport({
  file,
  initial,
  targetDeck,
  onCancel,
  onRun,
}: {
  file: File
  initial: ParsedText
  targetDeck: number
  onCancel: () => void
  onRun: (parsed: ParsedText, plan: TextPlan, newDeck: string | null) => void
}) {
  const noteTypes = useLiveQuery(() => db.noteTypes.toArray(), [])
  const decks = useLiveQuery(() => db.decks.toArray(), [])
  const [parsed, setParsed] = useState(initial)
  const [plan, setPlan] = useState<TextPlan | null>(null)
  const [extraTags, setExtraTags] = useState((initial.headers.tags ?? []).join(' '))
  const names = useMemo(() => columnNames(parsed), [parsed])
  const suggestedName = initial.headers.deck || deckNameFromFile(file.name)
  // По умолчанию — новая колода с именем файла (если импорт запущен не из конкретной колоды)
  const [newDeck, setNewDeck] = useState<string | null>(targetDeck ? null : suggestedName)

  // Начальный план — когда загрузились типы и колоды
  if (!plan && noteTypes && decks) {
    const byName = initial.headers.notetype?.toLowerCase()
    const nt = noteTypes.find((n) => n.name.toLowerCase() === byName) ?? noteTypes[0]
    const deck =
      decks.find((d) => d.id === targetDeck) ??
      decks.find((d) => d.name === initial.headers.deck) ??
      decks.reduce((m, d) => (d.id < m.id ? d : m), decks[0])
    setPlan(suggestPlan(initial, nt, deck.id, names))
    return null
  }
  if (!plan || !noteTypes || !decks) return null

  const nt = noteTypes.find((n) => n.id === plan.noteTypeId) ?? noteTypes[0]
  const set = (patch: Partial<TextPlan>) => setPlan({ ...plan, ...patch })

  const changeType = (next: NoteType) => {
    const fresh = suggestPlan(parsed, next, plan.deckId, names)
    setPlan({ ...fresh, skipFirstRow: plan.skipFirstRow, dupMode: plan.dupMode, html: plan.html, tagsColumn: plan.tagsColumn })
  }
  const changeDelimiter = (d: string) => {
    void file.arrayBuffer().then((buf) => {
      const next = parseText(buf, d)
      setParsed(next)
      setPlan(suggestPlan(next, nt, plan.deckId, columnNames(next)))
    })
  }
  const onDeck = (v: number) => {
    if (v === NEW_DECK) {
      setNewDeck(newDeck ?? suggestedName)
      return
    }
    setNewDeck(null)
    set({ deckId: v })
  }

  const colLabel = (i: number) => {
    const name = names?.[i]
    const sample = (plan.skipFirstRow ? parsed.rows[1] : parsed.rows[0])?.[i] ?? ''
    return `${i + 1}${name ? ` · ${name}` : ''}${sample ? ` — ${sample.slice(0, 24)}` : ''}`
  }
  const columnOptions = (
    <>
      <option value={-1}>— не импортировать</option>
      {Array.from({ length: parsed.columnCount }, (_, i) => (
        <option key={i} value={i}>
          Колонка {colLabel(i)}
        </option>
      ))}
    </>
  )
  const count = parsed.rows.length - (plan.skipFirstRow ? 1 : 0)
  const preview = parsed.rows.slice(0, 6)
  const mappedAny = plan.fieldColumns.some((c) => c !== null)

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="size-8 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{file.name}</div>
            <div className="text-xs text-muted">
              {formatBytes(file.size)} · {parsed.encoding} · {parsed.rows.length} {plural(parsed.rows.length, ['строка', 'строки', 'строк'])}
            </div>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-2 text-muted">
              <tr>
                {Array.from({ length: parsed.columnCount }, (_, i) => (
                  <th key={i} className="whitespace-nowrap px-2.5 py-1.5 font-semibold">
                    {names?.[i] ?? i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {preview.map((row, r) => (
                <tr key={r} className={cn(r === 0 && plan.skipFirstRow && 'text-muted line-through')}>
                  {Array.from({ length: parsed.columnCount }, (_, i) => (
                    <td key={i} className="max-w-40 truncate px-2.5 py-1.5">
                      {row[i] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ListGroup title="Файл">
        <FormRow label="Разделитель">
          <Select value={parsed.delimiter} onChange={(e) => changeDelimiter(e.target.value)} className="w-48">
            {SEPARATOR_LABELS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Первая строка — заголовки">
          <Switch label="Первая строка — заголовки" checked={plan.skipFirstRow} onChange={(v) => set({ skipFirstRow: v })} />
        </FormRow>
        <FormRow label="Поля содержат HTML" hint="Включите для файлов, экспортированных из Anki">
          <Switch label="HTML" checked={plan.html} onChange={(v) => set({ html: v })} />
        </FormRow>
      </ListGroup>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Тип карточек" htmlFor="imp-nt">
          <Select id="imp-nt" value={nt.id} onChange={(e) => changeType(noteTypes.find((n) => n.id === Number(e.target.value))!)}>
            {noteTypes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Колода" htmlFor="imp-deck" hint={plan.deckColumn !== null ? 'Колода берётся из файла; эта — для строк без колоды' : undefined}>
          <Select id="imp-deck" value={newDeck !== null ? NEW_DECK : plan.deckId} onChange={(e) => onDeck(Number(e.target.value))}>
            <option value={NEW_DECK}>+ Новая колода</option>
            <DeckOptionsList decks={decks} />
          </Select>
          {newDeck !== null && (
            <Input
              aria-label="Название новой колоды"
              value={newDeck}
              onChange={(e) => setNewDeck(e.target.value)}
              placeholder="Название новой колоды"
              className="mt-2"
            />
          )}
        </Field>
      </div>

      <ListGroup title="Какая колонка в какое поле">
        {nt.fields.map((f, i) => (
          <FormRow key={f + i} label={f}>
            <Select
              value={plan.fieldColumns[i] ?? -1}
              className="w-52"
              onChange={(e) => {
                const v = Number(e.target.value)
                const next = [...plan.fieldColumns]
                next[i] = v < 0 ? null : v
                set({ fieldColumns: next })
              }}
            >
              {columnOptions}
            </Select>
          </FormRow>
        ))}
        <FormRow label="Метки">
          <Select value={plan.tagsColumn ?? -1} className="w-52" onChange={(e) => set({ tagsColumn: Number(e.target.value) < 0 ? null : Number(e.target.value) })}>
            {columnOptions}
          </Select>
        </FormRow>
      </ListGroup>

      <Field label="Добавить метки ко всем" htmlFor="imp-tags">
        <Input id="imp-tags" value={extraTags} onChange={(e) => setExtraTags(e.target.value)} placeholder="например: урок5" autoCapitalize="off" />
      </Field>

      <Field label="Если такая карточка уже есть">
        <Segmented<DupMode>
          value={plan.dupMode}
          onChange={(v) => set({ dupMode: v })}
          options={[
            { value: 'skip', label: 'Пропустить' },
            { value: 'update', label: 'Обновить' },
            { value: 'duplicate', label: 'Добавить' },
          ]}
        />
      </Field>

      <div className="space-y-2 pt-1">
        <Button size="lg" className="w-full" disabled={!mappedAny || count <= 0 || (newDeck !== null && !newDeck.trim())} onClick={() => onRun(parsed, { ...plan, extraTags: parseTags(extraTags) }, newDeck)}>
          Импортировать {count} {plural(count, ['строку', 'строки', 'строк'])}
        </Button>
        <Button variant="ghost" className="w-full" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </div>
  )
}

// ---------- APKG ----------

function ApkgImport({ file, data, onCancel, onRun }: { file: File; data: ApkgData; onCancel: () => void; onRun: (o: ApkgOptions) => void }) {
  const s = useMemo(() => summarize(data, deckNameFromFile(file.name)), [data, file.name])
  const [withProgress, setWithProgress] = useState(s.hasProgress)
  const [dupMode, setDupMode] = useState<ApkgOptions['dupMode']>('skip')
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center gap-3">
          <Package className="size-8 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{file.name}</div>
            <div className="text-xs text-muted">{formatBytes(file.size)}</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat value={s.notes} label={plural(s.notes, ['заметка', 'заметки', 'заметок'])} />
          <Stat value={s.cards} label={cardsWord(s.cards)} />
          <Stat value={s.media} label="медиа" />
        </div>
      </div>

      {s.decks.length > 0 && (
        <ListGroup title={plural(s.decks.length, ['Колода', 'Колоды', 'Колоды'])}>
          {s.decks.slice(0, 12).map((d) => (
            <div key={d} className="truncate px-4 py-2.5 text-[15px]">
              {d.split('::').join(' › ')}
            </div>
          ))}
          {s.decks.length > 12 && <div className="px-4 py-2.5 text-sm text-muted">и ещё {s.decks.length - 12}</div>}
        </ListGroup>
      )}

      <ListGroup footer="Если колода с таким названием уже есть, карточки добавятся в неё.">
        {s.hasProgress && (
          <FormRow label="Перенести прогресс" hint="Интервалы, история и настройки колод. Выключите, чтобы учить колоду с нуля">
            <Switch label="Перенести прогресс" checked={withProgress} onChange={setWithProgress} />
          </FormRow>
        )}
        <div className="px-4 py-3">
          <div className="mb-2 text-[15px]">Если заметка уже есть</div>
          <Segmented<ApkgOptions['dupMode']>
            value={dupMode}
            onChange={setDupMode}
            options={[
              { value: 'skip', label: 'Оставить мою' },
              { value: 'update', label: 'Обновить текст' },
            ]}
          />
        </div>
      </ListGroup>

      <div className="space-y-2">
        <Button size="lg" className="w-full" onClick={() => onRun({ withProgress, dupMode })}>
          Импортировать
        </Button>
        <Button variant="ghost" className="w-full" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl bg-surface-2/70 py-2.5">
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  )
}
