import { useEffect, useLayoutEffect, useRef } from 'react'
import DOMPurify from 'dompurify'
import { mediaUrl, playSounds } from '../../core/media'
import { speak } from '../../core/tts'
import { SPEAKER_ICON } from '../../core/template'
import { escapeHtml } from '../../core/text'

// Базовые стили карточки. CSS-переменные темы наследуются в Shadow DOM.
const CARD_CSS = `
:host { display: block; }
.card {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 22px;
  line-height: 1.5;
  text-align: center;
  color: var(--fg);
  overflow-wrap: anywhere;
}
.card.nightMode, .card.night_mode { background-color: transparent !important; color: var(--fg) !important; }
img { max-width: 100%; height: auto; border-radius: 12px; }
hr { border: 0; border-top: 1px solid var(--line); margin: 24px 0; }
a { color: var(--accent); }
.cloze { font-weight: 700; color: #4f46e5; }
.nightMode .cloze, .nightMode.card .cloze { color: #a5b4fc; }
.typeans {
  box-sizing: border-box; width: min(100%, 380px); margin-top: 18px; padding: 12px 16px;
  font: inherit; font-size: 18px; text-align: center; color: var(--fg);
  background: var(--surface-2); border: 1px solid var(--line); border-radius: 14px; outline: none;
}
.typeans:focus { border-color: var(--accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent); }
.typeans-result { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 18px; line-height: 1.9; }
.typeGood { background: rgb(34 197 94 / .22); border-radius: 4px; }
.typeBad { background: rgb(239 68 68 / .25); border-radius: 4px; }
.typeMissed { background: rgb(148 163 184 / .35); border-radius: 4px; }
.typeArrow { color: var(--muted); }
.snd, .tts {
  display: inline-grid; place-items: center; width: 42px; height: 42px; margin: 4px; padding: 0;
  border: 0; border-radius: 999px; color: var(--accent); background: var(--accent-soft);
  cursor: pointer; vertical-align: middle;
}
.snd svg, .tts svg { width: 20px; height: 20px; }
.hint-btn { font-size: 15px; }
.hint { display: none; margin-top: 6px; }
.hint.open { display: block; }
`

function prepare(html: string): string {
  return html.replace(
    /\[sound:([^\]]+)\]/g,
    (_m, name: string) => `<button type="button" class="snd" data-sound="${escapeHtml(name)}" aria-label="Воспроизвести">${SPEAKER_ICON}</button>`,
  )
}

export function CardView({
  html,
  css,
  dark,
  onRoot,
  onEnter,
}: {
  html: string
  css: string
  dark: boolean
  onRoot?: (root: ShadowRoot) => void
  onEnter?: () => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const enterRef = useRef(onEnter)
  const rootCb = useRef(onRoot)
  useEffect(() => {
    enterRef.current = onEnter
    rootCb.current = onRoot
  })

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
    const frag = DOMPurify.sanitize(prepare(html), {
      RETURN_DOM_FRAGMENT: true,
      FORCE_BODY: true,
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'base', 'meta', 'link'],
    })
    // Относительные ссылки на картинки — это файлы из медиатеки
    frag.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src')
      if (src && !/^(https?:|data:|blob:)/i.test(src)) {
        img.removeAttribute('src')
        img.dataset.media = src
      }
    })
    const style = document.createElement('style')
    style.textContent = `${CARD_CSS}\n${css}`
    const wrap = document.createElement('div')
    wrap.className = dark ? 'card nightMode night_mode' : 'card'
    wrap.append(frag)
    root.replaceChildren(style, wrap)
    root.querySelectorAll<HTMLImageElement>('img[data-media]').forEach((img) => {
      let name = img.dataset.media ?? ''
      try {
        name = decodeURIComponent(name)
      } catch {
        // имя с символом % — оставляем как есть
      }
      void mediaUrl(name).then((u) => {
        if (u) img.src = u
      })
    })
    rootCb.current?.(root)
  }, [html, css, dark])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
    const onClick = (e: Event) => {
      const el = (e.target as Element).closest?.('.snd, .tts, .hint-btn') as HTMLElement | null
      if (!el) return
      e.preventDefault()
      if (el.classList.contains('snd')) void playSounds([el.dataset.sound ?? ''])
      else if (el.classList.contains('tts')) speak(el.dataset.text ?? '', el.dataset.lang ?? 'en-US')
      else el.nextElementSibling?.classList.toggle('open')
    }
    const onKey = (e: Event) => {
      const ke = e as KeyboardEvent
      if (ke.key === 'Enter' && (ke.target as Element).matches?.('input.typeans')) {
        ke.preventDefault()
        enterRef.current?.()
      }
    }
    root.addEventListener('click', onClick)
    root.addEventListener('keydown', onKey)
    return () => {
      root.removeEventListener('click', onClick)
      root.removeEventListener('keydown', onKey)
    }
  }, [])

  return <div ref={hostRef} />
}
