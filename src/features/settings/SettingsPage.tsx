import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Monitor, Moon, Sun } from 'lucide-react'
import { db, getConfig, requestPersistentStorage, setConfig } from '../../db/db'
import { setRolloverHour } from '../../core/time'
import { setReduceTransparency, setThemePref, useReduceTransparency, useThemePref, type ThemePref } from '../../app/theme'
import { PageBody, PageHeader } from '../../ui/PageHeader'
import { ListGroup, ListRow, StatusBadge } from '../../ui/List'
import { FormRow, Segmented, Select, Switch } from '../../ui/forms'
import { Button } from '../../ui/Button'
import { Logo } from '../../ui/Logo'
import { toast } from '../../ui/toast'
import { useCloud } from '../../sync/cloud'
import { BackupRows } from './BackupSection'
import { CloudSection } from './CloudSection'

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`
  return `${(n / 1024 / 1024).toFixed(1)} МБ`
}

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`

export default function SettingsPage() {
  const theme = useThemePref()
  const solid = useReduceTransparency()
  const cloud = useCloud()
  const rollover = useLiveQuery(() => getConfig('rolloverHour', 4), [])
  const stats = useLiveQuery(async () => {
    const [notes, cards, reviews] = await Promise.all([db.notes.count(), db.cards.count(), db.revlog.count()])
    return { notes, cards, reviews }
  }, [])
  const [storage, setStorage] = useState<{ persisted: boolean; usage?: number } | null>(null)
  const synced = !!cloud.user && cloud.phase !== 'link'

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
        <CloudSection />

        <ListGroup title="Оформление">
          <div className="px-4 py-3">
            <Segmented<ThemePref>
              label="Тема"
              value={theme}
              onChange={setThemePref}
              options={[
                { value: 'system', label: 'Система', icon: <Monitor /> },
                { value: 'light', label: 'Светлая', icon: <Sun /> },
                { value: 'dark', label: 'Тёмная', icon: <Moon /> },
              ]}
            />
          </div>
          <FormRow label="Уменьшить прозрачность" hint="Непрозрачные панели без размытия" htmlFor="solid">
            <Switch id="solid" checked={solid} onChange={setReduceTransparency} />
          </FormRow>
        </ListGroup>

        <ListGroup
          title="Расписание"
          footer={`Карточки следующего дня становятся доступны после ${hh(rollover ?? 4)} по времени этого устройства. Карточки на шагах обучения появляются в свой срок.`}
        >
          <FormRow label="Начало нового дня" htmlFor="rollover">
            <Select
              id="rollover"
              value={rollover ?? 4}
              className="w-32"
              onChange={async (e) => {
                const h = Number(e.target.value)
                await setConfig('rolloverHour', h)
                setRolloverHour(h)
                toast('Сохранено')
              }}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hh(h)}
                </option>
              ))}
            </Select>
          </FormRow>
        </ListGroup>

        <ListGroup
          title="Данные"
          footer={
            synced
              ? 'Данные хранятся на этом устройстве и синхронизируются с облаком.'
              : 'Данные хранятся только на этом устройстве, в браузере. Регулярно делайте резервную копию.'
          }
        >
          <BackupRows />
          <ListRow label="Заметок" value={stats?.notes ?? '…'} />
          <ListRow label="Карточек" value={stats?.cards ?? '…'} />
          <ListRow label="Повторений в истории" value={stats?.reviews ?? '…'} />
          {storage?.usage !== undefined && <ListRow label="Занято места" value={formatBytes(storage.usage)} />}
          <FormRow
            label="Постоянное хранилище"
            hint={storage?.persisted ? 'Браузер не удалит данные автоматически' : 'Браузер может очистить данные при нехватке места'}
          >
            {storage?.persisted ? (
              <StatusBadge tone="success">Включено</StatusBadge>
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

        <div className="flex flex-col items-center gap-1 pt-2 text-center">
          <Logo className="text-[17px]" />
          <p className="text-sm text-muted">Сборка {__BUILD_DATE__}</p>
        </div>
      </PageBody>
    </>
  )
}
