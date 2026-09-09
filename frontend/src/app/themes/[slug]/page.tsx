import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { api, nullIfMissing } from '@/lib/api'
import type { ThemePartyPosition, ThemeVoteItem } from '@/lib/api'
import { partyHex, normalizePartyShort, formatDate, themeColors } from '@/lib/utils'
import { themeName, themeSlug, THEME_ENTRIES } from '@/lib/themes'
import { JsonLd } from '@/components/JsonLd'
import { SITE_URL, buildBreadcrumbJsonLd } from '@/lib/seo'
import { canonicalUrl } from '@/lib/site'

export const dynamicParams = true
export const revalidate = 3600

const NAVY  = 'var(--dp-text)'
const CREAM = 'var(--dp-page-bg)'
const LINE  = 'var(--dp-border)'
const RED   = 'var(--dp-red)'

// No `generateStaticParams` (MON-275), for the same reason `/votes/[id]` has
// none: prerendering these ten pages adds twenty API calls to a build that is
// already over the API's budget, and the failures come back as 500s on
// endpoints that answer in 200 ms on every manual request. `dynamicParams`
// defaults to true and `revalidate = 3600` ISR-caches the result, so the cost
// is one on-demand render per theme per hour.
//
// THEME_ENTRIES is still the source of truth for which slugs exist - `sitemap.ts`
// enumerates them, and `themeName()` below rejects anything not in the list.

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params
  const name = themeName(decodeURIComponent(slug))
  if (!name) return {}
  // The slug in the URL is not necessarily the canonical one - `themeSlug`
  // re-derives it from the theme's own name, as the page body already does.
  // Both maps are local, so the canonical needs no API call.
  const alternates = { canonical: canonicalUrl(`/themes/${themeSlug(name) ?? slug}`) }
  const data = await api.themes.get(slug).catch(() => null)
  if (!data) return { alternates }
  const title = `Votes sur le thème ${data.name} - MonÉlu`
  const description =
    `${data.vote_count} scrutin${data.vote_count !== 1 ? 's' : ''} de l'Assemblée nationale ` +
    `sur le thème ${data.name} : qui vote quoi, groupe par groupe, en français clair.`
  return {
    title,
    description,
    alternates,
    openGraph: { title, description },
    twitter: { card: 'summary_large_image', title, description },
  }
}

function pct(rate: number | null | undefined): number | null {
  return rate == null ? null : Math.round(rate * 100)
}

