import { useSyncExternalStore } from 'react'
import { CircleAlert, Check } from 'lucide-react'
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
  }, kind === 'error' ? 4000 : 2200)
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
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+12px)] z-[60] flex flex-col items-center gap-2 px-4">
      {list.map((t) => (
        <div
          key={t.id}
          className={cn(
            'flex max-w-sm animate-pop-in items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-lg',
            t.kind === 'error' ? 'bg-red-600 text-white' : 'bg-fg text-bg',
          )}
        >
          {t.kind === 'error' ? <CircleAlert className="size-4 shrink-0" /> : <Check className="size-4 shrink-0" />}
          {t.text}
        </div>
      ))}
    </div>
  )
}
