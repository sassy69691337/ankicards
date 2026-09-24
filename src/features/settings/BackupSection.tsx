import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArchiveRestore, DatabaseBackup, FileUp, Save } from 'lucide-react'
import { getConfig } from '../../db/db'
import { setRolloverHour } from '../../core/time'
import { cardsWord, errMsg } from '../../core/format'
import { createBackup, markBackupDone, restoreBackup } from '../../io/backup'
import { formatBytes, saveFile, timestampName } from '../../io/files'
import { ListGroup, ListRow } from '../../ui/List'
import { Button } from '../../ui/Button'
import { confirmDialog } from '../../ui/dialogs'
import { toast } from '../../ui/toast'
import { requestSync } from '../../sync/cloud'

type State = { kind: 'idle' } | { kind: 'busy'; text: string } | { kind: 'ready'; blob: Blob; name: string }

export function BackupSection() {
  const last = useLiveQuery(() => getConfig<number | null>('lastBackupAt', null), [])
  const [state, setState] = useState<State>({ kind: 'idle' })
  const input = useRef<HTMLInputElement>(null)

  async function build() {
    setState({ kind: 'busy', text: 'Создаю копию…' })
    try {
      const { blob } = await createBackup()
      setState({ kind: 'ready', blob, name: timestampName('ankicards-backup', 'zip') })
    } catch (e) {
      toast(errMsg(e), 'error')
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
    const ok = await confirmDialog({
      title: 'Восстановить из копии?',
      message: 'Все текущие колоды, карточки и прогресс будут заменены содержимым файла.',
      confirmText: 'Восстановить',
      danger: true,
    })
    if (!ok) return
    setState({ kind: 'busy', text: 'Восстанавливаю…' })
    try {
      const r = await restoreBackup(new Uint8Array(await file.arrayBuffer()))
      setRolloverHour(await getConfig('rolloverHour', 4))
      toast(`Восстановлено: ${r.cards} ${cardsWord(r.cards)}`)
      void requestSync()
    } catch (e) {
      toast(errMsg(e), 'error')
    } finally {
      setState({ kind: 'idle' })
    }
  }

  const lastText = last ? `Последняя: ${new Date(last).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Копий ещё не было'

  return (
    <ListGroup
      title="Резервная копия"
      footer="Копия — один файл .zip со всеми карточками, прогрессом и медиа. Сохраните его в «Файлы» или iCloud Drive."
    >
      {state.kind === 'ready' ? (
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-medium">{state.name}</div>
            <div className="text-xs text-muted">{formatBytes(state.blob.size)}</div>
          </div>
          <Button size="sm" onClick={() => void save()}>
            <Save className="size-4" />
            Сохранить
          </Button>
        </div>
      ) : (
        <ListRow
          icon={<DatabaseBackup />}
          label={state.kind === 'busy' ? state.text : 'Создать резервную копию'}
          hint={lastText}
          onClick={state.kind === 'idle' ? () => void build() : undefined}
        />
      )}
      <ListRow icon={<ArchiveRestore />} label="Восстановить из копии" onClick={() => input.current?.click()} />
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
    </ListGroup>
  )
}
