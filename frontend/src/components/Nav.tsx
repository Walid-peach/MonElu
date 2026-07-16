'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MonEluLogo } from './MonEluLogo'
import { GlobalSearch } from './GlobalSearch'
import { FollowedDeputyChip } from './FollowedDeputyChip'

export const NAV_HEIGHT_PX = 64

const navLinks = [
  { href: '/deputes', label: 'Députés' },
  { href: '/votes', label: 'Votes' },
  { href: '/chat', label: 'Chat IA' },
  { href: '/a-propos', label: 'À propos' },
]

export function Nav() {
  const pathname = usePathname()

  return (
    <nav
      data-print-hide
      className="hidden md:flex items-center justify-between px-8 bg-white border-b border-gray-border sticky top-0 z-50"
      style={{ height: NAV_HEIGHT_PX }}
    >
      <Link href="/" className="flex items-center">
        <MonEluLogo size={32} variant="light" />
      </Link>
      <div className="flex items-center gap-8 text-sm font-medium text-gray-mid">
        {navLinks.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`transition-colors hover:text-navy ${active ? 'text-navy border-b-2 border-red-civic pb-0.5' : ''}`}
            >
              {label}
            </Link>
          )
        })}
      </div>
      <div className="flex items-center gap-4">
        <FollowedDeputyChip />
        <GlobalSearch />
        <a href="https://monelu-production.up.railway.app/docs"
          target="_blank"
          className="text-sm border border-navy text-navy px-4 py-1.5 rounded hover:bg-navy hover:text-white transition-colors">
          Explorer l&apos;API →
        </a>
      </div>
    </nav>
  )
}
