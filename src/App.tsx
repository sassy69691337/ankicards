import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './app/AppShell'
import DecksPage from './features/decks/DecksPage'
import DeckPage from './features/decks/DeckPage'
import DeckOptionsPage from './features/decks/DeckOptionsPage'
import StudyPage from './features/study/StudyPage'
import AddNotePage from './features/editor/AddNotePage'
import EditNotePage from './features/editor/EditNotePage'
import BrowsePage from './features/browser/BrowsePage'
import SettingsPage from './features/settings/SettingsPage'
import ImportPage from './features/import/ImportPage'
import { DialogHost } from './ui/dialogs'
import { ToastHost } from './ui/toast'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DecksPage />} />
          <Route path="deck/:id" element={<DeckPage />} />
          <Route path="deck/:id/options" element={<DeckOptionsPage />} />
          <Route path="add" element={<AddNotePage />} />
          <Route path="browse" element={<BrowsePage />} />
          <Route path="note/:id" element={<EditNotePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="import" element={<ImportPage />} />
        </Route>
        <Route path="deck/:id/study" element={<StudyPage />} />
      </Routes>
      <DialogHost />
      <ToastHost />
    </HashRouter>
  )
}
