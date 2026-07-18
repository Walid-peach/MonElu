import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { api, csvUrl } from '@/lib/api'
import type { DissidentVoteItem } from '@/lib/api'
import { partyHex, formatDate } from '@/lib/utils'
import { departmentCode, departmentLabel } from '@/lib/departments'
import { positionStyle } from '@/lib/vote-position'
import { DeputyAvatar } from '@/components/DeputyAvatar'
import { ShareButton } from '@/components/ShareButton'
import { ReportErrorButton } from '@/components/ReportErrorButton'
import { InfoTooltip } from '@/components/InfoTooltip'
import { FollowDeputyButton } from '@/components/FollowDeputyButton'
import { VoteTimelineItem } from '@/components/VoteTimelineItem'
import { JsonLd } from '@/components/JsonLd'
import { SITE_URL, buildPersonJsonLd, buildBreadcrumbJsonLd } from '@/lib/seo'

export const dynamicParams = true
export const revalidate = 86400

const NAVY   = '#1B2B50'
const CREAM  = '#F7F4ED'
const LINE   = '#E4E6EA'
const ACCENT = '#E0786E'
const RED    = '#C9302A'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const deputy = await api.deputies.get(id).catch(() => null)
  if (!deputy) return {}
  const description = `Bilan de mandat, votes et présence de ${deputy.full_name}${
    deputy.party ? ` (${deputy.party})` : deputy.department ? ` - ${departmentLabel(deputy.department)}` : ''
  }.`
  return {
    title: `${deputy.full_name} - MonÉlu`,
    description,
    openGraph: { title: `${deputy.full_name} - MonÉlu`, description },
    twitter:   { card: 'summary_large_image', title: `${deputy.full_name} - MonÉlu`, description },
  }
}

