import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { getConfig, requestPersistentStorage } from './db/db'
import { ensureSeed } from './db/seed'
import { setRolloverHour } from './core/time'
import { initTheme } from './app/theme'
import { initCloud } from './sync/cloud'

initTheme()
const root = createRoot(document.getElementById('root')!)

async function boot() {
  try {
    await ensureSeed()
    setRolloverHour(await getConfig('rolloverHour', 4))
    void requestPersistentStorage()
    initCloud()
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  } catch (e) {
    root.render(<div style={{ padding: 24 }}>Не удалось открыть базу данных: {String(e)}</div>)
  }
}

void boot()
