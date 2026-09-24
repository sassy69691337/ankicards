import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, FileUp, FolderPlus, Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { db } from '../../db/db'
import { createDeck, deleteDeck, leafName, renameDeck, subtreeIds } from '../../db/collection'
import type { Deck } from '../../db/types'
import { cardsWord, errMsg, plural } from '../../core/format'
import { ActionSheet } from '../../ui/Sheet'
import { confirmDialog, promptDialog } from '../../ui/dialogs'
import { toast } from '../../ui/toast'
import { ExportSheet } from './ExportSheet'

export async function askNewDeck(parent?: string): Promise<number | null> {
  const name = await promptDialog({
    title: parent ? 'Новая подколода' : 'Новая колода',
    message: parent ? `Внутри «${parent}»` : 'Для подколоды используйте «::», например English::Глаголы',
    placeholder: 'Название',
    confirmText: 'Создать',
  })
  if (!name?.trim()) return null
  try {
    return await createDeck(parent ? `${parent}::${name}` : name)
  } catch (e) {
    toast(errMsg(e), 'error')
    return null
  }
}

/** Меню действий колоды: безопасные действия сверху, удаление отдельно и с подтверждением */
export function useDeckMenu(onDeleted?: () => void) {
  const nav = useNavigate()
  const [deck, setDeck] = useState<Deck | null>(null)
  const [exporting, setExporting] = useState<Deck | null>(null)

  async function onRename(d: Deck) {
    const name = await promptDialog({ title: 'Переименовать колоду', defaultValue: d.name, confirmText: 'Сохранить' })
    if (name == null) return
    try {
      await renameDeck(d, name)
    } catch (e) {
      toast(errMsg(e), 'error')
    }
  }

  async function onDelete(d: Deck) {
    const ids = await subtreeIds(d)
    const cards = await db.cards.where('deckId').anyOf(ids).count()
    const subs = ids.length - 1
    const ok = await confirmDialog({
      title: `Удалить «${d.name.split('::').join(' › ')}»?`,
      message: `Будут удалены колода${subs ? `, ${subs} ${plural(subs, ['подколода', 'подколоды', 'подколод'])}` : ''} и ${cards} ${cardsWord(cards)} вместе с прогрессом. Это нельзя отменить.`,
      confirmText: 'Удалить колоду',
      danger: true,
    })
    if (!ok) return
    await deleteDeck(d)
    toast('Колода удалена')
    onDeleted?.()
  }

  const element = (
    <>
      <ActionSheet
        open={!!deck}
        onClose={() => setDeck(null)}
        title={deck ? leafName(deck.name) : undefined}
        actions={
          deck
            ? [
                { label: 'Добавить слово', icon: <Plus />, onSelect: () => nav(`/add?deck=${deck.id}`) },
                { label: 'Настройки колоды', icon: <SlidersHorizontal />, onSelect: () => nav(`/deck/${deck.id}/options`) },
                { label: 'Переименовать', icon: <Pencil />, onSelect: () => void onRename(deck) },
                { label: 'Создать подколоду', icon: <FolderPlus />, onSelect: () => void askNewDeck(deck.name) },
                { label: 'Импорт в эту колоду', icon: <FileUp />, onSelect: () => nav(`/import?deck=${deck.id}`) },
                { label: 'Экспорт колоды', icon: <Download />, onSelect: () => setExporting(deck) },
                { label: 'Удалить колоду', icon: <Trash2 />, danger: true, onSelect: () => void onDelete(deck) },
              ]
            : []
        }
      />
      {exporting && <ExportSheet open onClose={() => setExporting(null)} deckId={exporting.id} deckName={exporting.name} />}
    </>
  )
  return { open: setDeck, element }
}
