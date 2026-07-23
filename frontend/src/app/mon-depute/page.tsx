'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import type { Deputy, Scorecard, Alignment, DeputyVoteItem } from '@/lib/api'
import { partyHex } from '@/lib/utils'
import {
  getFollowedDeputyId,
  clearFollowedDeputyId,
  getLastSeenAt,
  setLastSeenAt,
} from '@/lib/mon-depute'
import { DeputyAvatar } from '@/components/DeputyAvatar'
import { departmentLabel } from '@/lib/departments'
import { InfoTooltip } from '@/components/InfoTooltip'
import { VoteTimelineItem } from '@/components/VoteTimelineItem'

const NAVY   = 'var(--dp-text)'
const CREAM  = 'var(--dp-page-bg)'
const LINE   = 'var(--dp-border)'
const RED    = 'var(--dp-red)'

type DashboardData = {
  deputy: Deputy
  scorecard: Scorecard | null
  alignment: Alignment | null
  recentVotes: DeputyVoteItem[]
  newSinceLastVisit: DeputyVoteItem[]
  hadPriorVisit: boolean
}

export default function MonDeputePage() {
  const router = useRouter()
  // Both start at their server-safe defaults (localStorage doesn't exist server-side);
  // the mount effect below corrects deputyId asynchronously via a microtask so React
  // treats it as a post-hydration update rather than a synchronous one, avoiding a
  // hydration mismatch between the server render and the client's first paint.
  const [deputyId, setDeputyId] = useState<string | null>(null)
  const [checkedStorage, setCheckedStorage] = useState(false)
  const [data, setData] = useState<DashboardData | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    Promise.resolve().then(() => {
      setDeputyId(getFollowedDeputyId())
      setCheckedStorage(true)
    })
  }, [])

  useEffect(() => {
    if (!deputyId) return
    let cancelled = false
    const lastSeenAt = getLastSeenAt(deputyId)
    Promise.all([
      api.deputies.get(deputyId).catch(() => null),
      api.deputies.scorecard(deputyId).catch(() => null),
      api.deputies.alignment(deputyId).catch(() => null),
      api.deputies.votes(deputyId, 10).catch(() => null),
      lastSeenAt ? api.deputies.votes(deputyId, 50, lastSeenAt).catch(() => null) : Promise.resolve(null),
    ]).then(([deputy, scorecard, alignment, recent, since]) => {
      if (cancelled) return
      if (!deputy) {
        // Stale followed-deputy id (e.g. the deputy record disappeared) — clear it
        // so the visitor lands on the picker instead of a permanent dead end.
        clearFollowedDeputyId()
        setNotFound(true)
        return
      }
      setData({
        deputy,
        scorecard,
        alignment,
        recentVotes: recent?.items ?? [],
        newSinceLastVisit: since?.items ?? [],
        hadPriorVisit: lastSeenAt !== null,
      })
      setLastSeenAt(deputyId, new Date().toISOString())
    })
    return () => { cancelled = true }
  }, [deputyId])

  const loading = !checkedStorage || (deputyId !== null && !data && !notFound)

  function unfollow() {
    clearFollowedDeputyId()
    setDeputyId(null)
    setData(null)
  }

  function change() {
    clearFollowedDeputyId()
    router.push('/deputes')
  }

  if (loading) {
    return <div style={{ background: CREAM, minHeight: '100vh' }} />
  }

  if (!deputyId || notFound) {
    return (
      <div style={{ background: CREAM, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '56px 24px' }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: RED, marginBottom: 16 }}>
            Mon député
          </div>
          <h1 className="font-newsreader text-[clamp(28px,4vw,40px)]" style={{ fontWeight: 600, color: NAVY, margin: 0, letterSpacing: '-0.015em' }}>
            Choisissez votre député
          </h1>
          <p style={{ margin: '16px 0 28px', fontSize: 16, lineHeight: 1.6, color: 'var(--dp-text-secondary)' }}>
            Suivez un député depuis sa fiche profil pour retrouver ici son bilan de vote,
            son alignement avec son groupe, et ce qui a changé depuis votre dernière visite.
          </p>
          <Link
            href="/deputes"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'var(--dp-cta-bg)', color: '#fff', padding: '12px 26px',
              borderRadius: 9, fontWeight: 600, fontSize: 15, textDecoration: 'none',
              boxShadow: '0 2px 8px var(--dp-cta-shadow)',
            }}
          >
            Trouver mon député
          </Link>
          <p style={{ margin: '20px 0 0', fontSize: 14, color: 'var(--dp-text-secondary)' }}>
            Vous ne savez pas qui suivre ?{' '}
            <Link href="/quiz" style={{ color: NAVY, fontWeight: 600 }}>
              Découvrez quel député vote comme vous →
            </Link>
          </p>
        </div>
      </div>
    )
  }

  const { deputy, scorecard, alignment, recentVotes, newSinceLastVisit, hadPriorVisit } = data!
  const hex = partyHex(deputy.party)
  const alignmentPct = alignment ? Math.round(alignment.party_alignment_rate * 100) : null
  const presencePct = scorecard ? Math.round((scorecard.presence_rate ?? 0) * 100) : null
  const showDiff = hadPriorVisit && newSinceLastVisit.length > 0

  return (
    <div style={{ background: CREAM, minHeight: '100vh' }}>
      <div style={{
        padding: '38px 56px 44px',
        background: `linear-gradient(180deg,var(--dp-card-bg) 0%,${CREAM} 100%)`,
        borderBottom: '1px solid var(--dp-border-subtle)',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: RED, marginBottom: 16 }}>
            Mon député
          </div>

          <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <DeputyAvatar name={deputy.full_name} photoUrl={deputy.photo_url} size="lg" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 className="font-newsreader text-[clamp(26px,3.5vw,38px)]" style={{ fontWeight: 600, color: NAVY, margin: 0, letterSpacing: '-0.015em' }}>
                {deputy.full_name}
              </h1>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                {deputy.department && (
                  <span style={{ fontSize: 14, color: 'var(--dp-text-secondary)' }}>{departmentLabel(deputy.department)}</span>
                )}
                {deputy.party && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    padding: '5px 12px', borderRadius: 999,
                    background: `${hex}14`, border: `1px solid ${hex}40`,
                    color: hex, fontWeight: 600, fontSize: 13,
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: hex }} />
                    {deputy.party}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link
                href={`/deputes/${deputy.deputy_id}`}
                style={{
                  fontSize: 13.5, color: NAVY, background: 'var(--dp-card-bg)', border: `1px solid ${LINE}`,
                  padding: '9px 16px', borderRadius: 8, fontWeight: 600, textDecoration: 'none',
                }}
              >
                Voir la fiche complète
              </Link>
              <button
                onClick={change}
                style={{ fontSize: 13.5, color: NAVY, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: '9px 4px' }}
              >
                Changer de député
              </button>
              <button
                onClick={unfollow}
                style={{ fontSize: 13.5, color: RED, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: '9px 4px' }}
              >
                Ne plus suivre
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '44px 56px 80px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 44 }}>

          {/* What changed since last visit */}
          {showDiff && (
            <section>
              <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: RED }}>
                Depuis votre dernière visite
              </div>
              <h2 className="font-newsreader text-section-sm" style={{ fontWeight: 600, color: NAVY, margin: '12px 0 22px', letterSpacing: '-0.01em' }}>
                {newSinceLastVisit.length} nouveau{newSinceLastVisit.length !== 1 ? 'x' : ''} vote{newSinceLastVisit.length !== 1 ? 's' : ''}
              </h2>
              <div style={{ position: 'relative', paddingLeft: 32 }}>
                <div style={{ position: 'absolute', left: 6, top: 8, bottom: 8, width: 2, background: 'var(--dp-border-subtle)', borderRadius: 2 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                  {newSinceLastVisit.map(v => (
                    <VoteTimelineItem key={v.vote_id} vote={v} dotBorderColor={CREAM} />
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Stats */}
          <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {presencePct !== null && (
              <div style={{ background: 'var(--dp-card-bg)', border: `1px solid ${LINE}`, borderRadius: 12, padding: '22px 24px' }}>
                <div style={{ fontSize: 13, color: 'var(--dp-text-secondary)', fontWeight: 500, marginBottom: 10 }}>Taux de présence</div>
                <div className="font-mono" style={{ fontWeight: 700, fontSize: 28, color: NAVY }}>{presencePct}%</div>
                <div style={{ position: 'relative', height: 8, background: 'var(--dp-track-bg)', borderRadius: 999, overflow: 'hidden', marginTop: 12 }}>
                  <div style={{ height: '100%', background: NAVY, borderRadius: 999, width: `${presencePct}%` }} />
                </div>
              </div>
            )}
            {alignmentPct !== null && alignment && (
              <div style={{ background: 'var(--dp-card-bg)', border: `1px solid ${LINE}`, borderRadius: 12, padding: '22px 24px' }}>
                <div style={{ fontSize: 13, color: 'var(--dp-text-secondary)', fontWeight: 500, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Alignement avec son groupe
                  <InfoTooltip text="Alignement calculé en comparant, vote par vote, la position du député à la position majoritaire de son groupe parlementaire actuel." />
                </div>
                <div className="font-mono" style={{ fontWeight: 700, fontSize: 28, color: NAVY }}>{alignmentPct}%</div>
                <div style={{ position: 'relative', height: 8, background: 'var(--dp-track-bg)', borderRadius: 999, overflow: 'hidden', marginTop: 12 }}>
                  <div style={{ height: '100%', background: NAVY, borderRadius: 999, width: `${alignmentPct}%` }} />
                </div>
              </div>
            )}
          </section>

          {/* Quiz cross-link (MON-140) */}
          <section style={{
            background: 'var(--dp-card-bg)', border: `1px solid ${LINE}`, borderRadius: 12,
            padding: '20px 24px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, color: NAVY }}>
                Votez-vous comme {deputy.full_name} ?
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--dp-text-secondary)', marginTop: 4 }}>
                Répondez à une dizaine de vrais scrutins et comparez vos positions aux siennes.
              </div>
            </div>
            <Link
              href="/quiz"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'var(--dp-cta-bg)', color: '#fff', padding: '10px 20px',
                borderRadius: 9, fontWeight: 600, fontSize: 14, textDecoration: 'none',
                boxShadow: '0 2px 8px var(--dp-cta-shadow)', whiteSpace: 'nowrap',
              }}
            >
              Faire le test →
            </Link>
          </section>

          {/* Recent votes */}
          {recentVotes.length > 0 && (
            <section>
              <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: RED }}>
                Votes récents
              </div>
              <h2 className="font-newsreader text-section-sm" style={{ fontWeight: 600, color: NAVY, margin: '12px 0 22px', letterSpacing: '-0.01em' }}>
                Le bilan de vote de {deputy.full_name}
              </h2>
              <div style={{ position: 'relative', paddingLeft: 32 }}>
                <div style={{ position: 'absolute', left: 6, top: 8, bottom: 8, width: 2, background: 'var(--dp-border-subtle)', borderRadius: 2 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                  {recentVotes.map(v => (
                    <VoteTimelineItem key={v.vote_id} vote={v} dotBorderColor={CREAM} />
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
