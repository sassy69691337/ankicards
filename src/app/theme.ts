import { useSyncExternalStore } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'

const KEY = 'theme'
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

let pref = readPref()

const isDarkNow = () => pref === 'dark' || (pref === 'system' && mq.matches)

function apply() {
  const dark = isDarkNow()
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c0e13' : '#f5f6f8')
  listeners.forEach((l) => l())
}

mq.addEventListener('change', () => {
  if (pref === 'system') apply()
})

export function initTheme() {
  apply()
}

export function setThemePref(p: ThemePref) {
  pref = p
  try {
    localStorage.setItem(KEY, p)
  } catch {
    // приватный режим — тема просто не запомнится
  }
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
