import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cloud, CloudAlert, CloudCheck, CloudOff, LogOut, RefreshCw, WifiOff } from 'lucide-react'
import { errMsg, plural } from '../../core/format'
import { getLinkInfo, linkWith, requestSync, signIn, signOut, signUp, useCloud, type CloudState } from '../../sync/cloud'
import type { LinkMode } from '../../sync/engine'
import { useOnline } from '../../app/useOnline'
import { ListGroup, ListRow } from '../../ui/List'
import { Field, FieldError, Input } from '../../ui/forms'
import { Button, IconButton } from '../../ui/Button'
import { Sheet } from '../../ui/Sheet'
import { confirmDialog } from '../../ui/dialogs'
import { toast } from '../../ui/toast'
import { cn } from '../../ui/cn'

const notesWord = (n: number) => plural(n, ['заметка', 'заметки', 'заметок'])

function formatWhen(at: number): string {
  const d = new Date(at)
  const today = new Date().toDateString() === d.toDateString()
  return today ? `сегодня в ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : d.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
}

function statusText(s: CloudState, online: boolean): string {
  if (!online) return 'Нет сети. Изменения сохраняются на устройстве и отправятся, когда связь появится'
  if (s.phase === 'syncing') return 'Синхронизация…'
  if (s.phase === 'error') return 'Не удалось синхронизировать'
  if (!s.lastAt) return 'Ещё не синхронизировано'
  return `Синхронизировано ${formatWhen(s.lastAt)}`
}

export function CloudSection() {
  const cloud = useCloud()
  const online = useOnline()
  const [authOpen, setAuthOpen] = useState(false)
  const [choice, setChoice] = useState<{ remote: number; localNotes: number } | null>(null)

  async function connect(mode?: LinkMode) {
    try {
      if (!mode) {
        const info = await getLinkInfo()
        if (info.remote === 0) mode = 'upload'
        else if (info.localNotes === 0) mode = 'download'
        else {
          setChoice(info)
          return
        }
      }
      setChoice(null)
      await linkWith(mode)
      toast(mode === 'download' ? 'Данные загружены из облака' : 'Данные сохранены в облаке')
    } catch (e) {
      toast(errMsg(e), 'error')
    }
  }

  if (!cloud.ready) return null

  return (
    <>
      <ListGroup
        title="Аккаунт и синхронизация"
        footer={
          cloud.user && cloud.phase !== 'link'
            ? 'Изменения отправляются автоматически: при открытии приложения, после занятия и каждые 5 минут.'
            : 'Без входа карточки хранятся только на этом устройстве. С облаком они восстановятся на новом телефоне.'
        }
      >
        {!cloud.user && <ListRow icon={<Cloud />} label="Войти в облако" hint="Синхронизация выключена" onClick={() => setAuthOpen(true)} />}

        {cloud.user && cloud.phase === 'link' && (
          <ListRow icon={<Cloud />} label="Включить синхронизацию" hint={cloud.error ?? cloud.user.email} onClick={() => void connect()} />
        )}

        {cloud.user && cloud.phase !== 'link' && (
          <div className="px-4 py-3">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  'mt-0.5 grid size-9 shrink-0 place-items-center rounded-[12px] [&_svg]:size-5',
                  cloud.phase === 'error' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent-text',
                )}
              >
                {!online ? <WifiOff /> : cloud.phase === 'error' ? <CloudAlert /> : <CloudCheck />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-all text-base leading-6">{cloud.user.email}</p>
                <p className={cn('text-sm', cloud.phase === 'error' && online ? 'font-medium text-danger' : 'text-muted')}>{statusText(cloud, online)}</p>
              </div>
              {cloud.phase !== 'error' && (
                <IconButton label="Синхронизировать сейчас" disabled={cloud.phase === 'syncing' || !online} onClick={() => void requestSync()} className="-my-1 text-muted">
                  <RefreshCw className={cn(cloud.phase === 'syncing' && 'animate-spin')} />
                </IconButton>
              )}
            </div>
            {cloud.phase === 'error' && online && (
              <div className="mt-3 rounded-[16px] bg-danger-soft px-3.5 py-3 text-[15px] leading-[22px] text-danger">
                <p>Причина: {cloud.error ?? 'неизвестная ошибка'}.</p>
                <p className="mt-0.5">
                  {cloud.lastAt ? `Последняя успешная синхронизация — ${formatWhen(cloud.lastAt)}.` : 'Успешной синхронизации ещё не было.'} Данные на устройстве сохранены.
                </p>
                <Button size="sm" variant="secondary" className="mt-2.5" onClick={() => void requestSync()}>
                  <RefreshCw className="size-4" />
                  Повторить
                </Button>
              </div>
            )}
          </div>
        )}

        {cloud.user && (
          <ListRow
            icon={<LogOut />}
            label="Выйти из аккаунта"
            hint="Карточки на этом устройстве останутся"
            onClick={async () => {
              if (
                await confirmDialog({
                  title: 'Выйти из аккаунта?',
                  message:
                    'Колоды, карточки и прогресс останутся на этом устройстве. Новые изменения перестанут сохраняться в облако, пока вы снова не войдёте.',
                  confirmText: 'Выйти',
                })
              ) {
                await signOut()
              }
            }}
          />
        )}
      </ListGroup>

      <AuthSheet
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onDone={() => {
          setAuthOpen(false)
          // привязка запустится, когда придёт событие входа
          setTimeout(() => void connect(), 300)
        }}
      />

      <Sheet open={!!choice} onClose={() => setChoice(null)} title="Где ваши карточки?">
        {choice && (
          <div className="space-y-3">
            <p className="text-[15px] leading-[22px] text-muted">
              В облаке уже есть данные этого аккаунта, и на телефоне тоже ({choice.localNotes} {notesWord(choice.localNotes)}). Объединить их нельзя — выберите, что оставить.
            </p>
            <Button size="lg" className="w-full" onClick={() => void connect('download')}>
              Взять из облака
            </Button>
            <p className="-mt-1 px-1 text-sm text-muted">Карточки на телефоне заменятся данными из облака.</p>
            <Button
              size="lg"
              variant="secondary"
              className="w-full"
              onClick={async () => {
                const ok = await confirmDialog({
                  title: 'Заменить данные в облаке?',
                  message: 'Всё, что сейчас хранится в облаке, будет удалено и заменено карточками с этого телефона.',
                  confirmText: 'Заменить',
                  danger: true,
                })
                if (ok) void connect('replace')
              }}
            >
              Оставить данные телефона
            </Button>
          </div>
        )}
      </Sheet>
    </>
  )
}

function AuthSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'in' | 'up' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(action: 'in' | 'up', e?: FormEvent) {
    e?.preventDefault()
    if (busy) return
    setBusy(action)
    setError(null)
    try {
      await (action === 'in' ? signIn(email, password) : signUp(email, password))
      setPassword('')
      onDone()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Вход в облако">
      <form onSubmit={(e) => void run('in', e)} className="space-y-4">
        <Field label="Email" htmlFor="cloud-email">
          <Input id="cloud-email" type="email" autoComplete="username" autoCapitalize="off" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Пароль" htmlFor="cloud-password" hint="Не короче 6 символов">
          <Input
            id="cloud-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </Field>
        {error && <FieldError>{error}</FieldError>}
        <div className="flex flex-col gap-2 min-[400px]:flex-row-reverse">
          <Button type="submit" size="lg" className="flex-1" loading={busy === 'in'} disabled={!!busy || !email || !password}>
            Войти
          </Button>
          <Button type="button" variant="secondary" size="lg" className="flex-1" loading={busy === 'up'} disabled={!!busy || !email || password.length < 6} onClick={() => void run('up')}>
            Создать аккаунт
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

/** Значок состояния синхронизации для шапки «Колоды» */
export function CloudBadge() {
  const cloud = useCloud()
  const online = useOnline()
  const nav = useNavigate()
  if (!cloud.ready) return null
  let icon = <CloudOff className="text-muted" />
  let label = 'Синхронизация выключена'
  if (cloud.user) {
    if (!online) {
      icon = <WifiOff className="text-muted" />
      label = 'Нет сети — изменения отправятся позже'
    } else if (cloud.phase === 'syncing') {
      icon = <RefreshCw className="animate-spin text-muted" />
      label = 'Синхронизация…'
    } else if (cloud.phase === 'error') {
      icon = <CloudAlert className="text-danger" />
      label = 'Ошибка синхронизации'
    } else if (cloud.phase === 'link') {
      icon = <CloudOff className="text-muted" />
      label = 'Синхронизация не включена'
    } else {
      icon = <CloudCheck className="text-muted" />
      label = statusText(cloud, online)
    }
  }
  return (
    <IconButton label={label} variant="surface" onClick={() => nav('/settings')}>
      {icon}
    </IconButton>
  )
}
