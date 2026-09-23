import { useState, useSyncExternalStore } from 'react'
import { Sheet } from './Sheet'
import { Button } from './Button'
import { Input } from './forms'

interface Base {
  title: string
  message?: string
  confirmText?: string
}
type Req =
  | (Base & { kind: 'confirm'; danger?: boolean; resolve: (v: boolean) => void })
  | (Base & { kind: 'prompt'; defaultValue?: string; placeholder?: string; resolve: (v: string | null) => void })

let current: { req: Req; id: number } | null = null
let reqId = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function open(req: Req) {
  current = { req, id: ++reqId }
  emit()
}

export function confirmDialog(o: Base & { danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => open({ ...o, kind: 'confirm', resolve }))
}

export function promptDialog(o: Base & { defaultValue?: string; placeholder?: string }): Promise<string | null> {
  return new Promise((resolve) => open({ ...o, kind: 'prompt', resolve }))
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function DialogHost() {
  const cur = useSyncExternalStore(subscribe, () => current)
  if (!cur) return null
  return <DialogView key={cur.id} req={cur.req} />
}

function DialogView({ req }: { req: Req }) {
  const [value, setValue] = useState(req.kind === 'prompt' ? (req.defaultValue ?? '') : '')
  const close = (ok: boolean) => {
    current = null
    emit()
    if (req.kind === 'confirm') req.resolve(ok)
    else req.resolve(ok ? value : null)
  }
  return (
    <Sheet open onClose={() => close(false)} title={req.title}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          close(true)
        }}
      >
        {req.message && <p className="-mt-2 mb-4 text-sm text-muted">{req.message}</p>}
        {req.kind === 'prompt' && (
          <Input autoFocus value={value} placeholder={req.placeholder} onChange={(e) => setValue(e.target.value)} className="mb-4" />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => close(false)}>
            Отмена
          </Button>
          <Button
            type="submit"
            className={req.kind === 'confirm' && req.danger ? 'flex-1 !bg-red-600 !text-white !shadow-red-600/25 hover:!bg-red-700' : 'flex-1'}
          >
            {req.confirmText ?? 'OK'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
