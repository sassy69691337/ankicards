import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// BASE_PATH задаётся в CI для GitHub Pages (например /ankicards/)
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  build: { chunkSizeWarningLimit: 900 },
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toLocaleDateString('ru-RU')),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,webmanifest}'],
      },
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'AnkiCards',
        short_name: 'AnkiCards',
        description: 'Карточки для изучения слов',
        lang: 'ru',
        display: 'standalone',
        start_url: base,
        scope: base,
        background_color: "#f7f5f2",
        theme_color: "#f7f5f2",
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
