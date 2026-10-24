import Link from 'next/link'
import type { AssemblyStats } from './LiveAssemblyPulse'
import { GROUP_ENTRIES } from '@/lib/groups'
import { THEME_ENTRIES } from '@/lib/themes'
import { partyHex } from '@/lib/utils'

const NUMBER = new Intl.NumberFormat('fr-FR')
const COMPACT = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 0 })

const iconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

/** One line-icon per theme slug (`api/themes_data.py`); an unknown slug falls back to `autre`. */
const THEME_ICONS: Record<string, React.ReactNode> = {
  'economie-budget': <svg {...iconProps}><path d="M17 6.5A7 7 0 1 0 17 17.5" /><path d="M4 10h9M4 14h9" /></svg>,
  'sante-social': <svg {...iconProps}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>,
  'justice-securite': <svg {...iconProps}><path d="M12 4v16M7 20h10" /><path d="M5 8h14" /><path d="m5 8-2.5 6h5zM19 8l-2.5 6h5z" /></svg>,
  'energie-environnement': <svg {...iconProps}><path d="M5 19C5 10 11 5 20 5c0 9-5 15-14 14z" /><path d="M5 19l7-7" /></svg>,
  'education-culture': <svg {...iconProps}><path d="M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4z" /><path d="M20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z" /></svg>,
  agriculture: <svg {...iconProps}><path d="M12 21v-9" /><path d="M12 12C12 8 9 6 5 6c0 4 3 6 7 6z" /><path d="M12 12c0-4 3-6 7-6 0 4-3 6-7 6z" /></svg>,
  'transport-logement': <svg {...iconProps}><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></svg>,
  institutions: <svg {...iconProps}><path d="M3 9 12 4l9 5" /><path d="M5 10v8M10 10v8M14 10v8M19 10v8" /><path d="M3 20h18" /></svg>,
  international: <svg {...iconProps}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c3 3 3 15 0 18c-3-3-3-15 0-18z" /></svg>,
  autre: <svg {...iconProps}><path d="M6 12h.01M12 12h.01M18 12h.01" /></svg>,
}

const checkIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 12 5 5 9-10" />
  </svg>
)

const rowHeading = 'px-5 text-xs font-bold uppercase tracking-[0.12em] text-[color:var(--dp-text-secondary)]'
// A row the reader swipes sideways: every link stays in the HTML (MON-270's
// internal-linking hub) while the section keeps two lines of height.
const scrollRow = 'flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]'

/**
 * The "en bref" summary below `md` (G2). `HomeSummary` keeps the desktop and
 * its long prose; this one keeps the same facts and every group and theme
 * link, shorter. Server-rendered, and "En savoir plus" is a native `<details>`,
 * so all of it is in the HTML without JavaScript.
 */
export function MobileSummary({ stats }: { stats: AssemblyStats }) {
  return (
    <section
      aria-labelledby="en-bref-mobile"
      className="flex flex-col gap-5 border-t border-[color:var(--dp-border)] bg-white pb-8 pt-9 text-navy md:hidden"
    >
      <div className="flex flex-col gap-2 px-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-red-civic">MonÉlu en bref</p>
        <h2 id="en-bref-mobile" className="font-newsreader text-[26px] font-medium leading-[1.15]">
          Le relevé de vote complet de chaque député, en accès libre.
        </h2>
      </div>

      <dl className="grid grid-cols-3 gap-2 px-5">
        <div className="flex flex-col rounded-[14px] bg-navy p-2.5 text-white">
          <dt className="text-xs text-white/80">députés</dt>
          <dd className="order-first font-serif text-[22px] leading-tight">{NUMBER.format(stats.deputies)}</dd>
        </div>
        <div className="flex flex-col rounded-[14px] bg-gray-off p-2.5">
          <dt className="text-xs text-[color:var(--dp-text-secondary)]">scrutins</dt>
          <dd className="order-first font-serif text-[22px] leading-tight">{NUMBER.format(stats.votes)}</dd>
        </div>
        <div className="flex flex-col rounded-[14px] bg-gray-off p-2.5">
          <dt className="text-xs text-[color:var(--dp-text-secondary)]">positions</dt>
          <dd className="order-first font-serif text-[22px] leading-tight">{COMPACT.format(stats.positions)}</dd>
        </div>
      </dl>

      <ul className="flex flex-wrap gap-1.5 px-5">
        {['Données officielles', 'Aucune note', 'Chaque jour ouvré'].map(label => (
          <li key={label} className="flex items-center gap-1.5 rounded-full bg-[color:var(--dp-badge-info-bg)] px-2.5 py-1.5 text-xs font-medium">
            {checkIcon}
            {label}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2.5">
        <h3 className={rowHeading}>Par groupe</h3>
        <ul className={scrollRow}>
          {GROUP_ENTRIES.map(({ slug, name }) => (
            <li key={slug} className="flex-none">
              <Link
                href={`/groupes/${slug}`}
                className="flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border border-[color:var(--dp-border)] py-0 pl-2.5 pr-3.5 text-[13px] font-medium"
              >
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: slug === 'non-inscrits' ? 'var(--dp-text-muted)' : partyHex(name) }}
                />
                {name}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2.5">
        <h3 className={rowHeading}>Par thème</h3>
        <ul className={scrollRow}>
          {THEME_ENTRIES.map(({ slug, name }) => (
            <li key={slug} className="flex-none">
              <Link
                href={`/themes/${slug}`}
                className="flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full bg-gray-off py-0 pl-2.5 pr-3.5 text-[13px] font-medium"
              >
                <span className="text-red-civic">{THEME_ICONS[slug] ?? THEME_ICONS.autre}</span>
                {name}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <details className="group mx-5 rounded-[14px] border border-[color:var(--dp-border)]">
        <summary className="flex min-h-[46px] cursor-pointer list-none items-center justify-between px-3.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
          En savoir plus sur MonÉlu
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="transition-transform group-open:rotate-180">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <div className="flex flex-col gap-2 px-3.5 pb-3.5 text-sm leading-relaxed text-[color:var(--dp-text-secondary)]">
          <p>
            Pour chaque scrutin public de la 17<sup>e</sup> législature, MonÉlu publie le résultat et la position de
            chaque député, depuis le 1<sup>er</sup> juillet 2025, réingérés chaque jour ouvré. Les données viennent de
            l&apos;open data de l&apos;Assemblée nationale (Licence Ouverte 2.0) ; MonÉlu ne note pas les députés et ne
            prend pas position. {stats.lastUpdated}.
          </p>
          <p className="flex flex-wrap gap-x-4">
            <Link href="/methodologie" className="font-semibold text-navy underline underline-offset-2">Méthodologie</Link>
            <Link href="/donnees" className="font-semibold text-navy underline underline-offset-2">Données</Link>
            <Link href="/developpeurs" className="font-semibold text-navy underline underline-offset-2">API publique</Link>
          </p>
        </div>
      </details>
    </section>
  )
}
