'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const items = [
  { href: '/', label: 'Accueil', icon: '⌂' },
  { href: '/deputes', label: 'Députés', icon: '◉' },
  { href: '/votes', label: 'Votes', icon: '◈' },
  { href: '/chat', label: 'Chat IA', icon: '◎' },
  { href: '/verifier', label: 'Vérifier', icon: '✓' },
]

export function BottomNav() {
  const path = usePathname()
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-border z-50">
      <div className="grid grid-cols-5">
        {items.map(item => (
          <Link key={item.href} href={item.href}
            className={`flex flex-col items-center justify-center py-3 gap-0.5 text-xs font-medium transition-colors
              ${path === item.href || (item.href !== '/' && path.startsWith(item.href))
                ? 'text-navy' : 'text-gray-mid'}`}>
            <span className="text-lg leading-none">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
