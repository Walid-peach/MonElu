import type { ReactNode } from 'react'

interface LegalPageLayoutProps {
  eyebrow: string
  title: string
  children: ReactNode
}

export function LegalPageLayout({ eyebrow, title, children }: LegalPageLayoutProps) {
  return (
    <div style={{ background: 'var(--dp-page-bg)', minHeight: '100vh' }}>
      {/* Below md: the phone page kit's 20px gutter and 34px title (canvas
          "Page texte"); 56px gutters left a phone about 260px of text. */}
      <div className="px-5 pb-8 pt-8 md:px-14 md:pb-14 md:pt-[72px]" style={{ background: 'linear-gradient(180deg,var(--dp-card-bg) 0%,var(--dp-page-bg) 100%)', borderBottom: '1px solid var(--dp-border-subtle)' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-red-civic md:mb-4">{eyebrow}</div>
          <h1 className="font-newsreader text-[34px] md:text-headline" style={{ fontWeight: 600, lineHeight: 1.1, letterSpacing: '-0.02em', color: 'var(--dp-text)', margin: 0 }}>
            {title}
          </h1>
        </div>
      </div>

      <div className="px-5 py-8 md:p-14" style={{ background: 'var(--dp-card-bg)' }}>
        <div className="gap-7 md:gap-9" style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
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
