'use client'
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { api } from '@/lib/api'
import { getFollowedDeputyId } from '@/lib/mon-depute'
import { isStandalone } from '@/lib/installState'
import { recordInstallEvent } from '@/lib/installEvents'
import { setTheme } from '@/lib/theme'
import { openGlobalSearch } from '../GlobalSearch'
import { useTheme } from '../ThemeProvider'
import { isActivePath } from './navigation'
import { useModalSheet } from './useModalSheet'

const noopSubscribe = () => () => {}

const iconProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

type PrimaryEntry = { href: string; label: string; description: string; icon: ReactNode }

/** The six places the site is for, in the order the iPhone app's tabs follow them. */
export const PRIMARY_ENTRIES: PrimaryEntry[] = [
  { href: '/', label: 'Accueil', description: "Cette semaine à l'Assemblée", icon: <svg {...iconProps}><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /></svg> },
  { href: '/deputes', label: 'Députés', description: 'Les 577 élus, vote par vote', icon: <svg {...iconProps}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg> },
  { href: '/votes', label: 'Votes', description: 'Chaque scrutin, en clair', icon: <svg {...iconProps}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 12 3 3 5-6" /></svg> },
  { href: '/agenda', label: 'Ordre du jour', description: 'Ce qui arrive en séance', icon: <svg {...iconProps}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg> },
  { href: '/quiz', label: 'Quiz', description: 'Qui vote comme vous ?', icon: <svg {...iconProps}><path d="M4 6l1.5 1.5L8 5M4 13l1.5 1.5L8 12" /><path d="M11 6h9M11 13h9M11 20h9" /></svg> },
  { href: '/chat', label: 'Demander', description: 'Une question, une phrase à vérifier', icon: <svg {...iconProps}><path d="M4 5h16v11H9l-5 4z" /><path d="M8 10h8" /></svg> },
]

export const SECONDARY_ENTRIES = [
  { href: '/deputes/comparer', label: 'Comparer deux députés' },
  { href: '/a-propos', label: 'À propos' },
  { href: '/methodologie', label: 'Méthodologie' },
  { href: '/donnees', label: 'Données' },
  { href: '/developpeurs', label: 'Développeurs' },
  { href: '/contact', label: 'Contact' },
]

/** The followed deputy's name, fetched the first time the drawer opens. */
function useFollowedDeputyName(open: boolean): string | null {
  const [name, setName] = useState<string | null>(null)
  const [asked, setAsked] = useState(false)
  if (open && !asked) setAsked(true)
  useEffect(() => {
    if (!asked) return
    const id = getFollowedDeputyId()
    if (!id) return
    let cancelled = false
    api.deputies.get(id).then(d => {
      if (!cancelled) setName(d.full_name)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [asked])
  return name
}

/**
 * The phone browser's menu (H1): opened from the top bar's ☰ or the homepage
 * hero's. Search, "Mon député", the six main places, the pages about MonÉlu,
 * the theme, and the install card. The installed app uses BottomNav instead.
 */
export function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const panelRef = useRef<HTMLDivElement>(null)
  const { theme } = useTheme()
  const standalone = useSyncExternalStore(noopSubscribe, isStandalone, () => false)
  const deputyName = useFollowedDeputyName(open)
  useModalSheet(open, onClose, panelRef)

  const tabIndex = open ? undefined : -1
  const isCurrent = (href: string) => (href === '/' ? pathname === '/' : isActivePath(pathname, href))

  return (
    <div className={`fixed inset-0 z-[60] md:hidden ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div
        className="absolute inset-0 bg-black/50 transition-opacity duration-200"
        style={{ opacity: open ? 1 : 0 }}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        id="menu-mobile"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="absolute inset-y-0 left-0 flex w-[86%] max-w-[340px] flex-col bg-white text-navy shadow-2xl transition-transform duration-200 ease-out dark:bg-[color:var(--dp-card-bg)] dark:text-[color:var(--dp-text)]"
        style={{ transform: open ? 'translateX(0)' : 'translateX(-100%)' }}
      >
        <div className="flex h-[60px] flex-none items-center justify-between border-b border-[color:var(--dp-border)] pl-5 pr-2">
          <Link href="/" onClick={onClose} tabIndex={tabIndex} className="font-serif text-[23px]">
            Mon<span className="text-red-civic">É</span>lu
          </Link>
          <button
            type="button"
            onClick={onClose}
            tabIndex={tabIndex}
            aria-label="Fermer le menu"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-off dark:bg-white/10"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4">
          <button
            type="button"
            tabIndex={tabIndex}
            onClick={() => { onClose(); openGlobalSearch() }}
            className="flex h-12 items-center gap-2.5 rounded-[14px] bg-gray-off px-3.5 text-left text-[15px] text-[color:var(--dp-text-secondary)] dark:bg-white/10"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" />
            </svg>
            Un député, un vote, une loi
          </button>

          <Link
            href="/mon-depute"
            onClick={onClose}
            tabIndex={tabIndex}
            className="flex items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-[color:var(--dp-border)] p-3"
          >
            <span aria-hidden="true" className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[color:var(--dp-badge-neg-bg)] text-[color:var(--dp-badge-neg-text)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>
            </span>
            <span className="flex flex-1 flex-col">
              <span className="text-[15px] font-bold">Mon député</span>
              <span className="text-xs text-[color:var(--dp-text-secondary)]">{deputyName ?? 'Le trouver avec votre code postal'}</span>
            </span>
            <span aria-hidden="true" className="text-[color:var(--dp-text-muted)]">→</span>
          </Link>

          <ul className="flex flex-col gap-0.5">
            {PRIMARY_ENTRIES.map(entry => {
              const current = isCurrent(entry.href)
              return (
                <li key={entry.href}>
                  <Link
                    href={entry.href}
                    onClick={onClose}
                    tabIndex={tabIndex}
                    aria-current={current ? 'page' : undefined}
                    className={`flex min-h-14 items-center gap-3 rounded-[14px] px-2 py-1.5 ${current ? 'bg-gray-off dark:bg-white/10' : ''}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] ${
                        current ? 'bg-navy text-white dark:bg-white dark:text-navy' : 'bg-[#F1EFEA] text-navy dark:bg-white/10 dark:text-[color:var(--dp-text)]'
                      }`}
                    >
                      {entry.icon}
                    </span>
                    <span className="flex flex-col">
                      <span className="text-base font-bold">{entry.label}</span>
                      <span className="text-xs text-[color:var(--dp-text-secondary)]">{entry.description}</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>

          <div className="flex flex-col gap-1.5 px-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--dp-text-secondary)]">MonÉlu</span>
            <div className="grid grid-cols-2">
              {SECONDARY_ENTRIES.map(entry => (
                <Link key={entry.href} href={entry.href} onClick={onClose} tabIndex={tabIndex} className="flex min-h-10 items-center text-sm">
                  {entry.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2.5 px-2">
            <span className="text-sm font-medium">Apparence</span>
            <div role="group" aria-label="Apparence" className="flex rounded-[11px] bg-[#EDECEA] p-[3px] dark:bg-white/10">
              {(['light', 'dark'] as const).map(value => {
                const on = theme === value
                return (
                  <button
                    key={value}
                    type="button"
                    tabIndex={tabIndex}
                    aria-pressed={on}
                    onClick={() => setTheme(value)}
                    className={`h-9 rounded-lg px-3 text-[13px] ${on ? 'bg-white font-bold text-navy' : 'font-medium'}`}
                  >
                    {value === 'light' ? 'Clair' : 'Sombre'}
                  </button>
                )
              })}
            </div>
          </div>

          {!standalone && (
            <Link
              href="/application"
              tabIndex={tabIndex}
              onClick={() => { recordInstallEvent('menu_entry_tap'); onClose() }}
              className="dp-dark mt-1 flex items-center gap-3 rounded-[18px] bg-navy p-3.5 text-white"
            >
              <span aria-hidden="true" className="flex h-11 w-11 flex-none -rotate-6 items-center justify-center rounded-xl bg-gray-off font-serif text-[22px] text-navy">
                M<span className="text-red-civic">É</span>
              </span>
              <span className="flex flex-1 flex-col">
                <span className="text-[15px] font-bold">Installer l&apos;application</span>
                <span className="text-xs text-[color:var(--dp-text-secondary)]">Gratuit, sans compte</span>
              </span>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
