import { NavLink, Outlet } from 'react-router-dom'
import { Layers, Plus, Search, Settings } from 'lucide-react'
import { cn } from '../ui/cn'

const tabs = [
  { to: '/', label: 'Колоды', icon: Layers, end: true },
  { to: '/add', label: 'Добавить', icon: Plus, end: false },
  { to: '/browse', label: 'Карточки', icon: Search, end: false },
  { to: '/settings', label: 'Настройки', icon: Settings, end: false },
]

export function AppShell() {
  return (
    <div className="min-h-dvh">
      <main className="pb-[calc(env(safe-area-inset-bottom)+76px)]">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-surface/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <div className="mx-auto grid h-16 max-w-2xl grid-cols-4">
          {tabs.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition',
                  isActive ? 'text-accent' : 'text-muted hover:text-fg',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn('grid h-7 w-12 place-items-center rounded-full transition', isActive && 'bg-accent-soft')}>
                    <Icon className="size-[21px]" strokeWidth={isActive ? 2.4 : 2} />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
