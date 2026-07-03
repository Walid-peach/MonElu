import Link from 'next/link'

const legalLinks = [
  { href: '/mentions-legales', label: 'Mentions légales' },
  { href: '/confidentialite', label: 'Confidentialité' },
  { href: '/licence-donnees', label: 'Licence des données' },
]

export function Footer() {
  return (
    <footer
      style={{
        padding: '32px 56px',
        background: '#111C35',
        display: 'flex',
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
        <span style={{ fontSize: '13px', color: '#4B5563', marginLeft: '8px' }}>
          © {new Date().getFullYear()} - Données publiques Assemblée nationale
        </span>
      </div>
      <div style={{ display: 'flex', gap: '28px', fontSize: '13.5px', flexWrap: 'wrap' }}>
        <Link href="/deputes" style={{ color: '#6B7280', textDecoration: 'none' }}>Députés</Link>
        <Link href="/votes" style={{ color: '#6B7280', textDecoration: 'none' }}>Votes</Link>
        <a href="https://monelu-production.up.railway.app/docs" target="_blank" rel="noopener noreferrer" style={{ color: '#6B7280', textDecoration: 'none' }}>API</a>
        <a href="https://github.com/Walid-peach" target="_blank" rel="noopener noreferrer" style={{ color: '#6B7280', textDecoration: 'none' }}>GitHub</a>
        {legalLinks.map((l) => (
          <Link key={l.href} href={l.href} style={{ color: '#6B7280', textDecoration: 'none' }}>{l.label}</Link>
        ))}
      </div>
    </footer>
  )
}
