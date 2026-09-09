'use client'
import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { ShareButton } from '@/components/ShareButton'
import { EmbedButton } from '@/components/EmbedButton'
import { ReportErrorButton } from '@/components/ReportErrorButton'
import { InfoTooltip } from '@/components/InfoTooltip'
import { getInitials, partyHex } from '@/lib/utils'
import { groupSlug } from '@/lib/groups'
import { resolvePostalCode } from '@/lib/postal'
import { csvUrl } from '@/lib/api'
import { anDossierUrl } from '@/lib/an'
import { HemicycleChart } from '@/components/HemicycleChart'
import type { HemicycleDeputy } from '@/lib/hemicycle'

interface DeputyLookupEntry {
  deputy_id: string
  full_name: string
  party: string | null
  department: string | null
  position: string | null
}

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
  dossierId: string | null
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
  deputyLookup: DeputyLookupEntry[]
  hemicycleDeputies: HemicycleDeputy[]
}

const POSITION_LABELS: Record<string, string> = {
  pour: 'Pour',
  contre: 'Contre',
  abstention: 'Abstention',
  nonVotant: 'Non votant',
}

function shortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function VoteDetailClient(props: Props) {
  const {
    voteId, voteTitle, result, votedAt, summary, dossierId, theme,
    votesFor, votesAgainst, abstentions, totalVoters,
    pourPct, contrePct, abstPct,
    groups, dissidents, related, apiUrl, deputyLookup, hemicycleDeputies,
  } = props

  const [showBar, setShowBar] = useState(false)
  const obsRef = useRef<IntersectionObserver | null>(null)

  // ── "Comment a voté votre député ?" lookup ──
  const [lookupQuery, setLookupQuery] = useState('')
  const [selected, setSelected] = useState<DeputyLookupEntry | null>(null)
  const [postalResult, setPostalResult] = useState<{ code: string; department: string | null } | null>(null)

  useEffect(() => {
    const q = lookupQuery.trim()
    if (!/^\d{5}$/.test(q)) return
    let cancelled = false
    resolvePostalCode(q).then(department => {
      if (!cancelled) setPostalResult({ code: q, department })
    })
    return () => { cancelled = true }
  }, [lookupQuery])

  const postalMatch = postalResult?.code === lookupQuery.trim() ? postalResult : null
  const resolvedDept = postalMatch?.department ?? null

  const suggestions = useMemo(() => {
    if (resolvedDept) {
      return deputyLookup.filter(d => d.department === resolvedDept).slice(0, 6)
    }
    const q = lookupQuery.trim().toLowerCase()
    if (!q || q.length < 2) return []
    return deputyLookup
      .filter(d => d.full_name.toLowerCase().includes(q))
      .slice(0, 6)
  }, [lookupQuery, deputyLookup, resolvedDept])

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
  const headline = summary || voteTitle
  // Shared with the vote's JSON-LD (MON-267): the link a reader clicks and the
  // `Event.about` a crawler reads must be the same URL, guard included.
  const dossierUrl = anDossierUrl(dossierId)

  return (
    <div style={{ background: 'var(--dp-page-bg)', minHeight: '100vh' }}>

      {/* ── Sticky scroll bar ── */}
      <div style={{
        position: 'fixed', left: 0, right: 0, top: 64, zIndex: 50,
        opacity: showBar ? 1 : 0,
        transform: showBar ? 'translateY(0)' : 'translateY(-28px)',
        pointerEvents: showBar ? 'auto' : 'none',
        transition: 'opacity 0.3s ease, transform 0.45s cubic-bezier(0.22,1,0.36,1)',
      }}>
        <div style={{ background: 'var(--dp-sticky-bg)', backdropFilter: 'blur(14px)', borderBottom: '1px solid var(--dp-border)', boxShadow: '0 8px 24px var(--dp-avatar-shadow)' }}>
          <div className="px-5 sm:px-14" style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16, padding: '10px 0' }}>
            <span className="hidden sm:inline" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dp-text-muted)', flexShrink: 0 }}>
              Scrutin n°{voteId}
            </span>
            <span className="hidden sm:inline" style={{ fontSize: 12, color: 'var(--dp-abstention)' }}>·</span>
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--dp-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {headline}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 12, fontWeight: 700, padding: '5px 14px', borderRadius: 999, background: adopted ? 'var(--dp-badge-pos-bg)' : 'var(--dp-badge-neg-bg)', color: adopted ? 'var(--dp-green)' : 'var(--dp-red)', flexShrink: 0 }}>
              {adopted ? 'Adopté' : 'Rejeté'}
            </span>
            <span className="font-mono hidden sm:inline" style={{ fontSize: 12.5, color: 'var(--dp-text-secondary)', flexShrink: 0 }}>
              {votesFor} pour · {votesAgainst} contre
            </span>
          </div>
        </div>
      </div>

      {/* ── Hero ── */}
      <div ref={heroRef} style={{ padding: '38px 56px 48px', background: 'linear-gradient(180deg,var(--dp-card-bg) 0%,var(--dp-page-bg) 100%)', borderBottom: '1px solid var(--dp-border-subtle)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>

          {/* Breadcrumb */}
          <div style={{ fontSize: 13.5, color: 'var(--dp-text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link href="/votes" style={{ color: 'var(--dp-red)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none', fontWeight: 500 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
              Retour aux scrutins
            </Link>
            <span>/</span>
            <span>Scrutin n°{voteId}</span>
          </div>

          <div className="xl:grid xl:grid-cols-[1fr_380px] xl:gap-16 xl:items-start" style={{ marginTop: 30 }}>

            {/* Left: identity */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
                <span style={{ font: '700 11.5px/1 var(--font-sans)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--dp-text-muted)' }}>
                  Scrutin public · n°{voteId}
                </span>
                <span className="font-mono" style={{ fontSize: 11.5, color: 'var(--dp-text-muted)' }}>·</span>
                <span suppressHydrationWarning className="font-mono" style={{ fontSize: 12, color: 'var(--dp-text-muted)' }}>{shortDate(votedAt)}</span>
              </div>

              <h1 className="font-newsreader text-title" style={{ fontWeight: 600, lineHeight: 1.05, letterSpacing: '-0.015em', color: 'var(--dp-text)', margin: 0, maxWidth: 620 }}>
                {headline}
              </h1>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 999, background: adopted ? 'var(--dp-badge-pos-bg)' : 'var(--dp-badge-neg-bg)', color: adopted ? 'var(--dp-green)' : 'var(--dp-red)' }}>
                  {adopted ? 'Adopté' : 'Rejeté'}
                </span>
                {theme && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 999, background: 'var(--dp-badge-info-bg)', color: 'var(--dp-badge-info-text)' }}>
                    {theme}
                  </span>
                )}
                <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 999, background: 'var(--dp-track-bg)', color: 'var(--dp-text-secondary)' }}>
                  XVII&#7497; législature
                </span>
              </div>

              {summary && (
                <p style={{ margin: '22px 0 0', fontSize: 15, lineHeight: 1.6, color: 'var(--dp-text-muted)', maxWidth: 600 }}>
                  <span style={{ fontWeight: 600 }}>Titre officiel :</span> {voteTitle}
                </p>
              )}

              {dossierUrl && (
                <a href={dossierUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', marginTop: 14, fontSize: 14, fontWeight: 600, color: 'var(--dp-red)', textDecoration: 'none' }}>
                  Voir le dossier officiel →
                </a>
              )}
            </div>

            {/* Right: result card */}
            <div className="mt-8 xl:mt-0" style={{ background: 'var(--dp-card-bg)', border: '1px solid var(--dp-border)', borderRadius: 14, padding: 28, boxShadow: '0 4px 12px var(--dp-shadow-sm)' }}>
              <div style={{ font: '700 11px/1 var(--font-sans)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--dp-text-muted)', marginBottom: 18 }}>
                Résultat du scrutin
              </div>

              {/* Big numbers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, textAlign: 'center', marginBottom: 22 }}>
                <div style={{ borderRight: '1px solid var(--dp-track-bg)', padding: '0 12px' }}>
                  <div className="font-newsreader text-section-lg" style={{ fontWeight: 600, color: 'var(--dp-green)', letterSpacing: '-0.02em' }}>{votesFor.toLocaleString('fr-FR')}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dp-green)', marginTop: 3, letterSpacing: '0.04em' }}>POUR</div>
                </div>
                <div style={{ borderRight: '1px solid var(--dp-track-bg)', padding: '0 12px' }}>
                  <div className="font-newsreader text-section-lg" style={{ fontWeight: 600, color: 'var(--dp-red)', letterSpacing: '-0.02em' }}>{votesAgainst.toLocaleString('fr-FR')}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dp-red)', marginTop: 3, letterSpacing: '0.04em' }}>CONTRE</div>
                </div>
                <div style={{ padding: '0 12px' }}>
                  <div className="font-newsreader text-section-lg" style={{ fontWeight: 600, color: 'var(--dp-text-muted)', letterSpacing: '-0.02em' }}>{abstentions.toLocaleString('fr-FR')}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dp-text-muted)', marginTop: 3, letterSpacing: '0.04em' }}>ABST.</div>
                </div>
              </div>

              {/* Stacked bar */}
              <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ width: `${pourPct}%`, background: 'var(--dp-green)' }} />
                <div style={{ width: `${contrePct}%`, background: 'var(--dp-red)' }} />
                <div style={{ flex: 1, background: 'var(--dp-border)' }} />
              </div>
              <div className="font-mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--dp-text-muted)', marginBottom: 22 }}>
                <span>{pourPct}%</span><span>{contrePct}%</span><span>{abstPct}%</span>
              </div>

              {/* Quorum note */}
              <div style={{ background: 'var(--dp-track-bg)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: 'var(--dp-text-secondary)', lineHeight: 1.5, marginBottom: 20 }}>
                <span style={{ fontWeight: 600, color: 'var(--dp-text)' }}>Majorité absolue requise : </span>289 voix.<br />
                Votants : {totalVoters.toLocaleString('fr-FR')} sur 577 députés inscrits.
              </div>

              {/* Actions */}
              <div className="flex-wrap" style={{ display: 'flex', gap: 10 }}>
                <a
                  href={`https://www.assemblee-nationale.fr/dyn/scrutins/${voteId}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dp-active-bg)', color: '#fff', padding: '11px 18px', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', textDecoration: 'none' }}>
                  Voir le texte officiel
                </a>
                <a
                  href={`${apiUrl}/votes/${voteId}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--dp-border)', color: 'var(--dp-text-secondary)', padding: '11px 16px', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', textDecoration: 'none' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                </a>
                <a
                  href={csvUrl.votePositions(voteId)}
                  download
                  title="Télécharger les positions de tous les députés (CSV)"
                  aria-label="Télécharger les positions en CSV"
                  style={{ display: 'flex', alignItems: 'center', gap: 7, border: '1px solid var(--dp-border)', color: 'var(--dp-text-secondary)', padding: '11px 16px', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', textDecoration: 'none' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  CSV
                </a>
                <ShareButton
                  url={`/votes/${voteId}`}
                  title={`${adopted ? 'Adopté' : 'Rejeté'} - ${headline}`}
                  text="Suivez ce scrutin sur MonÉlu"
                  ariaLabel="Partager ce vote"
                />
                <EmbedButton path={`/embed/votes/${voteId}`} />
              </div>
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
                <ReportErrorButton
                  entityType="vote"
                  entityId={voteId}
                  entityLabel={voteTitle}
                  pageUrl={`/votes/${voteId}`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-5 py-10 sm:px-14 sm:py-[52px] sm:pb-20">
        <div className="flex flex-col xl:flex-row xl:items-start" style={{ maxWidth: 1180, margin: '0 auto', gap: 56 }}>

          {/* Main column */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 52 }}>

            {/* Hémicycle */}
            {hemicycleDeputies.length > 0 && (
              <section>
                <div style={{ font: '700 12px/1 var(--font-sans)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--dp-red)' }}>Hémicycle</div>
                <h2 className="font-newsreader text-section-sm" style={{ fontWeight: 600, color: 'var(--dp-text)', margin: '12px 0 4px', letterSpacing: '-0.01em' }}>Le vote, siège par siège</h2>
                <p style={{ fontSize: 15, color: 'var(--dp-text-secondary)', margin: '0 0 20px', maxWidth: 560 }}>
                  Un point par député ayant pris part au scrutin, placé selon son groupe parlementaire. Survolez ou touchez un siège pour voir le détail.
                </p>
                <div style={{ background: 'var(--dp-card-bg)', border: '1px solid var(--dp-border)', borderRadius: 12, padding: '24px 28px', boxShadow: '0 1px 3px var(--dp-shadow-sm)' }}>
                  <HemicycleChart deputies={hemicycleDeputies} />
                </div>
              </section>
            )}

            {/* Comment a voté votre député ? */}
            <section>
              <div style={{ font: '700 12px/1 var(--font-sans)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--dp-red)' }}>Votre député</div>
              <h2 className="font-newsreader text-section-sm" style={{ fontWeight: 600, color: 'var(--dp-text)', margin: '12px 0 4px', letterSpacing: '-0.01em' }}>Comment a voté votre député&nbsp;?</h2>
              <p style={{ fontSize: 15, color: 'var(--dp-text-secondary)', margin: '0 0 18px', maxWidth: 560 }}>Tapez un nom ou un code postal pour retrouver sa position sur ce scrutin.</p>

              <div style={{ position: 'relative', maxWidth: 440 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--dp-card-bg)', border: '1px solid var(--dp-border)', borderRadius: 10, padding: '0 16px', height: 48 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--dp-text-muted)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>
                  <input
                    type="text"
                    value={lookupQuery}
                    onChange={e => { setLookupQuery(e.target.value); setSelected(null) }}
                    placeholder="Nom du député ou code postal…"
                    style={{ flex: 1, border: 'none', fontSize: 14.5, color: 'var(--dp-text)', background: 'transparent' }}
                  />
                </div>

                {suggestions.length > 0 && !selected && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, background: 'var(--dp-card-bg)', border: '1px solid var(--dp-border)', borderRadius: 10, boxShadow: '0 8px 24px var(--dp-shadow-sm)', zIndex: 10, overflow: 'hidden' }}>
                    {suggestions.map(d => (
                      <button
                        key={d.deputy_id}
                        onClick={() => { setSelected(d); setLookupQuery(d.full_name) }}
                        style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--dp-track-bg)', cursor: 'pointer', textAlign: 'left' }}
                      >
                        <span style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, color: '#fff', background: partyHex(d.party) }}>
                          {getInitials(d.full_name)}
                        </span>
                        <span style={{ fontSize: 13.5, color: 'var(--dp-text)', fontWeight: 500 }}>{d.full_name}</span>
                      </button>
                    ))}
                  </div>
                )}

                {lookupQuery.trim().length >= 2 && suggestions.length === 0 && !selected && !/^\d{1,4}$/.test(lookupQuery.trim()) && (
                  <div style={{ marginTop: 8, fontSize: 13, color: 'var(--dp-text-muted)' }}>Aucun député trouvé pour « {lookupQuery} ».</div>
                )}
              </div>

              {selected && (
                <Link href={`/deputes/${selected.deputy_id}`} style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16, maxWidth: 440, background: 'var(--dp-card-bg)', border: '1px solid var(--dp-border)', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 3px var(--dp-shadow-sm)', textDecoration: 'none' }}>
                  <span style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: '#fff', background: partyHex(selected.party) }}>
                    {getInitials(selected.full_name)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--dp-text)' }}>{selected.full_name}</div>
                    <div style={{ fontSize: 13, color: 'var(--dp-text-muted)', marginTop: 2 }}>{selected.party ?? 'Parti inconnu'}</div>
                  </div>
                  {selected.position ? (
                    <span style={{
                      fontSize: 13, fontWeight: 700, padding: '6px 14px', borderRadius: 999,
                      color: selected.position === 'pour' ? 'var(--dp-green)' : selected.position === 'contre' ? 'var(--dp-red)' : 'var(--dp-text-secondary)',
                      background: selected.position === 'pour' ? 'var(--dp-badge-pos-bg)' : selected.position === 'contre' ? 'var(--dp-badge-neg-bg)' : 'var(--dp-track-bg)',
                    }}>
                      {POSITION_LABELS[selected.position] ?? selected.position}
                    </span>
                  ) : (
                    <span style={{ fontSize: 13, fontWeight: 700, padding: '6px 14px', borderRadius: 999, color: 'var(--dp-text-muted)', background: 'var(--dp-track-bg)' }}>
                      Absent · non enregistré
                    </span>
                  )}
                </Link>
              )}
            </section>

            {/* Ventilation par groupe */}
            {groups.length > 0 && (
              <section>
                <div style={{ font: '700 12px/1 var(--font-sans)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--dp-red)' }}>Ventilation par groupe</div>
                <h2 className="font-newsreader text-section-sm" style={{ fontWeight: 600, color: 'var(--dp-text)', margin: '12px 0 4px', letterSpacing: '-0.01em' }}>Comment chaque groupe a voté</h2>
                <p style={{ fontSize: 15, color: 'var(--dp-text-secondary)', margin: '0 0 22px', maxWidth: 560 }}>Position majoritaire exprimée par les membres de chaque groupe parlementaire.</p>

                <div style={{ background: 'var(--dp-card-bg)', border: '1px solid var(--dp-border)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px var(--dp-shadow-sm)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 80px 80px 80px 90px', gap: 14, padding: '12px 24px', borderBottom: '1px solid var(--dp-border)', background: 'var(--dp-header-bg)', font: '600 11px/1 var(--font-sans)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--dp-text-muted)' }}>
                    <span>Groupe</span><span>Position</span><span style={{ textAlign: 'right' }}>Pour</span><span style={{ textAlign: 'right' }}>Contre</span>
                    <span style={{ textAlign: 'right' }}>Abst.</span>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                      Non-vot.
                      <InfoTooltip
                        text="Non-votant : présent en séance mais n'a pas pris position. Différent de l'abstention, qui est une position exprimée."
                        href="/methodologie#limites"
                        placement="bottom"
                        align="right"
                      />
                    </span>
                  </div>
                  {groups.map((g) => {
                    const posColor = g.position === 'Pour' ? 'var(--dp-green)' : g.position === 'Contre' ? 'var(--dp-red)' : 'var(--dp-badge-neutral-text)'
                    const posBg   = g.position === 'Pour' ? 'var(--dp-badge-pos-bg)' : g.position === 'Contre' ? 'var(--dp-badge-neg-bg)' : 'var(--dp-badge-neutral-bg)'
                    const href = groupSlug(g.name)
                    return (
                      <div key={g.name} style={{ display: 'grid', gridTemplateColumns: '200px 1fr 80px 80px 80px 90px', gap: 14, padding: '16px 24px', borderBottom: '1px solid var(--dp-track-bg)', alignItems: 'center', background: 'var(--dp-card-bg)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <span style={{ width: 9, height: 9, borderRadius: 999, flexShrink: 0, background: g.color, display: 'inline-block' }} />
                          {href ? (
                            <Link href={`/groupes/${href}`} style={{ fontSize: 13.5, color: 'var(--dp-text-secondary)', fontWeight: 500, textDecoration: 'none' }}>
                              {g.name}
                            </Link>
                          ) : (
                            <span style={{ fontSize: 13.5, color: 'var(--dp-text-secondary)', fontWeight: 500 }}>{g.name}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ flex: 1, height: 7, borderRadius: 999, background: 'var(--dp-track-bg)', overflow: 'hidden', display: 'flex' }}>
                            <div style={{ height: '100%', background: 'var(--dp-green)', width: `${g.forPct}%` }} />
                            <div style={{ height: '100%', background: 'var(--dp-red)', width: `${g.agtPct}%` }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 11px', borderRadius: 999, color: posColor, background: posBg, flexShrink: 0 }}>{g.position}</span>
                        </div>
                        <div className="font-mono" style={{ fontSize: 13, color: 'var(--dp-green)', textAlign: 'right', fontWeight: 600 }}>{g.pour}</div>
                        <div className="font-mono" style={{ fontSize: 13, color: 'var(--dp-red)', textAlign: 'right', fontWeight: 600 }}>{g.contre}</div>
                        <div className="font-mono" style={{ fontSize: 13, color: 'var(--dp-text-muted)', textAlign: 'right' }}>{g.abst}</div>
                        <div className="font-mono" style={{ fontSize: 13, color: 'var(--dp-text-muted)', textAlign: 'right' }}>{g.nonVotant}</div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Dissidences */}
            {dissidents.length > 0 && (
              <section>
                <div style={{ font: '700 12px/1 var(--font-sans)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--dp-red)' }}>Votes notables</div>
                <h2 className="font-newsreader text-section-sm" style={{ fontWeight: 600, color: 'var(--dp-text)', margin: '12px 0 22px', letterSpacing: '-0.01em' }}>Dissidences &amp; surprises</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {dissidents.map((d) => {
                    const voteColor = d.vote === 'pour' ? 'var(--dp-green)' : d.vote === 'contre' ? 'var(--dp-red)' : 'var(--dp-text-secondary)'
                    const voteBg   = d.vote === 'pour' ? 'var(--dp-badge-pos-bg)' : d.vote === 'contre' ? 'var(--dp-badge-neg-bg)' : 'var(--dp-track-bg)'
                    const voteLabel = d.vote === 'pour' ? 'Pour' : d.vote === 'contre' ? 'Contre' : 'Abstention'
                    return (
                      <Link key={d.deputy_id} href={`/deputes/${d.deputy_id}`} style={{ background: 'var(--dp-card-bg)', border: '1px solid var(--dp-border)', borderRadius: 10, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 18, boxShadow: '0 1px 3px var(--dp-shadow-sm)', textDecoration: 'none', cursor: 'pointer' }}>
                        <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: '#fff', background: d.avatarColor }}>
                          {d.initials}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--dp-text)' }}>{d.full_name}</div>
                          <div style={{ fontSize: 13, color: 'var(--dp-text-muted)', marginTop: 2 }}>{d.party}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 700, padding: '4px 12px', borderRadius: 999, color: voteColor, background: voteBg }}>{voteLabel}</span>
                          <span style={{ fontSize: 12, color: 'var(--dp-text-secondary)' }}>{d.note}</span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </section>
            )}
          </div>

          {/* Sidebar */}
          <div
            className="w-full xl:w-[300px] xl:sticky"
            style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 24, top: 120 }}
          >

            {/* Related votes */}
            {related.length > 0 && (
              <div style={{ background: 'var(--dp-card-bg)', border: '1px solid var(--dp-border)', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px var(--dp-shadow-sm)' }}>
                <div style={{ font: '700 11px/1 var(--font-sans)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--dp-text-muted)', marginBottom: 16 }}>Scrutins liés</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {related.map((r) => {
                    const rAdopted = r.result === 'adopté'
                    return (
                      <Link key={r.vote_id} href={`/votes/${r.vote_id}`} style={{ padding: '12px 0', borderBottom: '1px solid var(--dp-track-bg)', textDecoration: 'none' }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--dp-text)', lineHeight: 1.35 }}
                          className="line-clamp-2">
                          {r.vote_title}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                          <span suppressHydrationWarning className="font-mono" style={{ fontSize: 11, color: 'var(--dp-text-muted)' }}>
                            {new Date(r.voted_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999, color: rAdopted ? 'var(--dp-green)' : 'var(--dp-red)', background: rAdopted ? 'var(--dp-badge-pos-bg)' : 'var(--dp-badge-neg-bg)' }}>
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
            <div style={{ background: 'var(--dp-card-bg)', border: '1px solid var(--dp-border)', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px var(--dp-shadow-sm)' }}>
              <div style={{ font: '700 11px/1 var(--font-sans)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--dp-text-muted)', marginBottom: 14 }}>Sources officielles</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Assemblée nationale', href: `https://www.assemblee-nationale.fr/dyn/scrutins/${voteId}` },
                  { label: 'API MonÉlu — données brutes', href: `${apiUrl}/votes/${voteId}` },
                ].map(({ label, href }) => (
                  <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: 'var(--dp-text)', textDecoration: 'none', fontWeight: 500 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--dp-text-muted)" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    {label}
                  </a>
                ))}
              </div>
            </div>

            {/* Freshness */}
            <div style={{ fontSize: 12, color: 'var(--dp-text-muted)', lineHeight: 1.6, padding: '0 2px' }}>
              Données issues du flux officiel de l&apos;Assemblée nationale.<br />
              Dernière mise à jour : <span suppressHydrationWarning style={{ color: 'var(--dp-text-secondary)', fontWeight: 600 }}>{shortDate(votedAt)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
