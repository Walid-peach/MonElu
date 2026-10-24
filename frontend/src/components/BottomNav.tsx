'use client'
import { useState, useSyncExternalStore, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MobileMenu, type MobileMenuVariant } from './MobileMenu'
import { exploreSections, isActivePath, sectionHrefs } from './nav/navigation'
import { isStandalone } from '@/lib/installState'

/** Set once the visitor has opened the Menu, which carries the install entry. */
export const MENU_SEEN_STORAGE_KEY = 'monelu-menu-seen'

const noopSubscribe = () => () => {}

function readMenuSeen(): boolean {
  try {
    return window.localStorage.getItem(MENU_SEEN_STORAGE_KEY) === '1'
  } catch {
    return true
  }
}

const iconProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const HomeIcon = <svg {...iconProps}><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></svg>
const ExploreIcon = <svg {...iconProps}><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></svg>
const QuizIcon = (
  <svg {...iconProps} width={26} height={26} strokeWidth={2}>
    <path d="M4 6l1.5 1.5L8 5M4 13l1.5 1.5L8 12" /><path d="M11 6h9M11 13h9M11 20h9" /><path d="M4 20h4" />
  </svg>
)
const AskIcon = <svg {...iconProps}><path d="M4 5h16v11H9l-5 4z" /><path d="M8 10h8" /><path d="M8 13h5" /></svg>
const MenuIcon = <svg {...iconProps}><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></svg>

const exploreHrefs = sectionHrefs(exploreSections)

function TabContent({ icon, label, active }: { icon: ReactNode; label: string; active: boolean }) {
  return (
    <>
      <span
        className={`relative flex h-[30px] w-[52px] items-center justify-center rounded-full transition-colors ${
          active ? 'bg-navy/[0.08] dark:bg-white/10' : ''
        }`}
      >
        {icon}
      </span>
      <span className={`text-[11px] ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
    </>
  )
}

const tabClass = (active: boolean) =>
  `flex min-w-0 flex-1 flex-col items-center justify-center gap-[3px] h-14 transition-colors ${
    active ? 'text-navy dark:text-[color:var(--dp-text)]' : 'text-[color:var(--dp-text-muted)]'
  }`

/**
 * The phone tab bar (below `md`): the iPhone app's four tabs (ADR-041) with
 * Quiz raised in the centre, plus a Menu button. Explorer and Menu open the
 * two halves of `MobileMenu` rather than routes of their own.
 */
export function BottomNav() {
  const path = usePathname()
  const [sheet, setSheet] = useState<MobileMenuVariant | null>(null)
  const standalone = useSyncExternalStore(noopSubscribe, isStandalone, () => false)
  // Server and first paint assume "seen", so the dot never flashes in.
  const menuSeen = useSyncExternalStore(noopSubscribe, readMenuSeen, () => true)

  if (path.startsWith('/embed')) return null

  const close = () => setSheet(null)
  const homeActive = path === '/'
  const exploreActive = sheet === 'explore' || (sheet === null && exploreHrefs.some(h => isActivePath(path, h)))
  const quizActive = isActivePath(path, '/quiz')
  const askActive = isActivePath(path, '/chat') || isActivePath(path, '/verifier')
  const menuActive = sheet === 'menu'
  // A dot on Menu until it has been opened once, while the app is not installed:
  // the install entry lives in that sheet, not in a separate banner.
  const showMenuDot = !standalone && !menuSeen

  function openMenu() {
    try {
      window.localStorage.setItem(MENU_SEEN_STORAGE_KEY, '1')
    } catch {
      // Private mode or blocked storage: the dot simply stays.
    }
    setSheet(sheet === 'menu' ? null : 'menu')
  }

  return (
    <>
      <MobileMenu variant="explore" open={sheet === 'explore'} onClose={close} />
      <MobileMenu variant="menu" open={sheet === 'menu'} onClose={close} />
      <nav
        data-print-hide
        aria-label="Navigation principale"
        className="md:hidden fixed inset-x-3 z-50 bottom-[calc(0.75rem+env(safe-area-inset-bottom))]"
      >
        <div className="flex h-[68px] items-center gap-1 rounded-3xl border border-[color:var(--dp-border)] bg-white px-2 shadow-[0_10px_30px_rgba(13,31,60,0.16)] dark:bg-[color:var(--dp-card-bg)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
          <Link href="/" onClick={close} aria-current={homeActive ? 'page' : undefined} className={tabClass(homeActive)}>
            <TabContent icon={HomeIcon} label="Accueil" active={homeActive} />
          </Link>

          <button
            type="button"
            onClick={() => setSheet(sheet === 'explore' ? null : 'explore')}
            aria-expanded={sheet === 'explore'}
            aria-haspopup="dialog"
            className={tabClass(exploreActive)}
          >
            <TabContent icon={ExploreIcon} label="Explorer" active={exploreActive} />
          </button>

          <div className="relative flex h-14 min-w-0 flex-1 flex-col items-center justify-end">
            <Link
              href="/quiz"
              onClick={close}
              aria-current={quizActive ? 'page' : undefined}
              aria-label="Quiz"
              className="absolute -top-[30px] flex h-[62px] w-[62px] items-center justify-center rounded-full border-4 border-[color:var(--dp-page-bg)] bg-red-civic text-white shadow-[0_8px_20px_rgba(201,48,44,0.35)] transition-transform active:scale-95"
            >
              {QuizIcon}
            </Link>
            <span aria-hidden="true" className="pb-1 text-[11px] font-bold text-[color:var(--dp-red)]">
              Quiz
            </span>
          </div>

          <Link href="/chat" onClick={close} aria-current={askActive ? 'page' : undefined} className={tabClass(askActive)}>
            <TabContent icon={AskIcon} label="Demander" active={askActive} />
          </Link>

          <button
            type="button"
            onClick={openMenu}
            aria-label="Ouvrir le menu"
            aria-expanded={menuActive}
            aria-haspopup="dialog"
            className={tabClass(menuActive)}
          >
            <TabContent
              icon={
                <>
                  {MenuIcon}
                  {showMenuDot && (
                    <span
                      data-testid="menu-install-dot"
                      className="absolute right-3 top-[3px] h-2 w-2 rounded-full border-2 border-white bg-red-civic dark:border-[color:var(--dp-card-bg)]"
                    />
                  )}
                </>
              }
              label="Menu"
              active={menuActive}
            />
          </button>
        </div>
      </nav>
    </>
  )
}
