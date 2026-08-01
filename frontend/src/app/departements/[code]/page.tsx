import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { DepartmentDeputy } from '@/lib/api'
import { partyHex, partyShort, formatDate } from '@/lib/utils'
import { departmentCode } from '@/lib/departments'
import { groupSlug } from '@/lib/groups'
import { DeputyAvatar } from '@/components/DeputyAvatar'
import { JsonLd } from '@/components/JsonLd'
import { SITE_URL, buildBreadcrumbJsonLd } from '@/lib/seo'

export const dynamicParams = true
export const revalidate = 3600

const NAVY   = 'var(--dp-text)'
const CREAM  = 'var(--dp-page-bg)'
const LINE   = 'var(--dp-border)'
const RED    = 'var(--dp-red)'

// "les députés de la Gironde" needs per-department articles the data does
// not carry — every phrase below stays article-free on the department name.
function pageTitle(name: string, code: string): string {
  return code === '99' ? `Députés ${name}` : `Députés du département ${name} (${code})`
}

export async function generateMetadata(
  { params }: { params: Promise<{ code: string }> }
): Promise<Metadata> {
  const { code } = await params
  const canonical = departmentCode(decodeURIComponent(code))
  if (!canonical) return {}
  const data = await api.departments.get(canonical).catch(() => null)
  if (!data) return {}
  const title = `${pageTitle(data.name, data.code)} - MonÉlu`
  const description =
    `Les ${data.deputy_count} députés du département ${data.name} à l'Assemblée nationale : ` +
    'bilan de vote, présence, groupes politiques et votes qui les divisent.'
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: 'summary_large_image', title, description },
  }
}

// circonscription is stored as a bare number string ("1", "10").
function circoNumber(circonscription: string | null): number | null {
  if (!circonscription) return null
  const n = parseInt(circonscription, 10)
  return Number.isNaN(n) ? null : n
}

// Anchor id for per-circonscription deep links: /departements/33#circo-1
function circoAnchor(circonscription: string | null): string | undefined {
  const n = circoNumber(circonscription)
  return n === null ? undefined : `circo-${n}`
}

function circoLabel(circonscription: string | null): string | null {
  const n = circoNumber(circonscription)
  if (n === null) return circonscription
  return n === 1 ? '1ère circonscription' : `${n}ème circonscription`
}

function pct(rate: number | null | undefined): number | null {
  return rate == null ? null : Math.round(rate * 100)
}

