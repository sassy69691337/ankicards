import { useState } from 'react'
import { FileSpreadsheet, FileText, Save } from 'lucide-react'
import { leafName } from '../../db/collection'
import { errMsg, plural } from '../../core/format'
import { exportDeckText, type TextExportKind } from '../../io/exportText'
import { formatBytes, saveFile } from '../../io/files'
import { Sheet } from '../../ui/Sheet'
import { Button } from '../../ui/Button'
import { toast } from '../../ui/toast'

const KINDS: { kind: TextExportKind; icon: typeof FileText; title: string; text: string; ext: string }[] = [
  { kind: 'anki', icon: FileText, title: 'Текст для Anki (.txt)', text: 'Все поля с оформлением, метки и колоды. Открывается в Anki и здесь.', ext: 'txt' },
  { kind: 'csv', icon: FileSpreadsheet, title: 'Таблица (.csv)', text: 'Только текст полей — для Excel и Google Таблиц.', ext: 'csv' },
]

export function ExportSheet({ open, onClose, deckId, deckName }: { open: boolean; onClose: () => void; deckId: number; deckName: string }) {
  const [ready, setReady] = useState<{ blob: Blob; name: string; notes: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const close = () => {
    setReady(null)
    onClose()
  }

  async function build(kind: TextExportKind, ext: string) {
    setBusy(true)
    try {
      const { blob, notes } = await exportDeckText(deckId, kind)
      const safe = leafName(deckName).replace(/[\\/:*?"<>|]+/g, '_')
      setReady({ blob, notes, name: `${safe}.${ext}` })
    } catch (e) {
      toast(errMsg(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={close} title="Экспорт колоды">
      {ready ? (
        <div className="space-y-4">
          <p className="break-all text-[15px] text-muted">
            {ready.name} · {ready.notes} {plural(ready.notes, ['заметка', 'заметки', 'заметок'])} · {formatBytes(ready.blob.size)}
          </p>
          <Button
            size="lg"
            className="w-full"
            onClick={async () => {
              if ((await saveFile(ready.blob, ready.name)) !== 'cancelled') close()
            }}
          >
            <Save className="size-5" />
            Сохранить файл
          </Button>
        </div>
      ) : (
        <div className="-mx-2 space-y-1">
          {KINDS.map(({ kind, icon: Icon, title, text, ext }) => (
            <button
              key={kind}
              type="button"
              disabled={busy}
              onClick={() => void build(kind, ext)}
              className="flex min-h-14 w-full items-start gap-3 rounded-[16px] px-3 py-3 text-left transition hover:bg-surface-2 disabled:opacity-50"
            >
              <Icon className="mt-0.5 size-5 shrink-0 text-accent-text" />
              <span>
                <span className="block text-base font-medium">{title}</span>
                <span className="block text-[15px] leading-[22px] text-muted">{text}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  )
}
