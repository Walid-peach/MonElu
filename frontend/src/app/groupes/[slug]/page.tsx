import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { GroupMember, GroupVoteBreakdown } from '@/lib/api'
import { partyHex, formatDate } from '@/lib/utils'
import { groupName } from '@/lib/groups'
import { DeputyAvatar } from '@/components/DeputyAvatar'
import { JsonLd } from '@/components/JsonLd'
import { SITE_URL, buildBreadcrumbJsonLd } from '@/lib/seo'
import { canonicalUrl } from '@/lib/site'

export const dynamicParams = true
export const revalidate = 3600

const NAVY  = '#1B2B50'
const CREAM = '#F7F4ED'
const LINE  = '#E4E6EA'
const RED   = '#C9302A'

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params
  const canonicalSlug = decodeURIComponent(slug).trim().toLowerCase()
  if (!groupName(canonicalSlug)) return {}
  const alternates = { canonical: canonicalUrl(`/groupes/${canonicalSlug}`) }
  const data = await api.groups.get(canonicalSlug).catch(() => null)
  if (!data) return { alternates }
  const title = `${data.name} - MonÉlu`
  const description =
    `Les ${data.member_count} député${data.member_count !== 1 ? 's' : ''} du groupe ${data.name} ` +
    'à l\'Assemblée nationale : cohésion, dissidents et votes qui les divisent.'
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

const MAJORITY_LABEL: Record<string, string> = {
  pour: 'Pour',
  contre: 'Contre',
  abstention: 'Abstention',
}

const MAJORITY_COLOR: Record<string, string> = {
  pour: '#15803D',
  contre: RED,
  abstention: '#9CA3AF',
}

