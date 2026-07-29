'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MonEluLogo } from './MonEluLogo'
import { FollowedDeputyChip } from './FollowedDeputyChip'
import { ThemeToggle } from './ThemeToggle'
import { MenuEntry } from './nav/MenuEntry'
import {
  aboutSections,
  exploreSections,
  isActivePath,
  isEntryActive,
  sectionHrefs,
  topLinks,
  type NavSection,
} from './nav/navigation'

export const NAV_HEIGHT_PX = 72

type MenuId = 'explorer' | 'apropos'

const linkBase =
  'relative text-[14.5px] font-semibold transition-colors text-gray-mid hover:text-navy dark:text-[color:var(--dp-text-muted)] dark:hover:text-[color:var(--dp-text)]'
const linkActive = 'text-navy dark:text-[color:var(--dp-text)]'

export function Nav() {
  const pathname = usePathname()
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null)
  const navRef = useRef<HTMLDivElement>(null)

  // Menus are click-driven: once open they stay open until Escape, a click
  // outside, or a click on one of their entries.
  useEffect(() => {
    if (!openMenu) return
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenu(null)
    }
    function onPointerDown(e: MouseEvent) {
      if (!navRef.current?.contains(e.target as Node)) setOpenMenu(null)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onPointerDown)
    }
  }, [openMenu])

  // /embed/* pages are iframed into third-party sites — no site chrome there.
  if (pathname.startsWith('/embed')) return null

  return (
    <nav
      data-print-hide
      className="hidden md:flex items-center justify-between gap-10 px-11 bg-white border-b border-gray-border dark:bg-[color:var(--dp-card-bg)] dark:border-[color:var(--dp-border)] sticky top-0 z-50"
      style={{ height: NAV_HEIGHT_PX }}
    >
      <Link href="/" className="flex items-center shrink-0">
        <MonEluLogo size={32} variant="light" />
      </Link>

      <div ref={navRef} className="flex items-center gap-9">
        <Dropdown
          label="Explorer"
          sections={exploreSections}
          pathname={pathname}
          open={openMenu === 'explorer'}
          onToggle={() => setOpenMenu(m => (m === 'explorer' ? null : 'explorer'))}
          onNavigate={() => setOpenMenu(null)}
        />

        {topLinks.map(({ href, label }) => {
          const active = isActivePath(pathname, href)
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpenMenu(null)}
              className={`${linkBase} ${active ? linkActive : ''}`}
            >
              {label}
              {active && (
                <span className="absolute -bottom-2 left-0 right-0 h-0.5 bg-red-civic" aria-hidden="true" />
              )}
            </Link>
          )
        })}

        <Dropdown
          label="À propos"
          sections={aboutSections}
          pathname={pathname}
          open={openMenu === 'apropos'}
          onToggle={() => setOpenMenu(m => (m === 'apropos' ? null : 'apropos'))}
          onNavigate={() => setOpenMenu(null)}
        />
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <ThemeToggle />
        <FollowedDeputyChip />
      </div>
    </nav>
  )
}

function Dropdown({
  label,
  sections,
  pathname,
  open,
  onToggle,
  onNavigate,
}: {
  label: string
  sections: NavSection[]
  pathname: string
  open: boolean
  onToggle: () => void
  onNavigate: () => void
}) {
  const menuActive = sectionHrefs(sections).some(href => isActivePath(pathname, href))
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={onToggle}
        className={`flex items-center gap-1.5 cursor-pointer ${linkBase} ${open || menuActive ? linkActive : ''}`}
      >
        {label}
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          className="transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
        {menuActive && (
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
          {sections.map((section, i) => (
            <div
              key={section.title ?? i}
              className={`flex flex-col gap-[18px] ${i > 0 ? 'border-l border-gray-border dark:border-[color:var(--dp-border)] pl-8' : ''}`}
            >
              {section.title && (
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-mid dark:text-[color:var(--dp-text-muted)]">
                  {section.title}
                </span>
              )}
              <div
                className={
                  // Fixed tracks, not `grid-cols-2`: the panel is a
                  // shrink-to-fit absolute box, where `1fr` tracks collapse
                  // below their content and the entries overlap.
                  section.grid
                    ? 'grid [grid-template-columns:repeat(2,240px)] gap-x-12 gap-y-6'
                    : 'flex flex-col gap-[18px] w-[230px]'
                }
              >
                {section.entries.map(entry => (
                  <MenuEntry
                    key={entry.label}
                    entry={entry}
                    active={isEntryActive(entry, pathname)}
                    reachable={open}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
