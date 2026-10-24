'use client'
import { usePathname } from 'next/navigation'

// The space the floating bottom nav needs below the last content. The footer
// reserves it on every page that has one, so only /chat (no footer) needs it
// here - on the others it doubled into a blank band above the footer.
// /embed/* pages are iframed into third-party sites and have no bottom nav.
export function MainFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const hasNoFooter = pathname.startsWith('/chat')
  return (
    <main className={hasNoFooter ? 'pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-0' : ''}>
      {children}
    </main>
  )
}
