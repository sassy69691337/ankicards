import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cloud, CloudAlert, CloudCheck, CloudOff, LogOut, RefreshCw } from 'lucide-react'
import { errMsg, plural } from '../../core/format'
import { getLinkInfo, linkWith, requestSync, signIn, signOut, signUp, useCloud, type CloudState } from '../../sync/cloud'
import type { LinkMode } from '../../sync/engine'
import { ListGroup, ListRow } from '../../ui/List'
import { Field, Input } from '../../ui/forms'
import { Button, IconButton } from '../../ui/Button'
import { Sheet } from '../../ui/Sheet'
import { confirmDialog } from '../../ui/dialogs'
import { toast } from '../../ui/toast'
import { cn } from '../../ui/cn'

const notesWord = (n: number) => plural(n, ['заметка', 'заметки', 'заметок'])

function statusText(s: CloudState): string {
  if (s.phase === 'syncing') return 'Синхронизация…'
  if (s.phase === 'error') return `Ошибка: ${s.error ?? 'неизвестная'}`
  if (!s.lastAt) return 'Ещё не синхронизировано'
  const d = new Date(s.lastAt)
  const today = new Date().toDateString() === d.toDateString()
  return `Синхронизировано ${today ? 'сегодня в ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}`
}

export function CloudSection() {
  const cloud = useCloud()
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
        title="Облако"
        footer={
          cloud.user
            ? 'Изменения отправляются автоматически: при открытии приложения, после учёбы и каждые 5 минут.'
            : 'Карточки и прогресс будут храниться в облаке и восстановятся на новом телефоне.'
        }
      >
        {!cloud.user && <ListRow icon={<Cloud />} label="Войти в облако" hint="Синхронизация выключена" onClick={() => setAuthOpen(true)} />}

        {cloud.user && cloud.phase === 'link' && (
          <ListRow icon={<Cloud />} label="Включить синхронизацию" hint={cloud.error ?? cloud.user.email} onClick={() => void connect()} />
        )}

        {cloud.user && cloud.phase !== 'link' && (
          <div className="flex items-center gap-3 px-4 py-3">
            <span
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 [&_svg]:size-[18px]',
                cloud.phase === 'error' ? 'text-red-500' : 'text-accent',
              )}
            >
              {cloud.phase === 'error' ? <CloudAlert /> : <CloudCheck />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px]">{cloud.user.email}</span>
              <span className={cn('block text-xs', cloud.phase === 'error' ? 'text-red-600 dark:text-red-400' : 'text-muted')}>{statusText(cloud)}</span>
            </span>
            <IconButton label="Синхронизировать" disabled={cloud.phase === 'syncing'} onClick={() => void requestSync()}>
              <RefreshCw className={cn(cloud.phase === 'syncing' && 'animate-spin')} />
            </IconButton>
          </div>
        )}

        {cloud.user && (
          <ListRow
            icon={<LogOut />}
            label="Выйти из аккаунта"
            hint="Карточки на телефоне останутся"
            onClick={async () => {
              if (await confirmDialog({ title: 'Выйти из аккаунта?', message: 'Карточки останутся на телефоне, но перестанут сохраняться в облако.', confirmText: 'Выйти' })) {
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
            <p className="text-sm text-muted">
              В облаке уже есть данные этого аккаунта, и на телефоне тоже ({choice.localNotes} {notesWord(choice.localNotes)}). Объединить их нельзя — выберите, что оставить.
            </p>
            <Button size="lg" className="w-full" onClick={() => void connect('download')}>
              Взять из облака
            </Button>
            <p className="-mt-1 px-1 text-xs text-muted">Карточки на телефоне заменятся данными из облака.</p>
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: 'in' | 'up', e?: FormEvent) {
    e?.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await (action === 'in' ? signIn(email, password) : signUp(email, password))
      setPassword('')
      onDone()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
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
        {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" disabled={busy || !email || password.length < 6} onClick={() => void run('up')}>
            Создать аккаунт
          </Button>
          <Button type="submit" className="flex-1" disabled={busy || !email || !password}>
            Войти
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

/** Значок состояния облака для заголовка */
export function CloudBadge() {
  const cloud = useCloud()
  const nav = useNavigate()
  if (!cloud.user) return null
  const icon =
    cloud.phase === 'syncing' ? (
      <RefreshCw className="animate-spin" />
    ) : cloud.phase === 'error' ? (
      <CloudAlert className="text-red-500" />
    ) : cloud.phase === 'link' ? (
      <CloudOff className="text-muted" />
    ) : (
      <CloudCheck className="text-muted" />
    )
  return (
    <IconButton label={statusText(cloud)} onClick={() => nav('/settings')}>
      {icon}
    </IconButton>
  )
}
