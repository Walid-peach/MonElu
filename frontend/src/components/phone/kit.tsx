import type { ReactNode } from 'react'
import { positionStyle } from '@/lib/vote-position'

// The phone page kit: the small pieces every page's `md:hidden` layout is
// built from, so the redesigned pages share one look (the "MonÉlu pages
// mobiles" canvas). Server-safe (no hooks); colours come from the --dp-*
// tokens, so every piece follows the site theme in light and dark.

/** Small capitals above a title. `accent` is the red used for section labels. */
export function Eyebrow({ children, accent = true }: { children: ReactNode; accent?: boolean }) {
  return (
    <p
      className={`font-mono text-[11px] uppercase tracking-[0.12em] ${
        accent ? 'text-[color:var(--dp-red)]' : 'text-[color:var(--dp-text-secondary)]'
      }`}
    >
      {children}
    </p>
  )
}

/** A page's top block: eyebrow, the page's single `<h1>`, an optional lead. */
export function PhonePageHeader({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: ReactNode
  title: ReactNode
  lead?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-3 px-5 pb-4 pt-6">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="font-newsreader text-[32px] font-medium leading-[1.1] text-[color:var(--dp-text)]">{title}</h1>
      {lead && <p className="text-[15px] leading-relaxed text-[color:var(--dp-text-secondary)]">{lead}</p>}
      {children}
    </header>
  )
}

/** A section heading inside a page, with its eyebrow. */
export function PhoneSection({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string
  eyebrow?: ReactNode
  title?: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-3 px-4 pt-6">
      {(eyebrow || title) && (
        <div className="flex flex-col gap-1.5 px-1">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          {title && (
            <h2 className="font-newsreader text-[22px] font-medium leading-tight text-[color:var(--dp-text)]">{title}</h2>
          )}
        </div>
      )}
      {children}
    </section>
  )
}

export const cardClass =
  'rounded-[20px] border border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] text-[color:var(--dp-text)]'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`${cardClass} p-4 ${className}`}>{children}</div>
}

/** Pour / contre / abstention as one bar, in the site's position colours. */
export function SplitBar({
  pour,
  contre,
  abstention,
  height = 10,
}: {
  pour: number
  contre: number
  abstention: number
  height?: number
}) {
  const total = pour + contre + abstention
  if (total <= 0) return <div aria-hidden="true" className="rounded-full bg-[color:var(--dp-track-bg)]" style={{ height }} />
  return (
    <div aria-hidden="true" className="flex gap-0.5 overflow-hidden rounded-full" style={{ height }}>
      {pour > 0 && <span className="bg-[color:var(--dp-green)]" style={{ flex: pour }} />}
      {contre > 0 && <span className="bg-[color:var(--dp-red)]" style={{ flex: contre }} />}
      {abstention > 0 && <span className="bg-[color:var(--dp-abstention)]" style={{ flex: abstention }} />}
    </div>
  )
}

/** A deputy's (or a group's) position on a scrutin. */
export function PositionChip({ position, prefix }: { position: string; prefix?: string }) {
  const style = positionStyle(position)
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold"
      style={{ background: style.bg, color: style.color }}
    >
      {prefix ? `${prefix} · ` : ''}
      {style.label}
    </span>
  )
}

/** "Adopté" / "Rejeté", from the API's `result`. */
export function ResultBadge({ result }: { result: string | null | undefined }) {
  const adopted = result === 'adopté'
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${
        adopted
          ? 'bg-[color:var(--dp-badge-pos-bg)] text-[color:var(--dp-badge-pos-text)]'
          : 'bg-[color:var(--dp-badge-neg-bg)] text-[color:var(--dp-badge-neg-text)]'
      }`}
    >
      {adopted ? 'Adopté' : 'Rejeté'}
    </span>
  )
}

/** A figure and what it counts. */
export function StatTile({ value, label, emphasis = false }: { value: ReactNode; label: ReactNode; emphasis?: boolean }) {
  return (
    <div
      className={`flex flex-col gap-0.5 rounded-[14px] p-3 ${
        emphasis
          ? 'dp-dark bg-navy text-white dark:bg-[color:var(--dp-active-bg)]'
          : 'border border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] text-[color:var(--dp-text)]'
      }`}
    >
      <span className="font-serif text-[24px] leading-tight">{value}</span>
      <span className="text-xs text-[color:var(--dp-text-secondary)]">{label}</span>
    </div>
  )
}

/** A pill-shaped choice (filters, sort), pressed or not. */
export function Pill({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`h-10 flex-none whitespace-nowrap rounded-full px-3.5 text-sm font-semibold ${
        pressed
          ? 'bg-navy text-white dark:bg-[color:var(--dp-text)] dark:text-[color:var(--dp-page-bg)]'
          : 'border border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] text-[color:var(--dp-text)]'
      }`}
    >
      {children}
    </button>
  )
}
