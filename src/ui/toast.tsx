import { useSyncExternalStore } from 'react'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { cn } from './cn'

interface Toast {
  id: number
  text: string
  kind: 'ok' | 'error'
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function toast(text: string, kind: Toast['kind'] = 'ok') {
  const t = { id: nextId++, text, kind }
  toasts = [...toasts.slice(-2), t]
  emit()
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id)
    emit()
  }, kind === 'error' ? 5000 : 2400)
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function ToastHost() {
  const list = useSyncExternalStore(subscribe, () => toasts)
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+12px)] z-[60] flex flex-col items-center gap-2 px-4"
    >
      {list.map((t) => (
        <div
          key={t.id}
          className={cn(
            'flex max-w-sm animate-pop-in items-start gap-2.5 rounded-[20px] px-4 py-3 text-[15px] font-medium leading-5',
            t.kind === 'error' ? 'bg-danger-soft text-danger shadow-lg ring-1 ring-danger/25' : 'glass text-fg',
          )}
        >
          {t.kind === 'error' ? (
            <CircleAlert className="size-5 shrink-0" aria-label="Ошибка" />
          ) : (
            <CircleCheck className="size-5 shrink-0 text-success" aria-hidden />
          )}
          {t.text}
        </div>
      ))}
    </div>
  )
}
