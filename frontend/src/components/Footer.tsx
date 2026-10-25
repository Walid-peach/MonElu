'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const legalLinks = [
  { href: '/mentions-legales', label: 'Mentions légales' },
  { href: '/confidentialite', label: 'Confidentialité' },
  { href: '/licence-donnees', label: 'Licence des données' },
  { href: '/accessibilite', label: "Accessibilité : non conforme" },
]

const phoneLinks = [
  { href: '/methodologie', label: 'Méthodologie' },
  { href: '/donnees', label: 'Données' },
  { href: '/a-propos', label: 'À propos' },
  { href: '/contact', label: 'Contact' },
  ...legalLinks.filter(l => l.href !== '/licence-donnees'),
]

export function Footer() {
  const pathname = usePathname()

  // /chat is a fixed-viewport app shell (height: calc(100dvh - 4rem), internal
  // scrolling only) — appending footer content below it would break that layout.
  // /embed/* pages are iframed into third-party sites — no site chrome there.
  if (pathname.startsWith('/chat') || pathname.startsWith('/embed')) return null

  return (
    <>
      {/* Phones (G3): the wordmark, one wrapped row of links and the licence line,
          with room below for the installed app's floating tab bar. */}
      <footer
        data-print-hide
        className="dp-dark flex flex-col gap-3.5 bg-[#091629] px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-6 text-[13px] installed:pb-[calc(7rem+env(safe-area-inset-bottom))] md:hidden"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-serif text-[22px] text-white">
            Mon<span className="text-red-light">É</span>lu
          </span>
          <span className="text-xs text-[color:var(--dp-text-secondary)]">Chaque vote, en clair.</span>
        </div>
        <nav aria-label="Pied de page" className="flex flex-wrap gap-x-4">
          {phoneLinks.map(l => (
            <Link key={l.href} href={l.href} className="flex min-h-9 items-center text-white">
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="text-xs leading-normal text-[color:var(--dp-text-secondary)]">
          Données : Assemblée nationale,{' '}
          <Link href="/licence-donnees" className="text-white underline underline-offset-2">
            Licence Ouverte 2.0
          </Link>
          .
        </p>
      </footer>
      {/* dp-dark: the footer is navy in both themes, so its text tokens stay dark (#559). */}
      <footer
        data-print-hide
        className="dp-dark hidden md:flex md:pb-8"
        style={{
          paddingTop: '32px',
          paddingLeft: '56px',
          paddingRight: '56px',
          background: '#111C35',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '24px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <svg width="24" height="18" viewBox="0 0 30 22" fill="none">
            <path d="M2 19 A13 13 0 0 1 28 19" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity="0.9" />
            <path d="M6 19 A9 9 0 0 1 24 19" stroke="#9A9A9A" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M10 19 A5 5 0 0 1 20 19" stroke="#D93025" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="15" cy="19" r="2.3" fill="#fff" opacity="0.9" />
          </svg>
          <span style={{ fontWeight: 800, fontSize: '18px', color: '#fff', letterSpacing: '-0.01em' }}>
            Mon<span style={{ color: '#D93025' }}>É</span>lu
          </span>
          <span style={{ fontSize: '13px', color: 'var(--dp-text-muted)', marginLeft: '8px' }}>
            © {new Date().getFullYear()} - Données publiques Assemblée nationale
          </span>
        </div>
        <div style={{ display: 'flex', gap: '28px', fontSize: '13.5px', flexWrap: 'wrap' }}>
          <Link href="/deputes" style={{ color: 'var(--dp-text-muted)', textDecoration: 'none' }}>Députés</Link>
          <Link href="/votes" style={{ color: 'var(--dp-text-muted)', textDecoration: 'none' }}>Votes</Link>
          <Link href="/quiz" style={{ color: 'var(--dp-text-muted)', textDecoration: 'none' }}>Quiz</Link>
          <Link href="/donnees" style={{ color: 'var(--dp-text-muted)', textDecoration: 'none' }}>Données</Link>
          <Link href="/developpeurs" style={{ color: 'var(--dp-text-muted)', textDecoration: 'none' }}>Développeurs</Link>
          <Link href="/methodologie" style={{ color: 'var(--dp-text-muted)', textDecoration: 'none' }}>Méthodologie</Link>
          <Link href="/contact" style={{ color: 'var(--dp-text-muted)', textDecoration: 'none' }}>Contact</Link>
          <a href="https://github.com/Walid-peach" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--dp-text-muted)', textDecoration: 'none' }}>GitHub</a>
          {legalLinks.map((l) => (
            <Link key={l.href} href={l.href} style={{ color: '#94A3B8', textDecoration: 'none' }}>{l.label}</Link>
          ))}
        </div>
      </footer>
    </>
  )
}
