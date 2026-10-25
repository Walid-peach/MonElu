'use client'

import { useRef, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MonEluLogo } from './MonEluLogo'
import { ThemeToggle } from './ThemeToggle'
import { useTheme } from './ThemeProvider'
import { FollowedDeputyChip } from './FollowedDeputyChip'
import { MenuEntry } from './nav/MenuEntry'
import { useModalSheet } from './nav/useModalSheet'
import { aboutSections, exploreSections, isEntryActive, phoneAppEntry } from './nav/navigation'
import { isStandalone } from '@/lib/installState'
import { recordInstallEvent } from '@/lib/installEvents'
import { isLightOnlyPath } from '@/lib/theme'

/** Which sheet: the parliament data (Explorer tab) or everything around it (Menu). */
export type MobileMenuVariant = 'explore' | 'menu'

const SHEETS = {
  explore: { label: 'Explorer', sections: exploreSections },
  menu: { label: 'Menu de navigation', sections: aboutSections },
}

const noopSubscribe = () => () => {}

/**
 * Mobile counterpart of the desktop dropdowns, opened as a bottom sheet from
 * the bottom nav. The bar's Explorer tab opens the "Explorer" sections and its
 * Menu button the "À propos" ones, with the way to install the app on top.
 */
export function MobileMenu({
  open,
  onClose,
  variant = 'menu',
}: {
  open: boolean
  onClose: () => void
  variant?: MobileMenuVariant
}) {
  const { label, sections } = SHEETS[variant]
  const pathname = usePathname()
  const { theme } = useTheme()
  const dialogRef = useRef<HTMLDivElement>(null)
  // The installed web app does not offer to install itself (#596).
  const standalone = useSyncExternalStore(noopSubscribe, isStandalone, () => false)

  useModalSheet(open, onClose, dialogRef)

  return (
    <div
      className={`md:hidden fixed inset-0 z-[60] ${open ? '' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      <div
        className="absolute inset-0 bg-black/40 transition-opacity duration-200"
        style={{ opacity: open ? 1 : 0 }}
        onClick={onClose}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl transition-transform duration-200 ease-out dark:bg-[color:var(--dp-card-bg)]"
        style={{
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
        }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-white border-b border-gray-border dark:bg-[color:var(--dp-card-bg)] dark:border-[color:var(--dp-border)]">
          <Link href="/" className="flex items-center" onClick={onClose}>
            <MonEluLogo
              size={28}
              variant={theme === 'dark' && !isLightOnlyPath(pathname) ? 'dark' : 'light'}
            />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer le menu"
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-light text-[color:var(--dp-text-muted)]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {variant === 'explore' && (
          <div className="px-5 pt-4">
            <FollowedDeputyChip />
          </div>
        )}

        {variant === 'menu' && !standalone && (
          <div className="px-5 pt-4">
            <div className="rounded-2xl bg-navy/[0.06] p-4 dark:bg-white/[0.06]">
              <MenuEntry
                entry={phoneAppEntry}
                active={isEntryActive(phoneAppEntry, pathname)}
                reachable={open}
                onNavigate={() => {
                  recordInstallEvent('menu_entry_tap')
                  onClose()
                }}
              />
            </div>
          </div>
        )}

        {sections.map((section, i) => (
          <div key={section.title ?? i} className="px-5 pt-5">
            {section.title && (
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[color:var(--dp-text-muted)]">
                {section.title}
              </span>
            )}
            <div className="mt-3 flex flex-col gap-4">
              {section.entries.map(entry => (
                <MenuEntry
                  key={entry.label}
                  entry={entry}
                  active={isEntryActive(entry, pathname)}
                  reachable={open}
                  onNavigate={onClose}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
