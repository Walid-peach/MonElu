'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MonEluLogo } from './MonEluLogo'
import { ThemeToggle } from './ThemeToggle'
import { FollowedDeputyChip } from './FollowedDeputyChip'
import { exploreSections, isActivePath, topLinks } from './nav/navigation'

/**
 * Mobile counterpart of the desktop "Explorer" mega-menu: the same two
 * sections, opened as a bottom sheet from the bottom nav. Below `md` the site
 * keeps its bottom tab bar for the primary routes; this sheet carries
 * everything the tab bar has no room for.
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
        className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl transition-transform duration-250 ease-out dark:bg-[color:var(--dp-card-bg)]"
        style={{
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
        }}
      >
        <div className="sticky top-0 flex items-center justify-between px-5 py-4 bg-white border-b border-gray-border dark:bg-[color:var(--dp-card-bg)] dark:border-[color:var(--dp-border)]">
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

        {exploreSections.map(section => (
          <div key={section.title} className="px-5 pt-5">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-mid dark:text-[color:var(--dp-text-muted)]">
              {section.title}
            </span>
            <div className="mt-3 flex flex-col">
              {section.entries.map(entry => {
                const active = isActivePath(pathname, entry.href)
                return (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    onClick={onClose}
                    tabIndex={open ? undefined : -1}
                    className="flex items-start gap-3 rounded-lg py-3 active:bg-gray-light dark:active:bg-white/5"
                  >
                    <span
                      className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-civic ${active ? 'opacity-100' : 'opacity-0'}`}
                      aria-hidden="true"
                    />
                    <span className="mt-0.5 shrink-0 text-navy dark:text-[color:var(--dp-text)]">{entry.icon}</span>
                    <span>
                      <span className="block text-[15px] font-semibold text-navy dark:text-[color:var(--dp-text)]">{entry.label}</span>
                      <span className="block text-[12.5px] mt-0.5 text-gray-mid dark:text-[color:var(--dp-text-muted)]">{entry.description}</span>
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}

        <div className="px-5 pt-6">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-mid dark:text-[color:var(--dp-text-muted)]">
            Le site
          </span>
          <div className="mt-3 flex flex-wrap gap-2">
            {topLinks.map(({ href, label }) => {
              const active = isActivePath(pathname, href)
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onClose}
                  tabIndex={open ? undefined : -1}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors
                    ${active
                      ? 'border-navy bg-navy text-white dark:border-[color:var(--dp-text)]'
                      : 'border-gray-border text-navy dark:border-[color:var(--dp-border)] dark:text-[color:var(--dp-text)]'}`}
                >
                  {label}
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
