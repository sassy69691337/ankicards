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
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Inter, Roboto, sans-serif;
  font-size: 22px;
  line-height: 1.45;
  text-align: center;
  color: var(--fg);
  overflow-wrap: anywhere;
}
.card.nightMode, .card.night_mode { background-color: transparent !important; color: var(--fg) !important; }
img { max-width: 100%; height: auto; border-radius: 12px; }
hr { border: 0; border-top: 1px solid var(--line); margin: 28px 0; }
a { color: var(--accent-text); }
.cloze { font-weight: 700; color: var(--accent-text); }
.typeans {
  box-sizing: border-box; width: min(100%, 380px); margin-top: 18px; padding: 12px 16px; min-height: 52px;
  font: inherit; font-size: 18px; text-align: center; color: var(--fg);
  background: var(--surface); border: 1px solid var(--input-border); border-radius: 14px; outline: none;
}
.typeans:focus { border-color: var(--accent-text); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent); }
.typeans-result { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 18px; line-height: 1.9; }
.typeGood { background: rgb(34 197 94 / .22); border-radius: 4px; }
.typeBad { background: rgb(239 68 68 / .25); border-radius: 4px; }
.typeMissed { background: rgb(148 163 184 / .35); border-radius: 4px; }
.typeArrow { color: var(--muted); }
.snd, .tts {
  display: inline-grid; place-items: center; width: 44px; height: 44px; margin: 4px; padding: 0;
  border: 0; border-radius: 999px; color: var(--accent-text); background: var(--accent-soft);
  cursor: pointer; vertical-align: middle;
}
.snd svg, .tts svg { width: 20px; height: 20px; }
.hint-btn { font-size: 15px; }
.hint { display: none; margin-top: 6px; }
.hint.open { display: block; }
`

// Типографика Coral Glass для встроенных типов: слово 36/44 (длинное — мельче, без обрезания),
// перевод ниже, пример обычным текстом. Пользовательский CSS типов не переопределяется
const CORAL_CSS = `
.card { font-size: 22px; line-height: 32px; }
.front { font-size: 36px; line-height: 44px; font-weight: 700; letter-spacing: -0.01em; }
.front.long { font-size: 28px; line-height: 36px; }
.front.longer { font-size: 22px; line-height: 32px; font-weight: 600; letter-spacing: 0; }
.back { font-size: 26px; line-height: 34px; font-weight: 700; }
.back .example { margin-top: 16px; font-size: 18px; line-height: 26px; font-weight: 400; font-style: normal; opacity: 1; color: var(--fg); }
`

const ANSWER_HR = /<hr\s+id=["']?answer["']?\s*\/?>/i

/** Лицевая часть и ответ в отдельных обёртках: при раскрытии слово остаётся на месте, ответ добавляется ниже */
function wrapSides(html: string): string {
  const m = ANSWER_HR.exec(html)
  const front = m ? html.slice(0, m.index) : html
  const len = front.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim().length
  const size = len > 40 ? ' longer' : len > 14 ? ' long' : ''
  if (!m) return `<div class="front${size}">${html}</div>`
  return `<div class="front${size}">${front}</div>${m[0]}<div class="back">${html.slice(m.index + m[0].length)}</div>`
}

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
  coral = false,
  onRoot,
  onEnter,
}: {
  html: string
  css: string
  dark: boolean
  /** Встроенный тип заметки — типографика Coral Glass */
  coral?: boolean
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
    const frag = DOMPurify.sanitize(prepare(coral ? wrapSides(html) : html), {
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
    style.textContent = coral ? `${CARD_CSS}\n${css}\n${CORAL_CSS}` : `${CARD_CSS}\n${css}`
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
  }, [html, css, dark, coral])

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
