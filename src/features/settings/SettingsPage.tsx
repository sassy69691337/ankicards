import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { HardDrive, Monitor, Moon, Sun } from 'lucide-react'
import { db, getConfig, requestPersistentStorage, setConfig } from '../../db/db'
import { setRolloverHour } from '../../core/time'
import { setThemePref, useThemePref, type ThemePref } from '../../app/theme'
import { PageBody, PageHeader } from '../../ui/PageHeader'
import { ListGroup, ListRow } from '../../ui/List'
import { FormRow, Segmented, Select } from '../../ui/forms'
import { Button } from '../../ui/Button'
import { toast } from '../../ui/toast'

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`
  return `${(n / 1024 / 1024).toFixed(1)} МБ`
}

export default function SettingsPage() {
  const theme = useThemePref()
  const rollover = useLiveQuery(() => getConfig('rolloverHour', 4), [])
  const stats = useLiveQuery(async () => {
    const [notes, cards, reviews] = await Promise.all([db.notes.count(), db.cards.count(), db.revlog.count()])
    return { notes, cards, reviews }
  }, [])
  const [storage, setStorage] = useState<{ persisted: boolean; usage?: number } | null>(null)

  async function refreshStorage() {
    try {
      const [persisted, est] = await Promise.all([navigator.storage?.persisted?.() ?? false, navigator.storage?.estimate?.()])
      setStorage({ persisted, usage: est?.usage })
    } catch {
      setStorage({ persisted: false })
    }
  }

  useEffect(() => {
    void refreshStorage()
  }, [])

  return (
    <>
      <PageHeader large title="Настройки" />
      <PageBody>
        <ListGroup title="Оформление">
          <div className="px-4 py-3">
            <Segmented<ThemePref>
              value={theme}
              onChange={setThemePref}
              options={[
                { value: 'system', label: 'Система', icon: <Monitor /> },
                { value: 'light', label: 'Светлая', icon: <Sun /> },
                { value: 'dark', label: 'Тёмная', icon: <Moon /> },
              ]}
            />
          </div>
        </ListGroup>

        <ListGroup title="Расписание" footer="Карточки на следующий день появляются после этого часа.">
          <FormRow label="Начало нового дня">
            <Select
              value={rollover ?? 4}
              className="w-28"
              onChange={async (e) => {
                const h = Number(e.target.value)
                await setConfig('rolloverHour', h)
                setRolloverHour(h)
                toast('Сохранено')
              }}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </Select>
          </FormRow>
        </ListGroup>

        <ListGroup
          title="Данные"
          footer="Все данные хранятся только на этом устройстве, в браузере. Экспорт и резервные копии появятся в следующем обновлении."
        >
          <ListRow label="Заметок" value={stats?.notes ?? '…'} />
          <ListRow label="Карточек" value={stats?.cards ?? '…'} />
          <ListRow label="Повторений в истории" value={stats?.reviews ?? '…'} />
          {storage?.usage !== undefined && <ListRow label="Занято места" value={formatBytes(storage.usage)} />}
          <FormRow
            label={
              <span className="flex items-center gap-2">
                <HardDrive className="size-4 text-muted" />
                Постоянное хранилище
              </span>
            }
            hint={storage?.persisted ? 'Браузер не удалит данные автоматически' : 'Браузер может очистить данные при нехватке места'}
          >
            {storage?.persisted ? (
              <span className="text-sm font-medium text-review">Включено</span>
            ) : (
              <Button
                size="sm"
                variant="soft"
                onClick={async () => {
                  const ok = await requestPersistentStorage()
                  toast(ok ? 'Хранилище закреплено' : 'Браузер отклонил запрос. Установите приложение на экран «Домой».', ok ? 'ok' : 'error')
                  void refreshStorage()
                }}
              >
                Включить
              </Button>
            )}
          </FormRow>
        </ListGroup>

        <p className="text-center text-xs text-muted">AnkiCards · сборка {__BUILD_DATE__}</p>
      </PageBody>
    </>
  )
}
