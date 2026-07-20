'use client'
import { usePathname } from 'next/navigation'

// /embed/* pages are iframed into third-party sites — wraps chrome that has
// no per-route pathname check of its own (e.g. server components) so it can
// still be omitted there.
export function HideOnEmbed({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (pathname.startsWith('/embed')) return null
  return <>{children}</>
}
