import { useId } from 'react'
import { cn } from './cn'

// Геометрия знака (viewBox 48×48): задняя карточка смещена вверх-влево и наклонена,
// передняя — вертикальная, с загибом в правом верхнем углу
const FRONT = 'M22 13H32L41 22V38A5 5 0 0 1 36 43H22A5 5 0 0 1 17 38V18A5 5 0 0 1 22 13Z'
const FOLD = 'M32 13V18A4 4 0 0 0 36 22H41'
const BACK = { x: 6, y: 7, width: 22, height: 30, rx: 5, transform: 'rotate(-13 17 22)' }

/** Плоский знак AnkiCards в цвете currentColor. `simple` — без загиба, для 16 px */
export function LogoMark({ className, simple, title }: { className?: string; simple?: boolean; title?: string }) {
  const id = useId()
  return (
    <svg viewBox="0 0 48 48" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <mask id={`${id}b`} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <rect width="48" height="48" fill="white" />
          <path d={FRONT} fill="black" stroke="black" strokeWidth="5" strokeLinejoin="round" />
        </mask>
        <mask id={`${id}f`} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <rect width="48" height="48" fill="white" />
          {!simple && <path d={FOLD} fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" />}
        </mask>
      </defs>
      <rect {...BACK} fill="currentColor" mask={`url(#${id}b)`} />
      <path d={FRONT} fill="currentColor" mask={`url(#${id}f)`} />
    </svg>
  )
}

/** Знак с названием. Текст сохраняет регистр: AnkiCards */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-bold tracking-tight', className)}>
      <LogoMark className="size-[1.4em] text-accent" />
      AnkiCards
    </span>
  )
}
