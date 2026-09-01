import Link from 'next/link'
import type { AssemblyStats } from './LiveAssemblyPulse'
import { THEME_ENTRIES } from '@/lib/themes'
import { GROUP_ENTRIES } from '@/lib/groups'

/**
 * Server-rendered prose summary of what MonÉlu is (MON-270).
 *
 * `AssemblyScrollExperience` is a client component whose desktop half does not
 * mount at all until `useSyncExternalStore` confirms the viewport, and whose
 * text is short display strings inside animated panels. The homepage therefore
 * used to ship ~1.1 KB of JS-free content: gorgeous for a human, and close to
 * silent for a crawler or an LLM deciding what this domain is about.
 *
 * This section is deliberately static and non-interactive so it is always in
 * the HTML, on every viewport, with or without JavaScript. It doubles as the
 * internal-linking hub the site lacked - every group and every theme page is
 * one hop from the homepage - and as the human-readable twin of the llms.txt
 * from MON-261.
 */

const NUMBER = new Intl.NumberFormat('fr-FR')

const sectionTitleStyle = {
  fontFamily: 'var(--font-serif), Georgia, serif',
  fontSize: 'clamp(24px,3vw,32px)',
  lineHeight: 1.15,
  letterSpacing: '-0.02em',
  color: 'var(--dp-text)',
  margin: 0,
} as const

const groupTitleStyle = {
  fontSize: '12.5px',
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--dp-text-muted)',
  margin: '0 0 12px',
} as const

const textStyle = {
  fontSize: '15.5px',
  lineHeight: 1.75,
  color: 'var(--dp-text-secondary)',
  margin: '18px 0 0',
} as const

const linkStyle = { color: 'var(--dp-text)', fontWeight: 600 }

function LinkList({ links }: { links: Array<{ href: string; label: string }> }) {
  return (
    <ul
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px 18px',
        listStyle: 'none',
        margin: 0,
        padding: 0,
        fontSize: '14.5px',
        lineHeight: 1.6,
      }}
    >
      {links.map(({ href, label }) => (
        <li key={href}>
          <Link href={href} style={{ color: 'var(--dp-text-secondary)' }}>
            {label}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function HomeSummary({ stats }: { stats: AssemblyStats }) {
  return (
    <section
      aria-labelledby="a-propos-du-site"
      style={{
        background: 'var(--dp-page-bg)',
        borderTop: '1px solid var(--dp-border)',
        padding: 'clamp(48px,6vw,72px) clamp(16px,5vw,56px)',
      }}
    >
      <div style={{ maxWidth: '860px', margin: '0 auto' }}>
        <p
          style={{
            fontSize: '12.5px',
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--dp-red)',
            margin: '0 0 14px',
          }}
        >
          À propos de MonÉlu
        </p>
        <h2 id="a-propos-du-site" style={sectionTitleStyle}>
          Le relevé de vote complet de chaque député, en accès libre.
        </h2>

        <p style={textStyle}>
          <strong>MonÉlu</strong> est une plateforme de transparence civique qui publie le relevé de
          vote de chaque député de l&apos;Assemblée nationale française, pour la{' '}
          <strong>17<sup>e</sup> législature</strong> ouverte le 7 juillet 2024. Pour chaque scrutin
          public, le site indique le résultat, le détail pour / contre / abstention, et la position
          individuelle de chaque élu - la même donnée que le compte rendu officiel, mise en français
          courant et rendue consultable député par député.
        </p>

        <p style={textStyle}>
          La base couvre aujourd&apos;hui <strong>{NUMBER.format(stats.deputies)} députés</strong>,{' '}
          <strong>{NUMBER.format(stats.votes)} scrutins</strong> et{' '}
          <strong>{NUMBER.format(stats.positions)} positions individuelles</strong>. Les scrutins
          publiés en production remontent au 1<sup>er</sup> juillet 2025 ; l&apos;historique complet
          depuis le début de la législature existe en environnement de développement. Les données
          sont réingérées automatiquement chaque jour ouvré. {stats.lastUpdated}.
        </p>

        <p style={textStyle}>
          Toutes les données proviennent du portail open data de l&apos;Assemblée nationale et sont
          redistribuées sous <strong>Licence Ouverte 2.0 (Etalab)</strong>, sans retraitement
          éditorial : MonÉlu ne note pas les députés et ne prend pas position. Le calcul de chaque
          statistique affichée est décrit sur la page{' '}
          <Link href="/methodologie" style={linkStyle}>
            méthodologie
          </Link>
          , les jeux de données et l&apos;API publique sur la page{' '}
          <Link href="/donnees" style={linkStyle}>
            données
          </Link>
          .
        </p>

        <div style={{ marginTop: 'clamp(32px,4vw,44px)', display: 'grid', gap: '28px' }}>
          <div>
            <h3 style={groupTitleStyle}>Explorer</h3>
            <LinkList
              links={[
                { href: '/deputes', label: 'Tous les députés' },
                { href: '/deputes/tableau', label: 'Tableau comparatif' },
                { href: '/votes', label: 'Tous les scrutins' },
                { href: '/mon-depute', label: 'Trouver mon député' },
                { href: '/quiz', label: 'Quel député vote comme moi ?' },
                { href: '/chat', label: 'Poser une question aux données' },
              ]}
            />
          </div>

          <div>
            <h3 style={groupTitleStyle}>Groupes parlementaires</h3>
            <LinkList
              links={GROUP_ENTRIES.map(({ slug, name }) => ({
                href: `/groupes/${slug}`,
                label: name,
              }))}
            />
          </div>

          <div>
            <h3 style={groupTitleStyle}>Thèmes</h3>
            <LinkList
              links={THEME_ENTRIES.map(({ slug, name }) => ({
                href: `/themes/${slug}`,
                label: name,
              }))}
            />
          </div>

          <div>
            <h3 style={groupTitleStyle}>Sources et transparence</h3>
            <LinkList
              links={[
                { href: '/methodologie', label: 'Méthodologie des calculs' },
                { href: '/donnees', label: 'Jeux de données' },
                { href: '/licence-donnees', label: 'Licence des données' },
                { href: '/developpeurs', label: 'API publique' },
                { href: '/a-propos', label: 'À propos du projet' },
              ]}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
