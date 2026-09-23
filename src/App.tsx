import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/db'

export default function App() {
  const decks = useLiveQuery(() => db.decks.orderBy('name').toArray(), [])
  const [name, setName] = useState('')

  async function addDeck(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    await db.decks.add({ name: trimmed, createdAt: Date.now() } as never)
    setName('')
  }

  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="mb-4 text-2xl font-bold">AnkiCards</h1>

      <form onSubmit={addDeck} className="mb-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название колоды"
          className="flex-1 rounded border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600"
        />
        <button className="rounded bg-blue-600 px-4 py-2 font-medium text-white">Добавить</button>
      </form>

      {decks?.length === 0 && <p className="text-slate-500">Колод пока нет.</p>}
      <ul className="divide-y divide-slate-200 dark:divide-slate-700">
        {decks?.map((d) => (
          <li key={d.id} className="flex items-center justify-between py-3">
            <span>{d.name}</span>
            <button onClick={() => db.decks.delete(d.id)} className="text-sm text-red-500">
              Удалить
            </button>
          </li>
        ))}
      </ul>
    </main>
  )
}
