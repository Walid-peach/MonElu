import Link from 'next/link'
import { THEME_ENTRIES } from '@/lib/themes'
import { themeColors } from '@/lib/utils'

// Standalone theme browse block (MON-106). Kept separate from
// AssemblyScrollExperience rather than woven into its scroll-driven
// sections, since that component's animation logic depends on an exact,
// already-fragile DOM structure per section.
export function ThemeNavSection() {
  return (
    <section style={{ background: '#070b14', padding: '64px 20px 88px', borderTop: '1px solid rgba(120,150,210,0.14)' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(160,195,230,0.7)', marginBottom: 14 }}>
          Explorer par thème
        </div>
        <h2 style={{ fontSize: 'clamp(24px,3vw,32px)', fontWeight: 600, color: '#fff', margin: '0 0 28px', letterSpacing: '-0.01em' }}>
          Comment les députés votent, sujet par sujet
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
          {THEME_ENTRIES.map(({ slug, name }) => {
            const c = themeColors(name)
            return (
              <Link
                key={slug}
                href={`/themes/${slug}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px',
                  borderRadius: 999, fontSize: 14, fontWeight: 600, textDecoration: 'none',
                  color: '#fff', background: 'rgba(18,28,54,0.6)', border: '1px solid rgba(120,150,210,0.22)',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 999, background: c.c, flexShrink: 0 }} />
                {name}
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
