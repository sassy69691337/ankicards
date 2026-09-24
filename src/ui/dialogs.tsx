import { useState, useSyncExternalStore } from 'react'
import { Sheet } from './Sheet'
import { Button } from './Button'
import { Input } from './forms'

interface Base {
  title: string
  message?: string
  confirmText?: string
}

export interface Choice<T extends string> {
  value: T
  label: string
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
}

type Req =
  | (Base & { kind: 'choice'; choices: Choice<string>[]; resolve: (v: string | null) => void })
  | (Base & { kind: 'prompt'; defaultValue?: string; placeholder?: string; resolve: (v: string | null) => void })

let current: { req: Req; id: number } | null = null
let reqId = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function open(req: Req) {
  current = { req, id: ++reqId }
  emit()
}

/** Выбор из нескольких действий. null — окно закрыто без выбора */
export function choiceDialog<T extends string>(o: Omit<Base, 'confirmText'> & { choices: Choice<T>[] }): Promise<T | null> {
  return new Promise((resolve) => open({ ...o, kind: 'choice', resolve: resolve as (v: string | null) => void }))
}

export async function confirmDialog(o: Base & { danger?: boolean }): Promise<boolean> {
  const v = await choiceDialog({
    title: o.title,
    message: o.message,
    choices: [{ value: 'ok', label: o.confirmText ?? 'OK', variant: o.danger ? 'danger' : 'primary' }],
  })
  return v === 'ok'
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
  const close = (result: string | null) => {
    current = null
    emit()
    req.resolve(result)
  }
  return (
    <Sheet open onClose={() => close(null)} title={req.title}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (req.kind === 'prompt') close(value)
          else close(req.choices[0]?.value ?? null)
        }}
      >
        {req.message && <p className="-mt-1 mb-5 text-[15px] leading-[22px] text-muted">{req.message}</p>}
        {req.kind === 'prompt' ? (
          <>
            <Input autoFocus aria-label={req.title} value={value} placeholder={req.placeholder} onChange={(e) => setValue(e.target.value)} className="mb-5" />
            <div className="flex gap-2">
              <Button variant="secondary" size="lg" className="flex-1" onClick={() => close(null)}>
                Отмена
              </Button>
              <Button type="submit" size="lg" className="flex-1">
                {req.confirmText ?? 'OK'}
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            {req.choices.map((c, i) => (
              <Button
                key={c.value}
                type={i === 0 ? 'submit' : 'button'}
                size="lg"
                variant={c.variant === 'danger' ? 'danger' : (c.variant ?? (i === 0 ? 'primary' : 'secondary'))}
                className="w-full"
                onClick={i === 0 ? undefined : () => close(c.value)}
              >
                {c.label}
              </Button>
            ))}
            <Button variant="ghost" size="lg" className="w-full" onClick={() => close(null)}>
              Отмена
            </Button>
          </div>
        )}
      </form>
    </Sheet>
  )
}
