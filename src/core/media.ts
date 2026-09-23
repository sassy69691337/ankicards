import { db } from '../db/db'

const urlCache = new Map<string, string>()

export async function mediaUrl(name: string): Promise<string | null> {
  const cached = urlCache.get(name)
  if (cached) return cached
  const file = await db.media.get(name)
  if (!file) return null
  const url = URL.createObjectURL(file.blob)
  urlCache.set(name, url)
  return url
}

export function clearMediaCache() {
  urlCache.forEach((u) => URL.revokeObjectURL(u))
  urlCache.clear()
}

export function soundNames(html: string): string[] {
  return [...html.matchAll(/\[sound:([^\]]+)\]/g)].map((m) => m[1])
}

let current: HTMLAudioElement | null = null
let token = 0

export function stopAudio() {
  token++
  current?.pause()
  current = null
}

/** Проигрывает файлы по очереди */
export async function playSounds(names: string[]) {
  stopAudio()
  const my = token
  for (const name of names) {
    const url = await mediaUrl(name)
    if (!url || my !== token) continue
    const audio = new Audio(url)
    current = audio
    try {
      await audio.play()
      await new Promise<void>((resolve) => {
        audio.onended = () => resolve()
        audio.onpause = () => resolve()
        audio.onerror = () => resolve()
      })
    } catch {
      // iOS блокирует автозапуск без жеста пользователя — просто пропускаем
    }
    if (my !== token) return
  }
}
