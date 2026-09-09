import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { ComparerClient } from './ComparerClient'
import { JsonLd } from '@/components/JsonLd'
import { SITE_URL, buildBreadcrumbJsonLd } from '@/lib/seo'
import { canonicalUrl } from '@/lib/site'

const TITLE = 'Comparer deux députés - MonÉlu'
const DESCRIPTION =
  "Comparez deux député·e·s de l'Assemblée nationale côte à côte : taux de présence, " +
  'participation aux scrutins solennels, répartition des votes, alignement avec leur ' +
  'groupe, et la liste des scrutins où ils ont voté différemment.'

// Server component so the route can declare its own canonical (MON-269) and,
// since MON-265, its own title, description and social card: the deputy ids
// this page compares travel in the query string, which the canonical
// deliberately drops. The header and the explainer below are rendered here
// rather than in ComparerClient so a crawler that runs no JavaScript still
// gets an <h1> and a description of what the page does — the client half
// renders nothing until it hydrates.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: canonicalUrl('/deputes/comparer') },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/deputes/comparer`,
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

const LINE = 'var(--dp-border)'
const NAVY = 'var(--dp-text)'

export default function ComparerPage() {
  return (
    <div style={{ background: 'var(--dp-page-bg)', minHeight: '100vh' }}>
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: 'Accueil', url: SITE_URL },
          { name: 'Députés', url: `${SITE_URL}/deputes` },
          { name: 'Comparer deux députés', url: `${SITE_URL}/deputes/comparer` },
        ])}
      />
      <div style={{ padding: '38px 24px 60px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--dp-red)' }}>
            Comparateur
          </div>
          <h1 className="font-newsreader" style={{ fontSize: 'clamp(28px,4vw,40px)', fontWeight: 600, color: NAVY, margin: '12px 0 8px', letterSpacing: '-0.01em' }}>
            Comparer deux bilans
          </h1>
          <p style={{ fontSize: 15.5, color: 'var(--dp-text-secondary)', margin: '0 0 28px', maxWidth: 620 }}>
            Présence, votes et alignement, côte à côte. Comparez un·e député·e à un·e autre, à son
            groupe, ou à la moyenne nationale.
          </p>

          <Suspense
            fallback={
              <div style={{ padding: '48px 0', color: 'var(--dp-text-muted)', fontSize: 14 }}>
                Chargement…
              </div>
            }
          >
            <ComparerClient />
          </Suspense>

          <ComparerSummary />
        </div>
      </div>
    </div>
  )
}

/**
 * Static prose below the comparator (MON-265).
 *
 * The comparison itself is query-driven and client-rendered, so without this
 * block the page is a single loading string to anything that does not execute
 * JavaScript. This is what a crawler or an LLM actually reads about the route,
 * and it is the only place linking out of it — keep it a server component with
 * no interactivity, and keep the headings at <h2> so the <h1> above stays the
 * page's only one.
 */
function ComparerSummary() {
  return (
    <section
      style={{
        marginTop: 56,
        paddingTop: 32,
        borderTop: `1px solid ${LINE}`,
        fontSize: 15,
        lineHeight: 1.6,
        color: 'var(--dp-text-secondary)',
        maxWidth: 720,
      }}
    >
      <h2 className="font-newsreader" style={{ fontSize: 22, fontWeight: 600, color: NAVY, margin: '0 0 12px' }}>
        Ce que compare cet outil
      </h2>
      <p style={{ margin: '0 0 14px' }}>
        Le comparateur met en regard deux bilans de vote construits à partir des données
        officielles de l&apos;Assemblée nationale : le <strong>taux de présence aux votes</strong>{' '}
        (part des scrutins où le ou la député·e a une position enregistrée), la{' '}
        <strong>participation aux scrutins solennels</strong>, la{' '}
        <strong>présence par jour de vote</strong>, et la répartition des votes exprimés entre{' '}
        <em>pour</em>, <em>contre</em> et <em>abstention</em>. Une abstention formelle et une
        absence de vote sont deux choses distinctes et ne sont jamais confondues.
      </p>
      <p style={{ margin: '0 0 14px' }}>
        En mode député contre député, la comparaison ajoute l&apos;
        <strong>alignement de chacun avec son groupe politique</strong> et la liste des
        <strong> scrutins où les deux ont voté différemment</strong>, chacun renvoyant vers le
        détail du vote.
      </p>
      <p style={{ margin: '0 0 14px' }}>
        Un même député peut aussi être comparé à la <strong>moyenne de son groupe</strong> ou à la{' '}
        <strong>moyenne nationale</strong> plutôt qu&apos;à un collègue.
      </p>
      <h2 className="font-newsreader" style={{ fontSize: 22, fontWeight: 600, color: NAVY, margin: '28px 0 12px' }}>
        Continuer ailleurs
      </h2>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        <li>
          <Link href="/deputes">Tous les députés</Link> — chercher par nom, groupe ou département
        </li>
        <li>
          <Link href="/deputes/tableau">Tableau des bilans</Link> — les mêmes indicateurs pour les
          577 député·e·s, triables et exportables en CSV
        </li>
        <li>
          <Link href="/votes">Tous les scrutins</Link> — le détail vote par vote
        </li>
        <li>
          <Link href="/methodologie">Méthodologie</Link> — comment chaque indicateur est calculé, et
          ce qu&apos;il ne dit pas
        </li>
      </ul>
    </section>
  )
}
