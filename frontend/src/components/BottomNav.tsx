'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MobileMenu } from './MobileMenu'

const items = [
  { href: '/', label: 'Accueil', icon: '⌂' },
  { href: '/deputes', label: 'Députés', icon: '◉' },
  { href: '/votes', label: 'Votes', icon: '◈' },
  { href: '/quiz', label: 'Quiz', icon: '✦' },
  { href: '/chat', label: 'Chat IA', icon: '◎' },
]

export function BottomNav() {
  const path = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  if (path.startsWith('/embed')) return null
  return (
    <>
      {/* The sheet carries what the tab bar has no room for — the desktop
          "Explorer" sections, the secondary links, and the theme toggle. */}
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <nav data-print-hide className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-border dark:bg-[color:var(--dp-card-bg)] dark:border-[color:var(--dp-border)] z-50 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center">
          <div className="grid grid-cols-5 flex-1">
            {items.map(item => {
              const active =
                path === item.href || (item.href !== '/' && path.startsWith(item.href))
              return (
                <Link key={item.href} href={item.href}
                  className={`flex flex-col items-center justify-center py-3 gap-0.5 text-xs font-medium transition-colors
                    ${active
                      ? 'text-navy dark:text-[color:var(--dp-text)]' : 'text-gray-mid dark:text-[color:var(--dp-text-muted)]'}`}>
                  <span className="text-lg leading-none">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Ouvrir le menu"
            aria-expanded={menuOpen}
            className={`flex shrink-0 flex-col items-center justify-center gap-0.5 px-3 py-3 text-xs font-medium transition-colors
              ${menuOpen ? 'text-navy dark:text-[color:var(--dp-text)]' : 'text-gray-mid dark:text-[color:var(--dp-text-muted)]'}`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            <span>Menu</span>
          </button>
        </div>
      </nav>
    </>
  )
}