export default async function DeputyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [deputy, scorecard, deputyStats, recentVotes, alignment, dissidentVotes] = await Promise.all([
    api.deputies.get(id).catch(() => null),
    api.deputies.scorecard(id).catch(() => null),
    api.deputies.stats().catch(() => null),
    api.deputies.votes(id, 10).catch(() => null),
    api.deputies.alignment(id).catch(() => null),
    api.deputies.dissidentVotes(id, 10).catch(() => null),
  ])
  if (!deputy) notFound()

  const alignmentPct = alignment ? Math.round(alignment.party_alignment_rate * 100) : null

  const presencePct    = scorecard ? Math.round((scorecard.presence_rate ?? 0) * 100) : null
  const avgPresencePct = deputyStats ? Math.round((deputyStats.avg_presence_rate ?? 0) * 100) : null

  // MON-124: the all-scrutins presence_rate above is dominated by amendment
  // scrutins where only ~15% of deputies vote, which reads as absenteeism
  // even for deputies with strong attendance. These two metrics have
  // denominators where absence is actually meaningful — see
  // notes/dispatch/presence_kpi_comparison_2026-07-09.md.
  const solennelPct    = scorecard ? Math.round((scorecard.solennel_participation_rate ?? 0) * 100) : null
  const avgSolennelPct = deputyStats?.avg_solennel_participation_rate != null
    ? Math.round(deputyStats.avg_solennel_participation_rate * 100) : null
  const votingDaysPct    = scorecard ? Math.round((scorecard.voting_days_rate ?? 0) * 100) : null
  const avgVotingDaysPct = deputyStats?.avg_voting_days_rate != null
    ? Math.round(deputyStats.avg_voting_days_rate * 100) : null

  const denom          = scorecard ? (scorecard.present_votes || 1) : 1
  const pourPct        = scorecard ? Math.round(scorecard.votes_for     / denom * 100) : 0
  const contrePct      = scorecard ? Math.round(scorecard.votes_against / denom * 100) : 0
  const abstPct        = scorecard ? Math.round(scorecard.abstentions   / denom * 100) : 0

  const hex = partyHex(deputy.party)
  const deptLabel = departmentLabel(deputy.department)
  const deptCode = departmentCode(deputy.department)

  // MON-123: "votes exprimés" (present_votes = pour + contre + abstention)
  // duplicated "scrutins votés" whenever the deputy has no non-votant
  // position — show the non-votant count instead.
  const nonVotant = scorecard ? scorecard.total_votes - scorecard.present_votes : 0

  const stats: { value: string; label: string; tooltip?: string }[] = scorecard ? [
    { value: scorecard.total_votes.toLocaleString('fr-FR'),    label: 'scrutins votés' },
    { value: `${solennelPct ?? '—'}%`,                        label: 'participation aux scrutins solennels' },
    { value: scorecard.votes_for.toLocaleString('fr-FR'),      label: 'votes Pour' },
    { value: scorecard.votes_against.toLocaleString('fr-FR'),  label: 'votes Contre' },
    { value: scorecard.abstentions.toLocaleString('fr-FR'),    label: 'abstentions' },
    {
      value: nonVotant.toLocaleString('fr-FR'),
      label: 'non-votant',
      tooltip: "Présent·e en séance sans exprimer de vote — distinct de l'abstention, qui est une position exprimée.",
    },
  ] : []

  return (
    <div style={{ background: CREAM, minHeight: '100vh' }}>
      <JsonLd data={buildPersonJsonLd(deputy)} />
      <JsonLd data={buildBreadcrumbJsonLd([
        { name: 'Accueil', url: SITE_URL },
        { name: 'Députés', url: `${SITE_URL}/deputes` },
        { name: deputy.full_name, url: `${SITE_URL}/deputes/${id}` },
      ])} />

      {/* Hero band */}
      <div className="px-5 sm:px-14 pt-6 sm:pt-[38px] pb-8 sm:pb-11" style={{
        background: `linear-gradient(180deg,#ffffff 0%,${CREAM} 100%)`,
        borderBottom: `1px solid #ECE7DC`,
      }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>

          {/* Breadcrumb */}
          <div style={{ fontSize: 13.5, color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 26 }}>
            <Link
              href="/deputes"
              style={{ color: RED, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none', fontWeight: 500 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="m15 18-6-6 6-6"/>
              </svg>
              Retour aux députés
            </Link>
            <span>/</span>
            <span style={{ color: '#6B7280' }}>{deputy.full_name}</span>
          </div>

          {/* Photo + identity */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-11">

            {/* Left: photo */}
            <div className="sm:shrink-0" style={{ width: 210 }}>
              <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid #ECE7DC`, boxShadow: '0 6px 20px rgba(27,43,80,0.12)' }}>
                <DeputyAvatar name={deputy.full_name} photoUrl={deputy.photo_url} size="2xl" priority />
              </div>
            </div>

            {/* Right: identity */}
            <div className="w-full text-center sm:text-left" style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: RED }}>
                Député·e · XVII<sup>e</sup> législature
              </div>
              <h1 className="font-newsreader text-[clamp(36px,4.5vw,58px)]" style={{
                fontWeight: 600, lineHeight: 1.0,
                letterSpacing: '-0.02em', color: NAVY, margin: '14px 0 0',
              }}>
                {deputy.full_name}
              </h1>
              {deptLabel && (
                <div className="justify-center sm:justify-start" style={{ fontSize: 20, color: '#4B5563', marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11Z"/><circle cx="12" cy="10" r="2.4"/>
                  </svg>
                  {deptCode ? (
                    <Link href={`/departements/${deptCode}`} style={{ color: '#4B5563', textDecoration: 'underline', textDecorationColor: '#C4C9D2', textUnderlineOffset: 3 }}>
                      {deptLabel}
                    </Link>
                  ) : (
                    deptLabel
                  )}
                </div>
              )}
              {deputy.party && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 9,
                  marginTop: 18, padding: '8px 16px', borderRadius: 999,
                  background: `${hex}14`, border: `1px solid ${hex}40`,
                  color: hex, fontWeight: 600, fontSize: 14,
                }}>
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: hex }} />
                  {deputy.party}
                </div>
              )}

              {/* CTA buttons */}
              <div className="justify-center sm:justify-start" style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
                <Link
                  href={`/chat?q=${encodeURIComponent(`Quel est le bilan de ${deputy.full_name} ?`)}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: ACCENT, color: '#fff', padding: '12px 24px',
                    borderRadius: 9, fontWeight: 600, fontSize: 15,
                    boxShadow: '0 2px 8px rgba(224,120,110,0.35)', textDecoration: 'none',
                  }}
                >
                  Poser une question sur ce député
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                  </svg>
                </Link>
                <a
                  href="#votes"
                  style={{
                    display: 'inline-flex', alignItems: 'center',
                    background: '#fff', border: `1px solid ${LINE}`, color: NAVY,
                    padding: '12px 22px', borderRadius: 9, fontWeight: 600,
                    fontSize: 15, textDecoration: 'none',
                  }}
                >
                  Votes récents
                </a>
                <ShareButton
                  url={`/deputes/${id}`}
                  title={`${deputy.full_name} - MonÉlu`}
                  text={`Bilan de mandat et votes de ${deputy.full_name}`}
                  ariaLabel="Partager ce député"
                />
                <FollowDeputyButton deputyId={id} />
                <Link
                  href={`/deputes/comparer?a=${id}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: '#fff', border: `1px solid ${LINE}`, color: NAVY,
                    padding: '12px 22px', borderRadius: 9, fontWeight: 600,
                    fontSize: 15, textDecoration: 'none',
                  }}
                >
                  Comparer
                </Link>
                <a
                  href={csvUrl.deputyVotes(id)}
                  download
                  title="Télécharger l'historique de vote complet (CSV)"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: '#fff', border: `1px solid ${LINE}`, color: NAVY,
                    padding: '12px 22px', borderRadius: 9, fontWeight: 600,
                    fontSize: 15, textDecoration: 'none',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  CSV
                </a>
                <Link
                  href={`/deputes/${id}/dossier`}
                  target="_blank"
                  title="Ouvrir le dossier imprimable (photo, bilan, votes marquants)"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: '#fff', border: `1px solid ${LINE}`, color: NAVY,
                    padding: '12px 22px', borderRadius: 9, fontWeight: 600,
                    fontSize: 15, textDecoration: 'none',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                  Exporter en PDF
                </Link>
                <ReportErrorButton
                  entityType="deputy"
                  entityId={id}
                  entityLabel={deputy.full_name}
                  pageUrl={`/deputes/${id}`}
                />
              </div>
            </div>
          </div>

          {/* Stats strip */}
          {stats.length > 0 && (
            <div
              className="grid grid-cols-3 sm:grid-cols-6 mt-8 sm:mt-[38px] border-t"
              style={{ borderColor: '#ECE7DC' }}
            >
              {stats.map((s, i) => {
                const classes = [
                  'px-3 sm:px-3.5 pt-5 sm:pt-[22px] pb-4 sm:pb-[18px] border-[#ECE7DC]',
                  i % 3 === 2 ? '' : 'border-r',
                  i >= stats.length - 3 ? '' : 'border-b',
                  i === stats.length - 1 ? 'sm:border-r-0' : 'sm:border-r',
                  'sm:border-b-0',
                ].filter(Boolean).join(' ')
                return (
                  <div key={i} className={classes}>
                    <div className="font-newsreader text-[26px] sm:text-[34px]" style={{ fontWeight: 600, color: NAVY, letterSpacing: '-0.01em', lineHeight: 1 }}>
                      {s.value}
                    </div>
                    <div style={{ fontSize: 12.5, color: '#6B7280', marginTop: 4, lineHeight: 1.35, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {s.label}
                      {s.tooltip && <InfoTooltip text={s.tooltip} href="/methodologie" />}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-5 sm:px-14 pt-8 sm:pt-[52px] pb-14 sm:pb-20">
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 52 }}>

          {/* Vote breakdown */}
          {scorecard && (
            <section>
              <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: RED }}>
                Bilan de mandat
              </div>
              <h2 className="font-newsreader text-section-sm" style={{ fontWeight: 600, color: NAVY, margin: '12px 0 22px', letterSpacing: '-0.01em' }}>
                Répartition des votes
              </h2>
              <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '26px 30px' }}>

                {/* Stacked bar */}
                <div style={{ height: 12, borderRadius: 999, overflow: 'hidden', display: 'flex', marginBottom: 14 }}>
                  <div style={{ width: `${pourPct}%`,   background: '#1F8A5B', height: '100%', transition: 'width 0.4s' }} />
                  <div style={{ width: `${contrePct}%`, background: RED,       height: '100%', transition: 'width 0.4s' }} />
                  <div style={{ width: `${abstPct}%`,   background: '#D1D5DB', height: '100%', transition: 'width 0.4s' }} />
                  <div style={{ flex: 1,                background: '#EEF0F2', height: '100%' }} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', fontSize: 14, color: '#374151' }}>
                  {[
                    { color: '#1F8A5B', label: 'Pour',       pct: pourPct   },
                    { color: RED,       label: 'Contre',     pct: contrePct },
                    { color: '#9CA3AF', label: 'Abstention', pct: abstPct   },
                  ].map(({ color, label, pct }) => (
                    <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 999, background: color, flexShrink: 0 }} />
                      {label} <span className="font-mono" style={{ color: '#6B7280' }}>{pct}%</span>
                    </span>
                  ))}
                </div>

                {/* Participation aux scrutins solennels (MON-124) */}
                {solennelPct !== null && (
                  <div style={{ marginTop: 28, paddingTop: 24, borderTop: `1px solid ${LINE}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 14, color: '#6B7280', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                        Participation aux scrutins solennels
                        <InfoTooltip
                          text="Les scrutins solennels sont des votes programmés sur l'ensemble d'un texte, où la présence de tous les groupes est attendue — contrairement aux scrutins d'amendements, votés en petit comité. C'est la mesure la plus proche de « présence aux votes qui comptent »."
                          href="/methodologie#presence"
                        />
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {avgSolennelPct !== null && (
                          <span style={{ fontSize: 13, color: solennelPct >= avgSolennelPct ? '#1F8A5B' : RED }}>
                            {solennelPct >= avgSolennelPct ? '↑' : '↓'} moy. {avgSolennelPct}%
                          </span>
                        )}
                        <span className="font-mono" style={{ fontWeight: 700, fontSize: 18, color: NAVY }}>
                          {solennelPct}%
                          <span style={{ fontWeight: 400, fontSize: 13, color: '#9CA3AF', marginLeft: 6 }}>
                            ({scorecard?.solennels_cast}/{scorecard?.eligible_solennels})
                          </span>
                        </span>
                      </div>
                    </div>
                    <div style={{ position: 'relative', height: 9, background: '#EEF0F2', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: NAVY, borderRadius: 999, width: `${solennelPct}%`, transition: 'width 0.4s' }} />
                    </div>
                    {avgSolennelPct !== null && (
                      <div style={{ position: 'relative', height: 0 }}>
                        <div style={{ position: 'absolute', top: -9, height: 9, width: 2, background: 'rgba(0,0,0,0.25)', left: `${avgSolennelPct}%` }} aria-hidden="true" />
                      </div>
                    )}
                    {avgSolennelPct !== null && (
                      <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8 }}>
                        Trait vertical = moyenne nationale ({avgSolennelPct}%)
                      </p>
                    )}
                  </div>
                )}

                {/* Présence par jour de vote (MON-124) */}
                {votingDaysPct !== null && (
                  <div style={{ marginTop: 28, paddingTop: 24, borderTop: `1px solid ${LINE}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 14, color: '#6B7280', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                        Présence par jour de vote
                        <InfoTooltip
                          text="Une journée de séance peut contenir plusieurs dizaines de scrutins sur un même texte. Ce taux compte les journées où le·la député·e a voté au moins une fois, plutôt que chaque scrutin séparément — un meilleur indicateur de présence physique."
                          href="/methodologie#presence"
                        />
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {avgVotingDaysPct !== null && (
                          <span style={{ fontSize: 13, color: votingDaysPct >= avgVotingDaysPct ? '#1F8A5B' : RED }}>
                            {votingDaysPct >= avgVotingDaysPct ? '↑' : '↓'} moy. {avgVotingDaysPct}%
                          </span>
                        )}
                        <span className="font-mono" style={{ fontWeight: 700, fontSize: 18, color: NAVY }}>
                          {votingDaysPct}%
                          <span style={{ fontWeight: 400, fontSize: 13, color: '#9CA3AF', marginLeft: 6 }}>
                            ({scorecard?.voting_days_present}/{scorecard?.eligible_voting_days} jours)
                          </span>
                        </span>
                      </div>
                    </div>
                    <div style={{ position: 'relative', height: 9, background: '#EEF0F2', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: NAVY, borderRadius: 999, width: `${votingDaysPct}%`, transition: 'width 0.4s' }} />
                    </div>
                    {avgVotingDaysPct !== null && (
                      <div style={{ position: 'relative', height: 0 }}>
                        <div style={{ position: 'absolute', top: -9, height: 9, width: 2, background: 'rgba(0,0,0,0.25)', left: `${avgVotingDaysPct}%` }} aria-hidden="true" />
                      </div>
                    )}
                    {avgVotingDaysPct !== null && (
                      <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8 }}>
                        Trait vertical = moyenne nationale ({avgVotingDaysPct}%)
                      </p>
                    )}
                  </div>
                )}

                {/* Presence bar (all scrutins — see MON-124 for the copy/demotion follow-up) */}
                {presencePct !== null && (
                  <div style={{ marginTop: 28, paddingTop: 24, borderTop: `1px solid ${LINE}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 14, color: '#6B7280', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                        Taux de présence aux votes
                        <InfoTooltip
                          text="Un·e député·e est compté·e présent·e dès qu'une position est enregistrée, y compris non-votant (présent en séance sans prise de position). Le dénominateur ne compte que les scrutins tenus pendant son mandat."
                          href="/methodologie#presence"
                        />
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {avgPresencePct !== null && (
                          <span style={{ fontSize: 13, color: presencePct >= avgPresencePct ? '#1F8A5B' : RED }}>
                            {presencePct >= avgPresencePct ? '↑' : '↓'} moy. {avgPresencePct}%
                          </span>
                        )}
                        <span className="font-mono" style={{ fontWeight: 700, fontSize: 18, color: NAVY }}>{presencePct}%</span>
                      </div>
                    </div>
                    <div style={{ position: 'relative', height: 9, background: '#EEF0F2', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: NAVY, borderRadius: 999, width: `${presencePct}%`, transition: 'width 0.4s' }} />
                    </div>
                    {avgPresencePct !== null && (
                      <div style={{ position: 'relative', height: 0 }}>
                        <div style={{ position: 'absolute', top: -9, height: 9, width: 2, background: 'rgba(0,0,0,0.25)', left: `${avgPresencePct}%` }} aria-hidden="true" />
                      </div>
                    )}
                    {avgPresencePct !== null && (
                      <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8 }}>
                        Trait vertical = moyenne nationale ({avgPresencePct}%)
                      </p>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Party alignment / dissident rate */}
          {alignment && alignmentPct !== null && (
            <section>
              <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: RED }}>
                Alignement avec son groupe
              </div>
              <h2 className="font-newsreader text-section-sm" style={{ fontWeight: 600, color: NAVY, margin: '12px 0 22px', letterSpacing: '-0.01em' }}>
                Vote-t-il·elle avec son groupe politique ?
              </h2>
              <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '26px 30px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 14, color: '#6B7280', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                    Vote avec son groupe
                    <InfoTooltip text="Alignement calculé en comparant, vote par vote, la position du député à la position majoritaire de son groupe parlementaire actuel. Les votes non-votants sont exclus. Limite : l'historique est comparé au groupe actuel du député, même s'il en a changé en cours de mandat." />
                  </span>
                  <span className="font-mono" style={{ fontWeight: 700, fontSize: 18, color: NAVY }}>{alignmentPct}%</span>
                </div>
                <div style={{ position: 'relative', height: 9, background: '#EEF0F2', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: NAVY, borderRadius: 999, width: `${alignmentPct}%`, transition: 'width 0.4s' }} />
                </div>
                <p style={{ fontSize: 13, color: '#6B7280', marginTop: 16 }}>
                  <span style={{ fontWeight: 700, color: NAVY }}>{alignment.dissident_votes}</span> vote{alignment.dissident_votes !== 1 ? 's' : ''} dissident{alignment.dissident_votes !== 1 ? 's' : ''} sur {alignment.total_votes} vote{alignment.total_votes !== 1 ? 's' : ''} comptabilisé{alignment.total_votes !== 1 ? 's' : ''}
                </p>
              </div>

              {dissidentVotes && dissidentVotes.items.length > 0 && (
                <div style={{ marginTop: 22 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 12 }}>
                    Votes dissidents récents
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {dissidentVotes.items.map((v: DissidentVoteItem) => (
                      <Link
                        key={v.vote_id}
                        href={`/votes/${v.vote_id}`}
                        style={{
                          display: 'block', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10,
                          padding: '14px 18px', textDecoration: 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                          {v.voted_at && (
                            <span className="font-mono" style={{ fontSize: 12, color: '#9CA3AF' }}>
                              {formatDate(v.voted_at)}
                            </span>
                          )}
                          <span style={{
                            fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                            color: positionStyle(v.position).color,
                            background: positionStyle(v.position).bg,
                          }}>
                            A voté {positionStyle(v.position).label}
                          </span>
                          <span style={{ fontSize: 12, color: '#9CA3AF' }}>
                            groupe : {positionStyle(v.majority_position).label}
                          </span>
                        </div>
                        <div style={{ fontSize: 15.5, color: NAVY, lineHeight: 1.35 }}>
                          {v.vote_title}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Votes timeline */}
          {recentVotes && recentVotes.items.length > 0 && (
            <section id="votes">
              <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: RED }}>
                Votes marquants
              </div>
              <h2 className="font-newsreader text-section-sm" style={{ fontWeight: 600, color: NAVY, margin: '12px 0 22px', letterSpacing: '-0.01em' }}>
                Les votes récents de la législature
              </h2>
              <div style={{ position: 'relative', paddingLeft: 32 }}>
                {/* Timeline line */}
                <div style={{ position: 'absolute', left: 6, top: 8, bottom: 8, width: 2, background: '#E7E2D6', borderRadius: 2 }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                  {recentVotes.items.map(v => (
                    <VoteTimelineItem key={v.vote_id} vote={v} dotBorderColor={CREAM} />
                  ))}
                </div>
              </div>

              {recentVotes.total > 10 && (
                <p style={{ fontSize: 13, color: '#9CA3AF', marginTop: 28, paddingTop: 20, borderTop: `1px solid ${LINE}` }}>
                  {recentVotes.total.toLocaleString('fr-FR')} votes au total sur ce mandat
                </p>
              )}
            </section>
          )}

        </div>
      </div>
    </div>
  )
}