export default async function DepartmentPage(
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const canonical = departmentCode(decodeURIComponent(code))
  if (!canonical) notFound()

  const [data, nationalStats] = await Promise.all([
    api.departments.get(canonical).catch(() => null),
    api.deputies.stats().catch(() => null),
  ])
  if (!data) notFound()

  const avgPresencePct = pct(data.avg_presence_rate)
  const nationalPresencePct = pct(nationalStats?.avg_presence_rate)
  const maxPartyCount = data.party_distribution[0]?.count ?? 1
  const dissident = data.most_dissident
  const dissidentPct = pct(dissident?.dissident_rate)

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'Accueil', url: SITE_URL },
    { name: 'Députés', url: `${SITE_URL}/deputes` },
    { name: `${data.name} (${data.code})`, url: `${SITE_URL}/departements/${data.code}` },
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
            textTransform: 'uppercase', color: RED, marginBottom: 16,
          }}>
            {data.code === '99' ? 'Circonscriptions des Français de l’étranger' : `Département ${data.code}`}
          </div>
          <h1 className="font-newsreader text-[clamp(32px,4vw,48px)]" style={{
            fontWeight: 600, lineHeight: 1.05, letterSpacing: '-0.015em',
            color: NAVY, margin: 0, maxWidth: 760,
          }}>
            {data.name}
          </h1>
          <p style={{ margin: '16px 0 0', fontSize: 17, lineHeight: 1.6, color: 'var(--dp-text-secondary)', maxWidth: 560 }}>
            Les {data.deputy_count} député{data.deputy_count !== 1 ? 's' : ''} de ce
            territoire à l&apos;Assemblée nationale : bilan de vote, présence et votes
            qui les divisent.
          </p>

          {/* Aggregate cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" style={{ marginTop: 30, maxWidth: 900 }}>
            {avgPresencePct !== null && (
              <div style={{ background: 'var(--dp-card-bg)', border: `1px solid ${LINE}`, borderRadius: 12, padding: '20px 22px' }}>
                <div style={{ fontSize: 13, color: 'var(--dp-text-secondary)', fontWeight: 500, marginBottom: 8 }}>
                  Présence moyenne
                </div>
                <div className="font-mono" style={{ fontWeight: 700, fontSize: 26, color: NAVY }}>
                  {avgPresencePct}%
                </div>
                {nationalPresencePct !== null && (
                  <div style={{ fontSize: 12.5, color: 'var(--dp-text-muted)', marginTop: 6 }}>
                    Moyenne nationale : {nationalPresencePct}%
                  </div>
                )}
              </div>
            )}
            {dissident && dissidentPct !== null && (
              <div style={{ background: 'var(--dp-card-bg)', border: `1px solid ${LINE}`, borderRadius: 12, padding: '20px 22px' }}>
                <div style={{ fontSize: 13, color: 'var(--dp-text-secondary)', fontWeight: 500, marginBottom: 8 }}>
                  Député le plus dissident
                </div>
                <Link href={`/deputes/${dissident.deputy_id}`} style={{ fontWeight: 600, fontSize: 16, color: NAVY, textDecoration: 'none' }}>
                  {dissident.full_name}
                </Link>
                <div style={{ fontSize: 12.5, color: 'var(--dp-text-muted)', marginTop: 6 }}>
                  Vote contre son groupe dans {dissidentPct}% des scrutins
                </div>
              </div>
            )}
            <div style={{ background: 'var(--dp-card-bg)', border: `1px solid ${LINE}`, borderRadius: 12, padding: '20px 22px' }}>
              <div style={{ fontSize: 13, color: 'var(--dp-text-secondary)', fontWeight: 500, marginBottom: 12 }}>
                Répartition par groupe
              </div>
              {data.party_distribution.map(g => {
                const href = groupSlug(g.party)
                const label = partyShort(g.party) || 'Non inscrit'
                return (
                <div key={g.party ?? 'Non inscrit'} style={{ marginBottom: 9 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: partyHex(g.party) }} />
                      {href ? (
                        <Link href={`/groupes/${href}`} style={{ color: 'var(--dp-text-secondary)', fontWeight: 600, textDecoration: 'none' }}>
                          {label}
                        </Link>
                      ) : (
                        <span style={{ color: 'var(--dp-text-secondary)', fontWeight: 600 }}>{label}</span>
                      )}
                    </span>
                    <span className="font-mono" style={{ color: 'var(--dp-text-muted)' }}>{g.count}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 999, background: 'var(--dp-track-bg)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(g.count / maxPartyCount) * 100}%`, background: partyHex(g.party), borderRadius: 999 }} />
                  </div>
                </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 sm:px-14 pt-10 pb-14 sm:pb-[72px]">
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 48 }}>

          {/* Deputies */}
          <section>
            <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: RED }}>
              Vos élus
            </div>
            <h2 className="font-newsreader text-section-sm" style={{ fontWeight: 600, color: NAVY, margin: '12px 0 22px', letterSpacing: '-0.01em' }}>
              Député{data.deputy_count !== 1 ? 's' : ''} par circonscription
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {data.deputies.map((d: DepartmentDeputy) => {
                const hex = partyHex(d.party)
                const presence = pct(d.presence_rate)
                const alignment = pct(d.party_alignment_rate)
                return (
                  <Link
                    key={d.deputy_id}
                    id={circoAnchor(d.circonscription)}
                    href={`/deputes/${d.deputy_id}`}
                    style={{
                      display: 'block', background: 'var(--dp-card-bg)', border: `1px solid ${LINE}`,
                      borderRadius: 12, padding: '20px 22px', textDecoration: 'none',
                      boxShadow: '0 1px 3px var(--dp-shadow-sm)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                      <DeputyAvatar name={d.full_name} photoUrl={d.photo_url} size="sm" decorative />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 15.5, color: NAVY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {d.full_name}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--dp-text-muted)', marginTop: 3 }}>
                          {circoLabel(d.circonscription) ?? '—'}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '3px 10px', borderRadius: 999,
                        background: `${hex}14`, border: `1px solid ${hex}40`,
                        color: hex, fontWeight: 600, fontSize: 12,
                      }}>
                        <span style={{ width: 7, height: 7, borderRadius: 999, background: hex }} />
                        {partyShort(d.party) || 'NI'}
                      </span>
                      {presence !== null && (
                        <span className="font-mono" style={{ fontSize: 12, color: 'var(--dp-text-secondary)' }}>
                          Présence {presence}%
                        </span>
                      )}
                      {alignment !== null && (
                        <span className="font-mono" style={{ fontSize: 12, color: 'var(--dp-text-secondary)' }}>
                          Groupe {alignment}%
                        </span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>

          {/* Split votes */}
          {data.split_votes.length > 0 && (
            <section>
              <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: RED }}>
                Là où ils se divisent
              </div>
              <h2 className="font-newsreader text-section-sm" style={{ fontWeight: 600, color: NAVY, margin: '12px 0 8px', letterSpacing: '-0.01em' }}>
                Votes récents où vos députés n&apos;étaient pas d&apos;accord
              </h2>
              <p style={{ margin: '0 0 22px', fontSize: 14.5, color: 'var(--dp-text-secondary)', maxWidth: 640 }}>
                Scrutins où au moins un député du territoire a voté pour et un autre contre.
              </p>
              <div style={{
                background: 'var(--dp-card-bg)', border: `1px solid ${LINE}`, borderRadius: 12,
                overflow: 'hidden', boxShadow: '0 1px 3px var(--dp-shadow-sm)',
              }}>
                {data.split_votes.map((v, i) => (
                  <Link
                    key={v.vote_id}
                    href={`/votes/${v.vote_id}`}
                    style={{
                      display: 'block', padding: '16px 22px', textDecoration: 'none',
                      borderBottom: i < data.split_votes.length - 1 ? '1px solid var(--dp-track-bg)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 14.5, color: NAVY, flex: '1 1 380px', minWidth: 0 }}>
                        {v.vote_title}
                      </span>
                      <span style={{ display: 'flex', gap: 12, alignItems: 'baseline', whiteSpace: 'nowrap' }}>
                        <span className="font-mono" style={{ fontSize: 12.5, color: 'var(--dp-green)' }}>{v.pour} pour</span>
                        <span className="font-mono" style={{ fontSize: 12.5, color: RED }}>{v.contre} contre</span>
                        {v.abstention > 0 && (
                          <span className="font-mono" style={{ fontSize: 12.5, color: 'var(--dp-text-muted)' }}>{v.abstention} abst.</span>
                        )}
                      </span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--dp-text-muted)', marginTop: 5 }}>
                      {v.voted_at ? formatDate(v.voted_at) : ''}
                      {v.result ? ` · ${v.result === 'adopté' ? 'Adopté' : 'Rejeté'}` : ''}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Cross-link */}
          <div>
            <Link href="/deputes" style={{ fontSize: 14, color: NAVY, textDecoration: 'underline' }}>
              ← Tous les députés de l&apos;Assemblée nationale
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
