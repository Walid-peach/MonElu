'use client'
import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { ShareButton } from '@/components/ShareButton'

interface GroupRow {
  name: string
  color: string
  pour: number
  contre: number
  abst: number
  nonVotant: number
  position: 'Pour' | 'Contre' | 'Partagé'
  forPct: number
  agtPct: number
}

interface Dissident {
  deputy_id: string
  full_name: string
  initials: string
  party: string
  avatarColor: string
  vote: string
  note: string
}

interface RelatedVote {
  vote_id: string
  vote_title: string
  voted_at: string
  result: string
}

interface Props {
  voteId: string
  voteTitle: string
  result: string
  votedAt: string
  summary: string | null
  theme: string | null
  votesFor: number
  votesAgainst: number
  abstentions: number
  totalVoters: number
  pourPct: number
  contrePct: number
  abstPct: number
  groups: GroupRow[]
  dissidents: Dissident[]
  related: RelatedVote[]
  apiUrl: string
}

function shortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function VoteDetailClient(props: Props) {
  const {
    voteId, voteTitle, result, votedAt, summary, theme,
    votesFor, votesAgainst, abstentions, totalVoters,
    pourPct, contrePct, abstPct,
    groups, dissidents, related, apiUrl,
  } = props

  const [showBar, setShowBar] = useState(false)
  const obsRef = useRef<IntersectionObserver | null>(null)

  const heroRef = useCallback((el: HTMLDivElement | null) => {
    if (obsRef.current) { obsRef.current.disconnect(); obsRef.current = null }
    if (!el) return
    obsRef.current = new IntersectionObserver(
      ([entry]) => {
        const gone = !entry!.isIntersecting || entry!.intersectionRatio < 0.12
        setShowBar(gone)
      },
      { threshold: [0, 0.12, 1], rootMargin: '-72px 0px 0px 0px' }
    )
    obsRef.current.observe(el)
  }, [])

  const adopted = result === 'adopté'

  return (
    <div style={{ background: '#F7F4ED', minHeight: '100vh' }}>

      {/* ── Sticky scroll bar ── */}
      <div style={{
        position: 'fixed', left: 0, right: 0, top: 64, zIndex: 50,
        opacity: showBar ? 1 : 0,
        transform: showBar ? 'translateY(0)' : 'translateY(-28px)',
        pointerEvents: showBar ? 'auto' : 'none',
        transition: 'opacity 0.3s ease, transform 0.45s cubic-bezier(0.22,1,0.36,1)',
      }}>
        <div style={{ background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(14px)', borderBottom: '1px solid #E4E6EA', boxShadow: '0 8px 24px rgba(27,43,80,0.08)' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16, padding: '10px 56px' }}>
            <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9CA3AF', flexShrink: 0 }}>
              Scrutin n°{voteId}
            </span>
            <span style={{ fontSize: 12, color: '#D1D5DB' }}>·</span>
            <span style={{ fontWeight: 600, fontSize: 15, color: '#1B2B50', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {voteTitle}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 12, fontWeight: 700, padding: '5px 14px', borderRadius: 999, background: adopted ? '#EAF5EF' : '#FBE9E7', color: adopted ? '#1F8A5B' : '#C9302A', flexShrink: 0 }}>
              {adopted ? 'Adopté' : 'Rejeté'}
            </span>
            <span className="font-mono" style={{ fontSize: 12.5, color: '#6B7280', flexShrink: 0 }}>
              {votesFor} pour · {votesAgainst} contre
            </span>
          </div>
        </div>
      </div>

      {/* ── Hero ── */}
      <div ref={heroRef} style={{ padding: '38px 56px 48px', background: 'linear-gradient(180deg,#ffffff 0%,#F7F4ED 100%)', borderBottom: '1px solid #ECE7DC' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>

          {/* Breadcrumb */}
          <div style={{ fontSize: 13.5, color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link href="/votes" style={{ color: '#C9302A', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none', fontWeight: 500 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
              Retour aux scrutins
            </Link>
            <span>/</span>
            <span>Scrutin n°{voteId}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 64, alignItems: 'start', marginTop: 30 }}>

            {/* Left: identity */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
                <span style={{ font: '700 11.5px/1 var(--font-sans)', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#9CA3AF' }}>
                  Scrutin public · n°{voteId}
                </span>
                <span className="font-mono" style={{ fontSize: 11.5, color: '#9CA3AF' }}>·</span>
                <span suppressHydrationWarning className="font-mono" style={{ fontSize: 12, color: '#9CA3AF' }}>{shortDate(votedAt)}</span>
              </div>

              <h1 className="font-newsreader text-title" style={{ fontWeight: 600, lineHeight: 1.05, letterSpacing: '-0.015em', color: '#1B2B50', margin: 0, maxWidth: 620 }}>
                {voteTitle}
              </h1>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 999, background: adopted ? '#EAF5EF' : '#FBE9E7', color: adopted ? '#1F8A5B' : '#C9302A' }}>
                  {adopted ? 'Adopté' : 'Rejeté'}
                </span>
                {theme && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 999, background: '#E8EFFE', color: '#2A5DB0' }}>
                    {theme}
                  </span>
                )}
                <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 999, background: '#F2F3F5', color: '#4B5563' }}>
                  XVII&#7497; législature
                </span>
              </div>

              {summary && (
                <p style={{ margin: '22px 0 0', fontSize: 16, lineHeight: 1.65, color: '#4B5563', maxWidth: 600 }}>
                  <span style={{ fontWeight: 600, color: '#C9302A' }}>En clair :</span> {summary}
                </p>
              )}
            </div>

            {/* Right: result card */}
            <div style={{ background: '#fff', border: '1px solid #E4E6EA', borderRadius: 14, padding: 28, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
              <div style={{ font: '700 11px/1 var(--font-sans)', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 18 }}>
                Résultat du scrutin
              </div>

              {/* Big numbers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, textAlign: 'center', marginBottom: 22 }}>
                <div style={{ borderRight: '1px solid #F0F1F3', padding: '0 12px' }}>
                  <div className="font-newsreader text-section-lg" style={{ fontWeight: 600, color: '#1F8A5B', letterSpacing: '-0.02em' }}>{votesFor.toLocaleString('fr-FR')}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1F8A5B', marginTop: 3, letterSpacing: '0.04em' }}>POUR</div>
                </div>
                <div style={{ borderRight: '1px solid #F0F1F3', padding: '0 12px' }}>
                  <div className="font-newsreader text-section-lg" style={{ fontWeight: 600, color: '#C9302A', letterSpacing: '-0.02em' }}>{votesAgainst.toLocaleString('fr-FR')}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#C9302A', marginTop: 3, letterSpacing: '0.04em' }}>CONTRE</div>
                </div>
                <div style={{ padding: '0 12px' }}>
                  <div className="font-newsreader text-section-lg" style={{ fontWeight: 600, color: '#9CA3AF', letterSpacing: '-0.02em' }}>{abstentions.toLocaleString('fr-FR')}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#9CA3AF', marginTop: 3, letterSpacing: '0.04em' }}>ABST.</div>
                </div>
              </div>

              {/* Stacked bar */}
              <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ width: `${pourPct}%`, background: '#1F8A5B' }} />
                <div style={{ width: `${contrePct}%`, background: '#D9685E' }} />
                <div style={{ flex: 1, background: '#E4E6EA' }} />
              </div>
              <div className="font-mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9CA3AF', marginBottom: 22 }}>
                <span>{pourPct}%</span><span>{contrePct}%</span><span>{abstPct}%</span>
              </div>

              {/* Quorum note */}
              <div style={{ background: '#F2F3F5', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#4B5563', lineHeight: 1.5, marginBottom: 20 }}>
                <span style={{ fontWeight: 600, color: '#1B2B50' }}>Majorité absolue requise : </span>289 voix.<br />
                Votants : {totalVoters.toLocaleString('fr-FR')} sur 577 députés inscrits.
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10 }}>
                <a
                  href={`https://www.assemblee-nationale.fr/dyn/scrutins/${voteId}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1B2B50', color: '#fff', padding: '11px 18px', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', textDecoration: 'none' }}>
                  Voir le texte officiel
                </a>
                <a
                  href={`${apiUrl}/votes/${voteId}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #E4E6EA', color: '#4B5563', padding: '11px 16px', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', textDecoration: 'none' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                </a>
                <ShareButton
                  url={`/votes/${voteId}`}
                  title={`${adopted ? 'Adopté' : 'Rejeté'} - ${voteTitle}`}
                  text="Suivez ce scrutin sur MonÉlu"
                  ariaLabel="Partager ce vote"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: '52px 56px 80px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', gap: 56, alignItems: 'flex-start' }}>

          {/* Main column */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 52 }}>

            {/* Ventilation par groupe */}
            {groups.length > 0 && (
              <section>
                <div style={{ font: '700 12px/1 var(--font-sans)', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9302A' }}>Ventilation par groupe</div>
                <h2 className="font-newsreader text-section-sm" style={{ fontWeight: 600, color: '#1B2B50', margin: '12px 0 4px', letterSpacing: '-0.01em' }}>Comment chaque groupe a voté</h2>
                <p style={{ fontSize: 15, color: '#6B7280', margin: '0 0 22px', maxWidth: 560 }}>Position majoritaire exprimée par les membres de chaque groupe parlementaire.</p>

                <div style={{ background: '#fff', border: '1px solid #E4E6EA', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 80px 80px 80px', gap: 14, padding: '12px 24px', borderBottom: '1px solid #E4E6EA', background: '#FBFAF6', font: '600 11px/1 var(--font-sans)', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF' }}>
                    <span>Groupe</span><span>Position</span><span style={{ textAlign: 'right' }}>Pour</span><span style={{ textAlign: 'right' }}>Contre</span><span style={{ textAlign: 'right' }}>Abst.</span>
                  </div>
                  {groups.map((g) => {
                    const posColor = g.position === 'Pour' ? '#1F8A5B' : g.position === 'Contre' ? '#C9302A' : '#B45309'
                    const posBg   = g.position === 'Pour' ? '#EAF5EF' : g.position === 'Contre' ? '#FBE9E7' : '#FEF3C7'
                    return (
                      <div key={g.name} style={{ display: 'grid', gridTemplateColumns: '200px 1fr 80px 80px 80px', gap: 14, padding: '16px 24px', borderBottom: '1px solid #F0F1F3', alignItems: 'center', background: '#fff' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <span style={{ width: 9, height: 9, borderRadius: 999, flexShrink: 0, background: g.color, display: 'inline-block' }} />
                          <span style={{ fontSize: 13.5, color: '#374151', fontWeight: 500 }}>{g.name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ flex: 1, height: 7, borderRadius: 999, background: '#F0F1F3', overflow: 'hidden', display: 'flex' }}>
                            <div style={{ height: '100%', background: '#1F8A5B', width: `${g.forPct}%` }} />
                            <div style={{ height: '100%', background: '#D9685E', width: `${g.agtPct}%` }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 11px', borderRadius: 999, color: posColor, background: posBg, flexShrink: 0 }}>{g.position}</span>
                        </div>
                        <div className="font-mono" style={{ fontSize: 13, color: '#1F8A5B', textAlign: 'right', fontWeight: 600 }}>{g.pour}</div>
                        <div className="font-mono" style={{ fontSize: 13, color: '#C9302A', textAlign: 'right', fontWeight: 600 }}>{g.contre}</div>
                        <div className="font-mono" style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'right' }}>{g.abst}</div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Dissidences */}
            {dissidents.length > 0 && (
              <section>
                <div style={{ font: '700 12px/1 var(--font-sans)', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9302A' }}>Votes notables</div>
                <h2 className="font-newsreader text-section-sm" style={{ fontWeight: 600, color: '#1B2B50', margin: '12px 0 22px', letterSpacing: '-0.01em' }}>Dissidences &amp; surprises</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {dissidents.map((d) => {
                    const voteColor = d.vote === 'pour' ? '#1F8A5B' : d.vote === 'contre' ? '#C9302A' : '#6B7280'
                    const voteBg   = d.vote === 'pour' ? '#EAF5EF' : d.vote === 'contre' ? '#FBE9E7' : '#F0F1F3'
                    const voteLabel = d.vote === 'pour' ? 'Pour' : d.vote === 'contre' ? 'Contre' : 'Abstention'
                    return (
                      <Link key={d.deputy_id} href={`/deputes/${d.deputy_id}`} style={{ background: '#fff', border: '1px solid #E4E6EA', borderRadius: 10, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', textDecoration: 'none', cursor: 'pointer' }}>
                        <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: '#fff', background: d.avatarColor }}>
                          {d.initials}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 15, color: '#1B2B50' }}>{d.full_name}</div>
                          <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 2 }}>{d.party}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 700, padding: '4px 12px', borderRadius: 999, color: voteColor, background: voteBg }}>{voteLabel}</span>
                          <span style={{ fontSize: 12, color: '#6B7280' }}>{d.note}</span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </section>
            )}
          </div>

          {/* Sidebar */}
          <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 24, position: 'sticky', top: 120 }}>

            {/* Related votes */}
            {related.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #E4E6EA', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ font: '700 11px/1 var(--font-sans)', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 16 }}>Scrutins liés</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {related.map((r) => {
                    const rAdopted = r.result === 'adopté'
                    return (
                      <Link key={r.vote_id} href={`/votes/${r.vote_id}`} style={{ padding: '12px 0', borderBottom: '1px solid #F0F1F3', textDecoration: 'none' }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500, color: '#1B2B50', lineHeight: 1.35 }}
                          className="line-clamp-2">
                          {r.vote_title}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                          <span suppressHydrationWarning className="font-mono" style={{ fontSize: 11, color: '#9CA3AF' }}>
                            {new Date(r.voted_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999, color: rAdopted ? '#1F8A5B' : '#C9302A', background: rAdopted ? '#EAF5EF' : '#FBE9E7' }}>
                            {rAdopted ? 'Adopté' : 'Rejeté'}
                          </span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Sources */}
            <div style={{ background: '#fff', border: '1px solid #E4E6EA', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ font: '700 11px/1 var(--font-sans)', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 14 }}>Sources officielles</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Assemblée nationale', href: `https://www.assemblee-nationale.fr/dyn/scrutins/${voteId}` },
                  { label: 'API MonÉlu — données brutes', href: `${apiUrl}/votes/${voteId}` },
                ].map(({ label, href }) => (
                  <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: '#1B2B50', textDecoration: 'none', fontWeight: 500 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    {label}
                  </a>
                ))}
              </div>
            </div>

            {/* Freshness */}
            <div style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.6, padding: '0 2px' }}>
              Données issues du flux officiel de l&apos;Assemblée nationale.<br />
              Dernière mise à jour : <span suppressHydrationWarning style={{ color: '#6B7280', fontWeight: 600 }}>{shortDate(votedAt)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
