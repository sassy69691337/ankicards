import { useEffect, useLayoutEffect, useRef, type ComponentType } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CirclePlus, Search, Settings } from 'lucide-react'
import { LogoMark } from '../ui/Logo'
import { cn } from '../ui/cn'

type TabId = 'decks' | 'add' | 'browse' | 'settings'

const StackIcon = ({ className }: { className?: string }) => <LogoMark simple className={className} />

const tabs: { id: TabId; root: string; label: string; icon: ComponentType<{ className?: string; strokeWidth?: number }> }[] = [
  { id: 'decks', root: '/', label: 'Колоды', icon: StackIcon },
  { id: 'add', root: '/add', label: 'Добавить', icon: CirclePlus },
  { id: 'browse', root: '/browse', label: 'Карточки', icon: Search },
  { id: 'settings', root: '/settings', label: 'Настройки', icon: Settings },
]

function tabOf(path: string): TabId {
  if (path.startsWith('/add')) return 'add'
  if (path.startsWith('/browse') || path.startsWith('/note/')) return 'browse'
  if (path.startsWith('/settings')) return 'settings'
  return 'decks'
}

/** Последний адрес внутри каждой вкладки: фильтры и вложенный экран сохраняются при переключении */
const lastUrl: Partial<Record<TabId, string>> = {}
/** Позиция прокрутки по адресу */
const scrollPos = new Map<string, number>()

function useKeyboardFlag() {
  useEffect(() => {
    const vv = window.visualViewport
    const root = document.documentElement
    const update = () => {
      const el = document.activeElement as HTMLElement | null
      const typing = !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|file|range)$/.test((el as HTMLInputElement).type)) || el.isContentEditable)
      const shrunk = vv ? window.innerHeight - vv.height > 120 : false
      // На сенсорных устройствах фокус в поле = клавиатура на экране
      const touch = window.matchMedia('(pointer: coarse)').matches
      root.dataset.kb = typing && (shrunk || touch) ? '1' : '0'
    }
    const later = () => setTimeout(update, 50)
    vv?.addEventListener('resize', update)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', later)
    return () => {
      vv?.removeEventListener('resize', update)
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', later)
      root.dataset.kb = '0'
    }
  }, [])
}

function useScrollMemory(key: string) {
  const keyRef = useRef(key)
  useEffect(() => {
    let raf = 0
    const on = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => scrollPos.set(keyRef.current, window.scrollY))
    }
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  useLayoutEffect(() => {
    keyRef.current = key
    const target = scrollPos.get(key) ?? 0
    window.scrollTo(0, 0)
    if (!target) return
    // Списки загружаются асинхронно — ждём, пока страница станет достаточно длинной
    let tries = 0
    let raf = 0
    const attempt = () => {
      if (document.documentElement.scrollHeight - window.innerHeight >= target || tries++ > 40) {
        window.scrollTo(0, target)
        return
      }
      raf = requestAnimationFrame(attempt)
    }
    attempt()
    return () => cancelAnimationFrame(raf)
  }, [key])
}

export function AppShell() {
  const loc = useLocation()
  const nav = useNavigate()
  const url = loc.pathname + loc.search
  const active = tabOf(loc.pathname)
  lastUrl[active] = url
  useKeyboardFlag()
  useScrollMemory(loc.pathname + loc.search)

  return (
    <div className="min-h-dvh">
      <main className="pb-[calc(var(--tabbar-space)+8px)]">
        <Outlet />
      </main>
      <nav
        aria-label="Разделы"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(12px,env(safe-area-inset-bottom))] transition-transform duration-200 in-data-[kb='1']:translate-y-[140%]"
      >
        <div className="glass pointer-events-auto mx-auto grid h-16 max-w-[480px] grid-cols-4 gap-1 rounded-[30px] p-1.5">
          {tabs.map(({ id, root, label, icon: Icon }) => {
            const isActive = id === active
            const to = isActive ? url : (lastUrl[id] ?? root)
            return (
              <Link
                key={id}
                to={to}
                aria-current={isActive ? 'page' : undefined}
                onClick={(e) => {
                  // Повторное нажатие на активную вкладку — к её началу
                  if (isActive && loc.pathname !== root) {
                    e.preventDefault()
                    nav(root)
                  } else if (isActive) {
                    e.preventDefault()
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }
                }}
                className={cn(
                  'flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-[24px] text-[11px] font-medium leading-[14px] transition duration-150 active:scale-95',
                  isActive ? 'bg-accent-soft text-accent-text' : 'text-muted hover:text-fg',
                )}
              >
                <Icon className="size-6" strokeWidth={isActive ? 2.3 : 1.9} />
                <span className="max-w-full truncate px-1">{label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
