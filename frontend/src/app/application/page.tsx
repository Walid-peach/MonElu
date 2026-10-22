import type { Metadata } from 'next'
import Link from 'next/link'
import { InstallActions } from './InstallActions'
import { JsonLd } from '@/components/JsonLd'
import { SITE_URL, buildBreadcrumbJsonLd } from '@/lib/seo'
import { canonicalUrl } from '@/lib/site'

const TITLE = 'MonÉlu sur votre téléphone - MonÉlu'
const DESCRIPTION =
  "Installez MonÉlu sur l'écran d'accueil de votre téléphone : votre député et ses votes, " +
  "en un geste, sans boutique d'applications ni compte."

// The installation help page (#595, epic #593). The header and the prose are
// rendered here, on the server, identically for every visitor; only the
// action block depends on the device and is decided in the browser
// (InstallActions), the split /deputes/comparer uses (MON-265). No API fetch,
// so no ISR interval to declare.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: canonicalUrl('/application') },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/application`, type: 'website' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

const NAVY = 'var(--dp-text)'
const pStyle = { fontSize: 15.5, lineHeight: 1.7, color: 'var(--dp-text-secondary)', margin: '0 0 12px' } as const

export default function ApplicationPage() {
  return (
    <div style={{ background: 'var(--dp-page-bg)', minHeight: '100vh' }}>
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: 'Accueil', url: SITE_URL },
          { name: 'MonÉlu sur votre téléphone', url: `${SITE_URL}/application` },
        ])}
      />
      <div style={{ padding: '38px 24px 60px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--dp-red)' }}>
            Application
          </div>
          <h1 className="font-newsreader" style={{ fontSize: 'clamp(28px,4vw,40px)', fontWeight: 600, color: NAVY, margin: '12px 0 8px', letterSpacing: '-0.01em' }}>
            MonÉlu sur votre téléphone
          </h1>
          <p style={{ ...pStyle, margin: '0 0 28px' }}>
            Retrouvez votre député et ses votes, directement depuis votre écran d&apos;accueil.
          </p>

          <InstallActions />

          <section style={{ marginTop: 40 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: NAVY, margin: '0 0 12px' }}>
              Ce que vous obtenez
            </h2>
            <p style={pStyle}>
              L&apos;application s&apos;ouvre sur{' '}
              <Link href="/mon-depute" style={{ color: NAVY, fontWeight: 600 }}>Mon député</Link> :
              la première fois, vous trouvez votre député ; ensuite, vous arrivez directement sur son
              bilan et sur ses votes depuis votre dernière visite.
            </p>
            <p style={pStyle}>
              C&apos;est le site MonÉlu lui-même, installé sur votre téléphone : mêmes données, mises à
              jour chaque jour ouvré, sans compte et sans boutique d&apos;applications. Les pages déjà
              consultées restent lisibles hors connexion.
            </p>
            <p style={{ ...pStyle, margin: 0 }}>
              Sur iPhone, une application native est en préparation. En attendant, tout MonÉlu reste
              accessible depuis Safari.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
