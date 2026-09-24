import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArchiveRestore, DatabaseBackup, FileUp, Save } from 'lucide-react'
import { getConfig } from '../../db/db'
import { setRolloverHour } from '../../core/time'
import { cardsWord, errMsg } from '../../core/format'
import { createBackup, markBackupDone, restoreBackup } from '../../io/backup'
import { formatBytes, saveFile, timestampName } from '../../io/files'
import { ListRow } from '../../ui/List'
import { Button } from '../../ui/Button'
import { choiceDialog } from '../../ui/dialogs'
import { toast } from '../../ui/toast'
import { requestSync, useCloud } from '../../sync/cloud'

type State = { kind: 'idle' } | { kind: 'busy'; text: string } | { kind: 'ready'; blob: Blob; name: string }

/** Строки резервной копии и импорта — внутри группы «Данные» */
export function BackupRows() {
  const last = useLiveQuery(() => getConfig<number | null>('lastBackupAt', null), [])
  const cloud = useCloud()
  const [state, setState] = useState<State>({ kind: 'idle' })
  const input = useRef<HTMLInputElement>(null)

  async function build() {
    setState({ kind: 'busy', text: 'Создаю копию…' })
    try {
      const { blob } = await createBackup()
      setState({ kind: 'ready', blob, name: timestampName('ankicards-backup', 'zip') })
    } catch (e) {
      toast(`Копия не создана: ${errMsg(e)}`, 'error')
      setState({ kind: 'idle' })
    }
  }

  async function save() {
    if (state.kind !== 'ready') return
    const res = await saveFile(state.blob, state.name)
    if (res === 'cancelled') return
    await markBackupDone()
    toast('Копия сохранена')
    setState({ kind: 'idle' })
  }

  async function restore(file: File) {
    const synced = !!cloud.user && cloud.phase !== 'link'
    const choice = await choiceDialog({
      title: 'Восстановить из копии?',
      message: `Данные не объединяются: все текущие колоды, карточки и прогресс на этом устройстве будут заменены содержимым файла «${file.name}».${synced ? ' Затем изменения отправятся в облако.' : ''} Перед заменой лучше сохранить актуальную копию.`,
      choices: [
        { value: 'backup', label: 'Сохранить копию и восстановить' },
        { value: 'restore', label: 'Восстановить без копии', variant: 'danger' },
      ],
    })
    if (!choice) return
    try {
      if (choice === 'backup') {
        setState({ kind: 'busy', text: 'Создаю актуальную копию…' })
        const { blob } = await createBackup()
        if ((await saveFile(blob, timestampName('ankicards-backup', 'zip'))) === 'cancelled') {
          toast('Восстановление отменено: копия не сохранена', 'error')
          return
        }
        await markBackupDone()
      }
      setState({ kind: 'busy', text: 'Восстанавливаю…' })
      const r = await restoreBackup(new Uint8Array(await file.arrayBuffer()))
      setRolloverHour(await getConfig('rolloverHour', 4))
      toast(`Восстановлено: ${r.cards} ${cardsWord(r.cards)}`)
      void requestSync()
    } catch (e) {
      toast(`Не восстановлено: ${errMsg(e)}`, 'error')
    } finally {
      setState({ kind: 'idle' })
    }
  }

  const lastText = last ? `Последняя: ${new Date(last).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Копий ещё не было'

  return (
    <>
      {state.kind === 'ready' ? (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="break-all text-base font-medium">{state.name}</div>
            <div className="text-sm text-muted">{formatBytes(state.blob.size)}</div>
          </div>
          <Button size="sm" onClick={() => void save()}>
            <Save className="size-4" />
            Сохранить файл
          </Button>
        </div>
      ) : (
        <ListRow
          icon={<DatabaseBackup />}
          label={state.kind === 'busy' ? state.text : 'Создать резервную копию'}
          hint={state.kind === 'busy' ? undefined : `ZIP со всеми карточками, прогрессом и медиа. ${lastText}`}
          onClick={state.kind === 'idle' ? () => void build() : undefined}
        />
      )}
      <ListRow icon={<ArchiveRestore />} label="Восстановить из копии" hint="Заменяет данные на устройстве" disabled={state.kind === 'busy'} onClick={() => input.current?.click()} />
      <ListRow icon={<FileUp />} label="Импорт CSV, TXT, APKG" to="/import" />
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void restore(f)
        }}
      />
    </>
  )
}
