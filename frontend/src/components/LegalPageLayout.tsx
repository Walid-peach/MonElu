import type { ReactNode } from 'react'

interface LegalPageLayoutProps {
  eyebrow: string
  title: string
  children: ReactNode
}

export function LegalPageLayout({ eyebrow, title, children }: LegalPageLayoutProps) {
  return (
    <div style={{ background: 'var(--dp-page-bg)', minHeight: '100vh' }}>
      <div style={{ padding: '72px 56px 56px', background: 'linear-gradient(180deg,var(--dp-card-bg) 0%,var(--dp-page-bg) 100%)', borderBottom: '1px solid var(--dp-border-subtle)' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <div className="text-red-civic font-semibold text-xs tracking-[0.18em] uppercase mb-4">{eyebrow}</div>
          <h1 className="font-newsreader text-headline" style={{ fontWeight: 600, lineHeight: 1.1, letterSpacing: '-0.02em', color: 'var(--dp-text)', margin: 0 }}>
            {title}
          </h1>
        </div>
      </div>

      <div style={{ padding: '56px', background: 'var(--dp-card-bg)' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '36px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id?: string
  title: string
  children: ReactNode
}) {
  // 96px = Nav.tsx's NAV_HEIGHT_PX (72) + 24px breathing room, so an anchor
  // jump doesn't land the heading under the sticky nav.
  return (
    <section id={id} style={id ? { scrollMarginTop: '96px' } : undefined}>
      <h2 style={{ fontWeight: 700, fontSize: '17px', color: 'var(--dp-text)', margin: '0 0 12px' }}>{title}</h2>
      {children}
    </section>
  )
}
