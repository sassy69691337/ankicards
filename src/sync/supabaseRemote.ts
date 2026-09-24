import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { mimeOf } from '../io/files'
import type { PushRow, Remote, RemoteRow } from './engine'

// Публичные значения проекта: доступ к данным ограничен правилами RLS в базе
const SUPABASE_URL = 'https://kwzbhbzrczdgoxftxkgr.supabase.co'
const SUPABASE_KEY = 'sb_publishable_tUQQRBQCZ2I2HD68j2YeSw_0Fa4p4HV'
const BUCKET = 'media'

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'ankicards-auth' },
})

// Имя файла -> безопасный ключ хранилища (base64url) и обратно
function encodeName(name: string): string {
  let bin = ''
  for (const b of new TextEncoder().encode(name)) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeName(key: string): string {
  const bin = atob(key.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

function fail(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`${what}: ${error.message}`)
}

export class SupabaseRemote implements Remote {
  private userId: string

  constructor(userId: string) {
    this.userId = userId
  }

  async countRecords() {
    const { count, error } = await supabase.from('records').select('id', { count: 'exact', head: true }).eq('deleted', false)
    fail(error, 'Облако')
    return count ?? 0
  }

  async pull(after: number, device: string, limit: number): Promise<RemoteRow[]> {
    const { data, error } = await supabase
      .from('records')
      .select('kind,id,data,deleted,seq')
      .gt('seq', after)
      .neq('device', device)
      .order('seq')
      .limit(limit)
    fail(error, 'Загрузка из облака')
    return (data ?? []).map((r) => ({ ...r, seq: Number(r.seq) })) as RemoteRow[]
  }

  async push(rows: PushRow[], device: string) {
    const { error } = await supabase.from('records').upsert(
      rows.map((r) => ({ ...r, user_id: this.userId, device })),
      { onConflict: 'user_id,kind,id' },
    )
    fail(error, 'Отправка в облако')
  }

  async deleteAll() {
    const { error } = await supabase.from('records').delete().eq('user_id', this.userId)
    fail(error, 'Очистка облака')
  }

  private async listKeys(): Promise<string[]> {
    const keys: string[] = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.storage.from(BUCKET).list(this.userId, { limit: 1000, offset })
      fail(error, 'Список файлов')
      const page = (data ?? []).map((f) => f.name).filter((n) => !n.startsWith('.'))
      keys.push(...page)
      if ((data ?? []).length < 1000) break
    }
    return keys
  }

  async listMedia() {
    const out: string[] = []
    for (const key of await this.listKeys()) {
      try {
        out.push(decodeName(key))
      } catch {
        // чужой файл в папке — пропускаем
      }
    }
    return out
  }

  async uploadMedia(name: string, blob: Blob) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(`${this.userId}/${encodeName(name)}`, blob, { upsert: true, contentType: blob.type || mimeOf(name) })
    fail(error, `Загрузка ${name}`)
  }

  async downloadMedia(name: string) {
    const { data, error } = await supabase.storage.from(BUCKET).download(`${this.userId}/${encodeName(name)}`)
    fail(error, `Скачивание ${name}`)
    return data!
  }

  async deleteAllMedia() {
    const keys = await this.listKeys()
    for (let i = 0; i < keys.length; i += 500) {
      const { error } = await supabase.storage.from(BUCKET).remove(keys.slice(i, i + 500).map((k) => `${this.userId}/${k}`))
      fail(error, 'Удаление файлов')
    }
  }
}
