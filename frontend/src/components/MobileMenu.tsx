'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MonEluLogo } from './MonEluLogo'
import { ThemeToggle } from './ThemeToggle'
import { FollowedDeputyChip } from './FollowedDeputyChip'
import { MenuEntry } from './nav/MenuEntry'
import { aboutSections, exploreSections, isActivePath } from './nav/navigation'

const sections = [...exploreSections, ...aboutSections]

/**
 * Mobile counterpart of the desktop dropdowns: the same sections, opened as a
 * bottom sheet from the bottom nav. Below `md` the site keeps its bottom tab
 * bar for the primary routes; this sheet carries everything else.
 */
export function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

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
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navigation"
        className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl transition-transform duration-200 ease-out dark:bg-[color:var(--dp-card-bg)]"
        style={{
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
        }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-white border-b border-gray-border dark:bg-[color:var(--dp-card-bg)] dark:border-[color:var(--dp-border)]">
          <Link href="/" className="flex items-center" onClick={onClose}>
            <MonEluLogo size={28} variant="light" />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer le menu"
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-mid hover:bg-gray-light dark:text-[color:var(--dp-text-muted)]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-5 pt-4">
          <FollowedDeputyChip />
        </div>

        {sections.map((section, i) => (
          <div key={section.title ?? i} className="px-5 pt-5">
            {section.title && (
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-mid dark:text-[color:var(--dp-text-muted)]">
                {section.title}
              </span>
            )}
            <div className="mt-3 flex flex-col gap-4">
              {section.entries.map(entry => (
                <MenuEntry
                  key={entry.label}
                  entry={entry}
                  active={!!entry.href && !entry.external && isActivePath(pathname, entry.href)}
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
