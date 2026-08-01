import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { api } from '@/lib/api'
import { partyHex, formatDate } from '@/lib/utils'
import { departmentLabel } from '@/lib/departments'
import { positionStyle } from '@/lib/vote-position'
import { SITE_URL } from '@/lib/seo'
import { DeputyAvatar } from '@/components/DeputyAvatar'
import { PrintButton } from '@/components/PrintButton'

export const dynamicParams = true
export const revalidate = 86400

const NAVY = 'var(--dp-text)'
const LINE = 'var(--dp-border)'
const RED  = 'var(--dp-red)'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const deputy = await api.deputies.get(id).catch(() => null)
  if (!deputy) return {}
  return { title: `Dossier PDF — ${deputy.full_name} - MonÉlu` }
}

export default async function DeputyDossierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [deputy, scorecard, alignment, dissidentVotes] = await Promise.all([
    api.deputies.get(id).catch(() => null),
    api.deputies.scorecard(id).catch(() => null),
    api.deputies.alignment(id).catch(() => null),
    api.deputies.dissidentVotes(id, 3).catch(() => null),
  ])
  if (!deputy) notFound()

  const profileUrl = `${SITE_URL}/deputes/${id}`
  const qrSvg = await QRCode.toString(profileUrl, { type: 'svg', margin: 0, width: 96 })

  const presencePct   = scorecard ? Math.round((scorecard.presence_rate ?? 0) * 100) : null
  const solennelPct   = scorecard ? Math.round((scorecard.solennel_participation_rate ?? 0) * 100) : null
  const alignmentPct  = alignment ? Math.round(alignment.party_alignment_rate * 100) : null
  const denom         = scorecard ? (scorecard.present_votes || 1) : 1
  const pourPct       = scorecard ? Math.round(scorecard.votes_for     / denom * 100) : 0
  const contrePct     = scorecard ? Math.round(scorecard.votes_against / denom * 100) : 0
  const abstPct       = scorecard ? Math.round(scorecard.abstentions   / denom * 100) : 0

  const hex = partyHex(deputy.party)
  const deptLabel = departmentLabel(deputy.department)
  const generatedOn = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div style={{ background: 'var(--dp-card-bg)', minHeight: '100vh' }}>
      <div data-print-hide style={{ padding: '20px 32px', borderBottom: `1px solid ${LINE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 14, color: 'var(--dp-text-secondary)' }}>
          Aperçu du dossier imprimable — utilisez « Imprimer » et choisissez « Enregistrer en PDF » comme destination.
        </span>
        <PrintButton />
      </div>

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '36px 40px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `2px solid ${NAVY}`, paddingBottom: 18, marginBottom: 26 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 20, color: NAVY, letterSpacing: '-0.01em' }}>
              Mon<span style={{ color: RED }}>É</span>lu
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--dp-text-secondary)', marginTop: 2 }}>
              Chaque vote. Chaque député. En clair.
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--dp-text-muted)' }}>
            Dossier généré le {generatedOn}
            <br />
            XVII<sup>e</sup> législature
          </div>
        </div>

        {/* Identity */}
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginBottom: 26 }}>
          <div style={{ width: 80, flexShrink: 0 }}>
            <div style={{ borderRadius: 999, overflow: 'hidden', border: `1px solid ${LINE}` }}>
              <DeputyAvatar name={deputy.full_name} photoUrl={deputy.photo_url} size="xl" decorative />
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: NAVY, margin: 0, letterSpacing: '-0.01em' }}>
              {deputy.full_name}
            </h1>
            <div style={{ fontSize: 13.5, color: 'var(--dp-text-secondary)', marginTop: 6 }}>
              {deptLabel && <span>{deptLabel}</span>}
              {deputy.mandate_start && (
                <span> · Mandat depuis le {formatDate(deputy.mandate_start)}</span>
              )}
            </div>
            {deputy.party && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 10,
                padding: '5px 12px', borderRadius: 999, background: `${hex}14`,
                border: `1px solid ${hex}40`, color: hex, fontWeight: 600, fontSize: 12.5,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: hex }} />
                {deputy.party}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <div style={{ fontSize: 9.5, color: 'var(--dp-text-muted)', marginTop: 4, maxWidth: 96 }}>
              Profil complet en ligne
            </div>
          </div>
        </div>

        {/* Stat grid */}
        {scorecard && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 0, border: `1px solid ${LINE}`, borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
            {[
              { value: `${presencePct ?? '—'}%`, label: 'présence aux votes' },
              { value: `${solennelPct ?? '—'}%`, label: 'participation solennelle' },
              { value: alignmentPct !== null ? `${alignmentPct}%` : '—', label: 'loyauté au groupe' },
              { value: scorecard.total_votes.toLocaleString('fr-FR'), label: 'scrutins votés' },
            ].map((s, i) => (
              <div key={i} style={{ padding: '14px 10px', textAlign: 'center', borderRight: i < 3 ? `1px solid ${LINE}` : undefined, background: 'var(--dp-header-bg)' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: NAVY }}>{s.value}</div>
                <div style={{ fontSize: 10.5, color: 'var(--dp-text-secondary)', marginTop: 3, lineHeight: 1.3 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Vote breakdown */}
        {scorecard && (
          <div style={{ marginBottom: 26 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Répartition des votes exprimés
            </div>
            <div style={{ height: 10, borderRadius: 999, overflow: 'hidden', display: 'flex', marginBottom: 8 }}>
              <div style={{ width: `${pourPct}%`,   background: 'var(--dp-green)' }} />
              <div style={{ width: `${contrePct}%`, background: RED }} />
              <div style={{ width: `${abstPct}%`,   background: 'var(--dp-abstention)' }} />
            </div>
            <div style={{ display: 'flex', gap: 18, fontSize: 12, color: 'var(--dp-text-secondary)' }}>
              <span>Pour {pourPct}%</span>
              <span>Contre {contrePct}%</span>
              <span>Abstention {abstPct}%</span>
            </div>
          </div>
        )}

        {/* Notable votes */}
        {dissidentVotes && dissidentVotes.items.length > 0 && (
          <div style={{ marginBottom: 26, breakInside: 'avoid' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Votes marquants — dissidences avec le groupe
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dissidentVotes.items.map(v => (
                <div key={v.vote_id} style={{ border: `1px solid ${LINE}`, borderRadius: 6, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    {v.voted_at && <span style={{ fontSize: 10.5, color: 'var(--dp-text-muted)' }}>{formatDate(v.voted_at)}</span>}
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: positionStyle(v.position).color }}>
                      A voté {positionStyle(v.position).label}
                    </span>
                    <span style={{ fontSize: 10.5, color: 'var(--dp-text-muted)' }}>
                      groupe : {positionStyle(v.majority_position).label}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: NAVY, lineHeight: 1.35 }}>{v.vote_title}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Methodology footnote */}
        <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 14, fontSize: 10, color: 'var(--dp-text-muted)', lineHeight: 1.5 }}>
          Méthodologie : le taux de présence compte toute position enregistrée (y compris non-votant) sur les
          scrutins tenus pendant le mandat. Le taux de loyauté compare, vote par vote, la position du député à
          la position majoritaire de son groupe parlementaire actuel. Source : données officielles ouvertes de
          l&apos;Assemblée nationale, XVII<sup>e</sup> législature. Détails complets : {SITE_URL}/methodologie —
          profil vivant : {profileUrl}
        </div>
      </div>
    </div>
  )
}
