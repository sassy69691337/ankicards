// Состояние облака для интерфейса: вход, автосинхронизация, статус
import { useSyncExternalStore } from 'react'
import { getConfig } from '../db/db'
import { setRolloverHour } from '../core/time'
import { clearMediaCache } from '../core/media'
import { linkAccount, linkedUser, linkInfo, syncNow, type LinkMode } from './engine'
import { SupabaseRemote, supabase } from './supabaseRemote'

export interface CloudState {
  ready: boolean
  user: { id: string; email: string } | null
  /** off — не вошли; link — вошли, но устройство не привязано */
  phase: 'off' | 'link' | 'idle' | 'syncing' | 'error'
  lastAt: number | null
  error: string | null
}

let state: CloudState = { ready: false, user: null, phase: 'off', lastAt: null, error: null }
const listeners = new Set<() => void>()

function set(patch: Partial<CloudState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function useCloud(): CloudState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    () => state,
  )
}

const remote = () => {
  if (!state.user) throw new Error('Войдите в аккаунт')
  return new SupabaseRemote(state.user.id)
}

let running: Promise<void> | null = null
let again = false

/** Запустить синхронизацию (повторные вызовы во время работы склеиваются) */
export function requestSync(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    do {
      again = false
      if (!state.user || (state.phase !== 'idle' && state.phase !== 'error')) return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      set({ phase: 'syncing' })
      try {
        const r = await syncNow(remote())
        if (r.pulled > 0) {
          setRolloverHour(await getConfig('rolloverHour', 4))
          clearMediaCache()
        }
        set({ phase: 'idle', lastAt: Date.now(), error: null })
      } catch (e) {
        set({ phase: 'error', error: e instanceof Error ? e.message : String(e) })
      }
    } while (again)
  })().finally(() => {
    running = null
  })
  return running
}

async function onUser(user: { id: string; email?: string } | null) {
  if (!user) {
    set({ ready: true, user: null, phase: 'off', error: null })
    return
  }
  const linked = (await linkedUser()) === user.id
  set({
    ready: true,
    user: { id: user.id, email: user.email ?? '' },
    phase: linked ? 'idle' : 'link',
    lastAt: await getConfig<number | null>('sync.lastAt', null),
  })
  if (linked) void requestSync()
}

export function initCloud() {
  supabase.auth.onAuthStateChange((event, session) => {
    // Внутри обработчика нельзя ждать другие вызовы Supabase — откладываем
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
      setTimeout(() => void onUser(session?.user ?? null), 0)
    }
  })
  document.addEventListener('visibilitychange', () => void requestSync())
  window.addEventListener('online', () => void requestSync())
  setInterval(() => void requestSync(), 5 * 60_000)
}

const AUTH_ERRORS: [RegExp, string][] = [
  [/invalid login credentials/i, 'Неверный email или пароль'],
  [/already registered|already been registered/i, 'Такой аккаунт уже есть — нажмите «Войти»'],
  [/password should be at least/i, 'Пароль должен быть не короче 6 символов'],
  [/email not confirmed/i, 'Email не подтверждён. Отключите подтверждение email в настройках Supabase'],
  [/unable to validate email|invalid email/i, 'Проверьте адрес email'],
  [/signups not allowed|signup is disabled/i, 'Регистрация новых аккаунтов выключена'],
  [/rate limit/i, 'Слишком много попыток, подождите минуту'],
  [/failed to fetch|network/i, 'Нет связи с облаком'],
]

function authError(message: string): Error {
  return new Error(AUTH_ERRORS.find(([re]) => re.test(message))?.[1] ?? message)
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw authError(error.message)
}

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
  if (error) throw authError(error.message)
  if (!data.session) throw new Error('Аккаунт создан, но требуется подтверждение email. Отключите его в настройках Supabase и нажмите «Войти»')
}

export async function signOut() {
  await supabase.auth.signOut()
}

export async function getLinkInfo() {
  return linkInfo(remote())
}

export async function linkWith(mode: LinkMode) {
  const user = state.user
  if (!user) throw new Error('Войдите в аккаунт')
  set({ phase: 'syncing', error: null })
  try {
    await linkAccount(remote(), user.id, mode)
    setRolloverHour(await getConfig('rolloverHour', 4))
    clearMediaCache()
    set({ phase: 'idle', lastAt: Date.now() })
  } catch (e) {
    set({ phase: 'link', error: e instanceof Error ? e.message : String(e) })
    throw e
  }
}
