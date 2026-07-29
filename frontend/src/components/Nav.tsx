'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MonEluLogo } from './MonEluLogo'
import { GlobalSearch } from './GlobalSearch'
import { FollowedDeputyChip } from './FollowedDeputyChip'
import { ThemeToggle } from './ThemeToggle'
import { exploreHrefs, exploreSections, isActivePath, topLinks } from './nav/navigation'

export const NAV_HEIGHT_PX = 72

export function Nav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onPointerDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onPointerDown)
    }
  }, [open])

  // /embed/* pages are iframed into third-party sites — no site chrome there.
  if (pathname.startsWith('/embed')) return null

  const exploreActive = exploreHrefs.some(href => isActivePath(pathname, href))

  const linkBase =
    'relative text-[14.5px] font-semibold transition-colors text-gray-mid hover:text-navy dark:text-[color:var(--dp-text-muted)] dark:hover:text-[color:var(--dp-text)]'
  const linkActive = 'text-navy dark:text-[color:var(--dp-text)]'

  return (
    <nav
      data-print-hide
      className="hidden md:flex items-center justify-between gap-10 px-11 bg-white border-b border-gray-border dark:bg-[color:var(--dp-card-bg)] dark:border-[color:var(--dp-border)] sticky top-0 z-50"
      style={{ height: NAV_HEIGHT_PX }}
    >
      <Link href="/" className="flex items-center shrink-0">
        <MonEluLogo size={32} variant="light" />
      </Link>

      <div
        ref={menuRef}
        className="flex items-center gap-9"
        onMouseLeave={() => setOpen(false)}
      >
        <div className="relative" onMouseEnter={() => setOpen(true)}>
          <button
            type="button"
            aria-expanded={open}
            aria-haspopup="true"
            onClick={() => setOpen(o => !o)}
            className={`flex items-center gap-1.5 cursor-pointer ${linkBase} ${open || exploreActive ? linkActive : ''}`}
          >
            Explorer
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
              className="transition-transform duration-200"
              style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
            {exploreActive && (
              <span className="absolute -bottom-2 left-0 right-0 h-0.5 bg-red-civic" aria-hidden="true" />
            )}
          </button>

          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-[10px] border border-gray-border bg-white shadow-lg transition-[opacity,transform] duration-200 ease-out dark:bg-[color:var(--dp-card-bg)] dark:border-[color:var(--dp-border)]"
            style={{
              top: 'calc(100% + 18px)',
              opacity: open ? 1 : 0,
              transform: `translateX(-50%) translateY(${open ? '0' : '-6px'})`,
              pointerEvents: open ? 'auto' : 'none',
            }}
            aria-hidden={!open}
          >
            <div className="flex gap-12 px-8 py-7">
              {exploreSections.map((section, i) => (
                <div
                  key={section.title}
                  className={`flex flex-col gap-[18px] min-w-[230px] ${i > 0 ? 'border-l border-gray-border dark:border-[color:var(--dp-border)] pl-8' : ''}`}
                >
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-mid dark:text-[color:var(--dp-text-muted)]">
                    {section.title}
                  </span>
                  {section.entries.map(entry => {
                    const active = isActivePath(pathname, entry.href)
                    return (
                      <Link
                        key={entry.href}
                        href={entry.href}
                        tabIndex={open ? undefined : -1}
                        onClick={() => setOpen(false)}
                        className="group flex items-start gap-3"
                      >
                        <span
                          className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-civic transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`}
                          aria-hidden="true"
                        />
                        <span className="mt-0.5 shrink-0 text-navy dark:text-[color:var(--dp-text)]">{entry.icon}</span>
                        <span>
                          <span className="block text-[14.5px] font-semibold text-navy group-hover:text-red-civic transition-colors dark:text-[color:var(--dp-text)]">
                            {entry.label}
                          </span>
                          <span className="block text-[12.5px] mt-0.5 text-gray-mid dark:text-[color:var(--dp-text-muted)]">
                            {entry.description}
                          </span>
                        </span>
                      </Link>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {topLinks.map(({ href, label }) => {
          const active = isActivePath(pathname, href)
          return (
            <Link key={href} href={href} className={`${linkBase} ${active ? linkActive : ''}`}>
              {label}
              {active && (
                <span className="absolute -bottom-2 left-0 right-0 h-0.5 bg-red-civic" aria-hidden="true" />
              )}
            </Link>
          )
        })}
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <ThemeToggle />
        <FollowedDeputyChip />
        <GlobalSearch />
      </div>
    </nav>
  )
}
