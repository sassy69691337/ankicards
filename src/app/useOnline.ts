import { useSyncExternalStore } from 'react'

function subscribe(l: () => void) {
  window.addEventListener('online', l)
  window.addEventListener('offline', l)
  return () => {
    window.removeEventListener('online', l)
    window.removeEventListener('offline', l)
  }
}

export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine)
