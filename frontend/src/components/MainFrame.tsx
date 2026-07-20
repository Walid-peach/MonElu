'use client'
import { usePathname } from 'next/navigation'

// /embed/* pages are iframed into third-party sites — they have no bottom
// nav, so the space normally reserved for it would just be blank padding.
export function MainFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isEmbed = pathname.startsWith('/embed')
  return (
    <main className={isEmbed ? '' : 'pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0'}>
      {children}
    </main>
  )
}