export default async function ThemePage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const name = themeName(decodeURIComponent(slug))
  if (!name) notFound()

  const data = await api.themes.get(slug, { limit: 50 }).catch(nullIfMissing)
  if (!data) notFound()

  const canonicalSlug = themeSlug(data.name) ?? slug
  const adoptionPct = pct(data.adoption_rate)
  const tc = themeColors(data.name)

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'Accueil', url: SITE_URL },
    { name: 'Votes', url: `${SITE_URL}/votes` },
    { name: data.name, url: `${SITE_URL}/themes/${canonicalSlug}` },
  ])

  return (
    <div style={{ background: CREAM, minHeight: '100vh' }}>
      <JsonLd data={breadcrumb} />

      {/* Hero */}
      <div
        className="px-5 sm:px-14 pt-8 sm:pt-[50px] pb-8 sm:pb-10"
        style={{
          background: `linear-gradient(180deg,var(--dp-card-bg) 0%,${CREAM} 100%)`,
          borderBottom: '1px solid var(--dp-border-subtle)',
        }}
      >
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div style={{
            fontWeight: 700, fontSize: 12, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: tc.c, marginBottom: 16,
          }}>
            Thème
          </div>
          <h1 className="font-newsreader text-[clamp(32px,4vw,48px)]" style={{
            fontWeight: 600, lineHeight: 1.05, letterSpacing: '-0.015em',
            color: NAVY, margin: 0, maxWidth: 760,
          }}>
            {data.name}
          </h1>
          <p style={{ margin: '16px 0 0', fontSize: 17, lineHeight: 1.6, color: 'var(--dp-text-secondary)', maxWidth: 560 }}>
            {data.vote_count} scrutin{data.vote_count !== 1 ? 's' : ''} de l&apos;Assemblée
            nationale sur ce thème : qui vote quoi, groupe par groupe.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" style={{ marginTop: 30, maxWidth: 900 }}>
            <div style={{ background: 'var(--dp-card-bg)', border: `1px solid ${LINE}`, borderRadius: 12, padding: '20px 22px' }}>
              <div style={{ fontSize: 13, color: 'var(--dp-text-secondary)', fontWeight: 500, marginBottom: 8 }}>
                Scrutins recensés
              </div>
              <div className="font-mono" style={{ fontWeight: 700, fontSize: 26, color: NAVY }}>
                {data.vote_count}
              </div>
            </div>
            {adoptionPct !== null && (
              <div style={{ background: 'var(--dp-card-bg)', border: `1px solid ${LINE}`, borderRadius: 12, padding: '20px 22px' }}>
                <div style={{ fontSize: 13, color: 'var(--dp-text-secondary)', fontWeight: 500, marginBottom: 8 }}>
                  Taux d&apos;adoption
                </div>
                <div className="font-mono" style={{ fontWeight: 700, fontSize: 26, color: NAVY }}>
                  {adoptionPct}%
                </div>
              </div>
            )}
            {data.most_divided_vote && (
              <div style={{ background: 'var(--dp-card-bg)', border: `1px solid ${LINE}`, borderRadius: 12, padding: '20px 22px' }}>
                <div style={{ fontSize: 13, color: 'var(--dp-text-secondary)', fontWeight: 500, marginBottom: 8 }}>
                  Vote le plus disputé
                </div>
                <Link
                  href={`/votes/${data.most_divided_vote.vote_id}`}
                  style={{ fontWeight: 600, fontSize: 14.5, color: NAVY, textDecoration: 'none', display: 'block' }}
                >
                  {data.most_divided_vote.vote_title}
                </Link>
                <div style={{ fontSize: 12.5, color: 'var(--dp-text-muted)', marginTop: 6 }}>
                  {data.most_divided_vote.votes_for} pour · {data.most_divided_vote.votes_against} contre
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 sm:px-14 pt-10 pb-14 sm:pb-[72px]">
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 48 }}>

          {/* Per-party positioning */}
          {data.party_positions.length > 0 && (
            <section>
              <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: RED }}>
                Positionnement par groupe
              </div>
              <h2 className="font-newsreader text-section-sm" style={{ fontWeight: 600, color: NAVY, margin: '12px 0 22px', letterSpacing: '-0.01em' }}>
                Qui vote pour sur ce thème ?
              </h2>
              <div style={{
                background: 'var(--dp-card-bg)', border: `1px solid ${LINE}`, borderRadius: 12,
                padding: '22px 24px', boxShadow: '0 1px 3px var(--dp-shadow-sm)',
              }}>
                {data.party_positions.map((p: ThemePartyPosition) => {
                  const label = normalizePartyShort(p.party_short) ?? 'Non inscrit'
                  const hex = partyHex(label === 'Non inscrit' ? null : label)
                  const pourPct = pct(p.pour_rate)
                  return (
                    <div key={p.party_short ?? 'Non inscrit'} style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: hex }} />
                          <span style={{ color: 'var(--dp-text-secondary)', fontWeight: 600 }}>{label}</span>
                        </span>
                        <span className="font-mono" style={{ color: 'var(--dp-text-secondary)' }}>
                          {pourPct !== null ? `${pourPct}% pour` : '—'} · {p.expressed} vote{p.expressed !== 1 ? 's' : ''} exprimé{p.expressed !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div style={{ height: 6, borderRadius: 999, background: 'var(--dp-track-bg)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pourPct ?? 0}%`, background: hex, borderRadius: 999 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Votes list */}
          <section>
            <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: RED }}>
              Scrutins
            </div>
            <h2 className="font-newsreader text-section-sm" style={{ fontWeight: 600, color: NAVY, margin: '12px 0 22px', letterSpacing: '-0.01em' }}>
              Tous les votes sur {data.name}
            </h2>
            <div style={{
              background: 'var(--dp-card-bg)', border: `1px solid ${LINE}`, borderRadius: 12,
              overflow: 'hidden', boxShadow: '0 1px 3px var(--dp-shadow-sm)',
            }}>
              {data.votes.map((v: ThemeVoteItem, i: number) => (
                <Link
                  key={v.vote_id}
                  href={`/votes/${v.vote_id}`}
                  style={{
                    display: 'block', padding: '16px 22px', textDecoration: 'none',
                    borderBottom: i < data.votes.length - 1 ? '1px solid var(--dp-track-bg)' : 'none',
                  }}
                >
                  {v.summary_plain && (
                    <div style={{ fontSize: 14.5, color: 'var(--dp-text-secondary)', marginBottom: 4 }}>
                      {v.summary_plain}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: NAVY, flex: '1 1 380px', minWidth: 0 }}>
                      {v.vote_title}
                    </span>
                    {v.result && (
                      <span
                        style={{
                          fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                          color: v.result === 'adopté' ? 'var(--dp-green)' : RED,
                          background: v.result === 'adopté' ? 'var(--dp-badge-pos-bg)' : 'var(--dp-badge-neg-bg)',
                        }}
                      >
                        {v.result === 'adopté' ? 'Adopté' : 'Rejeté'}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--dp-text-muted)', marginTop: 5 }}>
                    {v.voted_at ? formatDate(v.voted_at) : ''}
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* Other themes */}
          <section>
            <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: RED }}>
              Autres thèmes
            </div>
            <div className="flex flex-wrap" style={{ gap: 8, marginTop: 14 }}>
              {THEME_ENTRIES.filter(t => t.slug !== canonicalSlug).map(t => {
                const c = themeColors(t.name)
                return (
                  <Link
                    key={t.slug}
                    href={`/themes/${t.slug}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', padding: '6px 14px',
                      borderRadius: 999, fontSize: 13, fontWeight: 600, textDecoration: 'none',
                      color: c.c, background: c.bg,
                    }}
                  >
                    {t.name}
                  </Link>
                )
              })}
            </div>
          </section>

          {/* Cross-link */}
          <div>
            <Link href="/votes" style={{ fontSize: 14, color: NAVY, textDecoration: 'underline' }}>
              ← Tous les votes de l&apos;Assemblée nationale
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
