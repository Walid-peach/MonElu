'use client'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { openGlobalSearch } from './GlobalSearch'
import { MobileDrawer } from './nav/MobileDrawer'
import { isStandalone } from '@/lib/installState'
import { recordInstallEvent } from '@/lib/installEvents'
import { OPEN_MOBILE_MENU_EVENT } from '@/lib/mobileMenu'

/** How far the homepage scrolls before the bar slides in: past the hero's own buttons. */
export const HOME_BAR_SCROLL_Y = 320

const noopSubscribe = () => () => {}

function subscribeToScroll(onChange: () => void) {
  window.addEventListener('scroll', onChange, { passive: true })
  return () => window.removeEventListener('scroll', onChange)
}

const scrolledPastHero = () => window.scrollY > HOME_BAR_SCROLL_Y

/**
 * The phone browser's top bar (H1): ☰, the wordmark, search, and "Installer".
 * On the homepage it stays out of the way until the hero has scrolled past,
 * since the hero carries its own ☰ and install button; everywhere else it is
 * always there. The installed web app hides it (`installed:hidden`) and keeps
 * BottomNav, so the two never share a screen.
 */
export function MobileTopBar() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const standalone = useSyncExternalStore(noopSubscribe, isStandalone, () => false)
  const pastHero = useSyncExternalStore(subscribeToScroll, scrolledPastHero, () => false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  useEffect(() => {
    const open = () => setMenuOpen(true)
    window.addEventListener(OPEN_MOBILE_MENU_EVENT, open)
    return () => window.removeEventListener(OPEN_MOBILE_MENU_EVENT, open)
  }, [])

  if (pathname.startsWith('/embed')) return null

  const isHome = pathname === '/'
  const shown = !isHome || pastHero

  return (
    <>
      <header
        data-print-hide
        data-mobile-top-bar
        aria-hidden={!shown}
        className={`z-40 flex h-[60px] items-center gap-1.5 border-b border-[color:var(--dp-border)] bg-white pl-1.5 pr-3 text-navy shadow-[0_6px_18px_rgba(13,31,60,0.08)] transition-transform duration-300 dark:bg-[color:var(--dp-card-bg)] dark:text-[color:var(--dp-text)] md:hidden installed:hidden ${
          isHome ? 'fixed inset-x-0 top-0' : 'sticky top-0'
        } ${shown ? 'translate-y-0' : 'invisible -translate-y-full'}`}
      >
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Ouvrir le menu"
          aria-expanded={menuOpen}
          aria-controls="menu-mobile"
          className="flex h-11 w-11 items-center justify-center rounded-xl"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h10" />
          </svg>
        </button>
        <Link href="/" className="flex-1 font-serif text-[23px]">
          Mon<span className="text-red-civic">É</span>lu
        </Link>
        <button
          type="button"
          onClick={openGlobalSearch}
          aria-label="Rechercher un député, un vote"
          className="flex h-11 w-11 items-center justify-center rounded-full"
        >
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
        </button>
        {!standalone && (
          <Link
            href="/application"
            onClick={() => recordInstallEvent('menu_entry_tap')}
            className="flex h-[38px] items-center gap-1.5 rounded-full bg-red-civic px-3.5 text-sm font-bold text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
            </svg>
            Installer
          </Link>
        )}
      </header>
      <MobileDrawer open={menuOpen} onClose={closeMenu} />
    </>
  )
}