export default async function GroupPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const canonicalSlug = decodeURIComponent(slug).trim().toLowerCase()
  const name = groupName(canonicalSlug)
  if (!name) notFound()

  const [data, nationalStats] = await Promise.all([
    api.groups.get(canonicalSlug).catch(() => null),
    api.deputies.stats().catch(() => null),
  ])
  if (!data) notFound()

  const hex = partyHex(data.name)
  const avgPresencePct = pct(data.avg_presence_rate)
  const nationalPresencePct = pct(nationalStats?.avg_presence_rate)
  const avgDissidentPct = pct(data.avg_dissident_rate)
  const cohesionPct = avgDissidentPct === null ? null : 100 - avgDissidentPct
  const topDissident = data.most_dissident_members[0]

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'Accueil', url: SITE_URL },
    { name: data.name, url: `${SITE_URL}/groupes/${data.slug}` },
  ])

  return (
    <div style={{ background: CREAM, minHeight: '100vh' }}>
      <JsonLd data={breadcrumb} />

      {/* Hero */}
      <div
        className="px-5 sm:px-14 pt-8 sm:pt-[50px] pb-8 sm:pb-10"
        style={{
          background: `linear-gradient(180deg,#fff 0%,${CREAM} 100%)`,
          borderBottom: '1px solid #ECE7DC',
        }}
      >
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontWeight: 700, fontSize: 12, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: RED, marginBottom: 16,
          }}>
            <span style={{ width: 9, height: 9, borderRadius: 999, background: hex }} />
            Groupe parlementaire
          </div>
          <h1 className="font-newsreader text-[clamp(32px,4vw,48px)]" style={{
            fontWeight: 600, lineHeight: 1.05, letterSpacing: '-0.015em',
            color: NAVY, margin: 0, maxWidth: 760,
          }}>
            {data.name}
          </h1>
          <p style={{ margin: '16px 0 0', fontSize: 17, lineHeight: 1.6, color: '#4B5563', maxWidth: 560 }}>
            Les {data.member_count} député{data.member_count !== 1 ? 's' : ''} de ce
            groupe à l&apos;Assemblée nationale : présence, cohésion et votes qui les divisent.
          </p>

          {/* Aggregate cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" style={{ marginTop: 30, maxWidth: 900 }}>
            {avgPresencePct !== null && (
              <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: '20px 22px' }}>
                <div style={{ fontSize: 13, color: '#6B7280', fontWeight: 500, marginBottom: 8 }}>
                  Présence moyenne
                </div>
                <div className="font-mono" style={{ fontWeight: 700, fontSize: 26, color: NAVY }}>
                  {avgPresencePct}%
                </div>
                {nationalPresencePct !== null && (
                  <div style={{ fontSize: 12.5, color: '#9CA3AF', marginTop: 6 }}>
                    Moyenne nationale : {nationalPresencePct}%
                  </div>
                )}
              </div>
            )}
            {cohesionPct !== null && (
              <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: '20px 22px' }}>
                <div style={{ fontSize: 13, color: '#6B7280', fontWeight: 500, marginBottom: 8 }}>
                  Cohésion du groupe
                </div>
                <div className="font-mono" style={{ fontWeight: 700, fontSize: 26, color: NAVY }}>
                  {cohesionPct}%
                </div>
                <div style={{ fontSize: 12.5, color: '#9CA3AF', marginTop: 6 }}>
                  Vote avec la majorité du groupe en moyenne
                </div>
              </div>
            )}
            {topDissident && (
              <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: '20px 22px' }}>
                <div style={{ fontSize: 13, color: '#6B7280', fontWeight: 500, marginBottom: 8 }}>
                  Le plus dissident
                </div>
                <Link href={`/deputes/${topDissident.deputy_id}`} style={{ fontWeight: 600, fontSize: 16, color: NAVY, textDecoration: 'none' }}>
                  {topDissident.full_name}
                </Link>
                <div style={{ fontSize: 12.5, color: '#9CA3AF', marginTop: 6 }}>
                  Vote contre le groupe dans {pct(topDissident.dissident_rate)}% des scrutins
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 sm:px-14 pt-10 pb-14 sm:pb-[72px]">
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 48 }}>

          {/* Members */}
          <section>
            <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: RED }}>
              Membres
            </div>
            <h2 className="font-newsreader text-section-sm" style={{ fontWeight: 600, color: NAVY, margin: '12px 0 22px', letterSpacing: '-0.01em' }}>
              Député{data.member_count !== 1 ? 's' : ''} du groupe
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {data.members.map((m: GroupMember) => {
                const presence = pct(m.presence_rate)
                const dissident = pct(m.dissident_rate)
                return (
                  <Link
                    key={m.deputy_id}
                    href={`/deputes/${m.deputy_id}`}
                    style={{
                      display: 'block', background: '#fff', border: `1px solid ${LINE}`,
                      borderRadius: 12, padding: '20px 22px', textDecoration: 'none',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                      <DeputyAvatar name={m.full_name} photoUrl={m.photo_url} size="sm" decorative />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 15.5, color: NAVY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {m.full_name}
                        </div>
                        <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 3 }}>
                          {m.department ?? '—'}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
                      {presence !== null && (
                        <span className="font-mono" style={{ fontSize: 12, color: '#6B7280' }}>
                          Présence {presence}%
                        </span>
                      )}
                      {dissident !== null && (
                        <span className="font-mono" style={{ fontSize: 12, color: '#6B7280' }}>
                          Dissidence {dissident}%
                        </span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>

          {/* Most dissident */}
          {data.most_dissident_members.length > 0 && (
            <section>
              <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: RED }}>
                Les frondeurs
              </div>
              <h2 className="font-newsreader text-section-sm" style={{ fontWeight: 600, color: NAVY, margin: '12px 0 22px', letterSpacing: '-0.01em' }}>
                Les députés qui s&apos;écartent le plus du groupe
              </h2>
              <div style={{
                background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12,
                overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}>
                {data.most_dissident_members.map((m, i) => (
                  <Link
                    key={m.deputy_id}
                    href={`/deputes/${m.deputy_id}`}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 22px', textDecoration: 'none', gap: 16,
                      borderBottom: i < data.most_dissident_members.length - 1 ? '1px solid #F0F1F3' : 'none',
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 14.5, color: NAVY }}>{m.full_name}</span>
                    <span className="font-mono" style={{ fontSize: 13, color: RED }}>{pct(m.dissident_rate)}%</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Divided votes */}
          {data.divided_votes.length > 0 && (
            <section>
              <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: RED }}>
                Là où ils se divisent
              </div>
              <h2 className="font-newsreader text-section-sm" style={{ fontWeight: 600, color: NAVY, margin: '12px 0 8px', letterSpacing: '-0.01em' }}>
                Les votes les plus disputés au sein du groupe
              </h2>
              <p style={{ margin: '0 0 22px', fontSize: 14.5, color: '#6B7280', maxWidth: 640 }}>
                Scrutins où le groupe s&apos;est le plus partagé entre pour et contre.
              </p>
              <VoteBreakdownList votes={data.divided_votes} />
            </section>
          )}

          {/* Recent scrutins */}
          {data.recent_scrutins.length > 0 && (
            <section>
              <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: RED }}>
                Votes récents
              </div>
              <h2 className="font-newsreader text-section-sm" style={{ fontWeight: 600, color: NAVY, margin: '12px 0 22px', letterSpacing: '-0.01em' }}>
                Comment le groupe a voté récemment
              </h2>
              <VoteBreakdownList votes={data.recent_scrutins} />
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

function VoteBreakdownList({ votes }: { votes: GroupVoteBreakdown[] }) {
  return (
    <div style={{
      background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12,
      overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      {votes.map((v, i) => (
        <Link
          key={v.vote_id}
          href={`/votes/${v.vote_id}`}
          style={{
            display: 'block', padding: '16px 22px', textDecoration: 'none',
            borderBottom: i < votes.length - 1 ? '1px solid #F0F1F3' : 'none',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 14.5, color: NAVY, flex: '1 1 380px', minWidth: 0 }}>
              {v.vote_title}
            </span>
            <span style={{ display: 'flex', gap: 12, alignItems: 'baseline', whiteSpace: 'nowrap' }}>
              <span className="font-mono" style={{ fontSize: 12.5, color: '#15803D' }}>{v.pour} pour</span>
              <span className="font-mono" style={{ fontSize: 12.5, color: RED }}>{v.contre} contre</span>
              {v.abstention > 0 && (
                <span className="font-mono" style={{ fontSize: 12.5, color: '#9CA3AF' }}>{v.abstention} abst.</span>
              )}
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: '#9CA3AF', marginTop: 5 }}>
            {v.voted_at ? formatDate(v.voted_at) : ''}
            {v.result ? ` · ${v.result === 'adopté' ? 'Adopté' : 'Rejeté'}` : ''}
            {' · '}
            <span style={{ color: MAJORITY_COLOR[v.majority_position] ?? '#9CA3AF' }}>
              Groupe majoritairement {MAJORITY_LABEL[v.majority_position] ?? v.majority_position}
            </span>
          </div>
        </Link>
      ))}
    </div>
  )
}
