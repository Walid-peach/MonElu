'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MonEluLogo } from './MonEluLogo'
import { GlobalSearch } from './GlobalSearch'
import { FollowedDeputyChip } from './FollowedDeputyChip'
import { ThemeToggle } from './ThemeToggle'

export const NAV_HEIGHT_PX = 64

const navLinks = [
  { href: '/deputes', label: 'Députés' },
  { href: '/votes', label: 'Votes' },
  { href: '/quiz', label: 'Quiz' },
  { href: '/chat', label: 'Chat IA' },
  { href: '/a-propos', label: 'À propos' },
]

export function Nav() {
  const pathname = usePathname()

  // /embed/* pages are iframed into third-party sites — no site chrome there.
  if (pathname.startsWith('/embed')) return null

  return (
    <nav
      data-print-hide
      className="hidden md:flex items-center justify-between px-8 bg-white border-b border-gray-border dark:bg-[color:var(--dp-card-bg)] dark:border-[color:var(--dp-border)] sticky top-0 z-50"
      style={{ height: NAV_HEIGHT_PX }}
    >
      <Link href="/" className="flex items-center">
        <MonEluLogo size={32} variant="light" />
      </Link>
      <div className="flex items-center gap-8 text-sm font-medium text-gray-mid dark:text-[color:var(--dp-text-muted)]">
        {navLinks.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`transition-colors hover:text-navy dark:hover:text-[color:var(--dp-text)] ${active ? 'text-navy dark:text-[color:var(--dp-text)] border-b-2 border-red-civic pb-0.5' : ''}`}
            >
              {label}
            </Link>
          )
        })}
      </div>
      <div className="flex items-center gap-4">
        <ThemeToggle />
        <FollowedDeputyChip />
        <GlobalSearch />
        <a href="https://monelu-production.up.railway.app/docs"
          target="_blank"
          className="text-sm border border-navy text-navy dark:border-[color:var(--dp-text)] dark:text-[color:var(--dp-text)] px-4 py-1.5 rounded hover:bg-navy hover:text-white transition-colors">
          Explorer l&apos;API →
        </a>
      </div>
    </nav>
  )
}
