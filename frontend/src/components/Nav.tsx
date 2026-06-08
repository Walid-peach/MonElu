import Link from 'next/link'
import { MonEluLogo } from './MonEluLogo'

export function Nav() {
  return (
    <nav className="hidden md:flex items-center justify-between px-8 h-16 bg-white border-b border-gray-border sticky top-0 z-50">
      <Link href="/" className="flex items-center gap-2">
        <MonEluLogo />
      </Link>
      <div className="flex items-center gap-8 text-sm font-medium text-gray-mid">
        <Link href="/deputes" className="hover:text-navy transition-colors">Députés</Link>
        <Link href="/votes" className="hover:text-navy transition-colors">Votes</Link>
        <Link href="/about" className="hover:text-navy transition-colors">À propos</Link>
      </div>
      <a href="https://monelu-production.up.railway.app/docs"
        target="_blank"
        className="text-sm border border-navy text-navy px-4 py-1.5 rounded hover:bg-navy hover:text-white transition-colors">
        Explorer l&apos;API →
      </a>
    </nav>
  )
}
