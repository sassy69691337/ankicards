import type { Deck } from '../../db/types'

/** <option> для колод с отступами по вложенности */
export function DeckOptionsList({ decks }: { decks: Deck[] }) {
  const sorted = [...decks].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  return (
    <>
      {sorted.map((d) => {
        const parts = d.name.split('::')
        return (
          <option key={d.id} value={d.id}>
            {'   '.repeat(parts.length - 1) + parts[parts.length - 1]}
          </option>
        )
      })}
    </>
  )
}
