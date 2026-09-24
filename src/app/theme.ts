import { useSyncExternalStore } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'

const KEY = 'theme'
const SOLID_KEY = 'reduceTransparency'
const listeners = new Set<() => void>()
const mq = window.matchMedia('(prefers-color-scheme: dark)')

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

function readSolid(): boolean {
  try {
    return localStorage.getItem(SOLID_KEY) === '1'
  } catch {
    return false
  }
}

let pref = readPref()
let solid = readSolid()

const isDarkNow = () => pref === 'dark' || (pref === 'system' && mq.matches)

function apply() {
  const dark = isDarkNow()
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.classList.toggle('solid', solid)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#191a20' : '#f7f5f2')
  listeners.forEach((l) => l())
}

mq.addEventListener('change', () => {
  if (pref === 'system') apply()
})

export function initTheme() {
  apply()
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // приватный режим — настройка просто не запомнится
  }
}

export function setThemePref(p: ThemePref) {
  pref = p
  store(KEY, p)
  apply()
}

/** «Уменьшить прозрачность»: стекло заменяется непрозрачными поверхностями */
export function setReduceTransparency(v: boolean) {
  solid = v
  store(SOLID_KEY, v ? '1' : '0')
  apply()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export const useThemePref = () => useSyncExternalStore(subscribe, () => pref)
export const useIsDark = () => useSyncExternalStore(subscribe, isDarkNow)
export const useReduceTransparency = () => useSyncExternalStore(subscribe, () => solid)
