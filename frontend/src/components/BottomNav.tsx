'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from './ThemeToggle'

const items = [
  { href: '/', label: 'Accueil', icon: '⌂' },
  { href: '/deputes', label: 'Députés', icon: '◉' },
  { href: '/votes', label: 'Votes', icon: '◈' },
  { href: '/quiz', label: 'Quiz', icon: '✦' },
  { href: '/chat', label: 'Chat IA', icon: '◎' },
]

export function BottomNav() {
  const path = usePathname()
  if (path.startsWith('/embed')) return null
  return (
    <nav data-print-hide className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-border z-50 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center">
        <div className="grid grid-cols-5 flex-1">
          {items.map(item => {
            const active =
              path === item.href || (item.href !== '/' && path.startsWith(item.href))
            return (
              <Link key={item.href} href={item.href}
                className={`flex flex-col items-center justify-center py-3 gap-0.5 text-xs font-medium transition-colors
                  ${active
                    ? 'text-navy' : 'text-gray-mid'}`}>
                <span className="text-lg leading-none">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>
        <ThemeToggle className="mr-2 shrink-0" />
      </div>
    </nav>
  )
}
