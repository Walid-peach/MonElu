'use client'
import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import Link from 'next/link'
import { api, Vote } from '@/lib/api'
import { formatDate, themeColors } from '@/lib/utils'
import { themeSlug } from '@/lib/themes'
import { AsyncStatus } from '@/components/ui/AsyncStatus'
import { ContentSkeleton } from '@/components/ui/ContentSkeleton'
import { useLoadingPhase } from '@/lib/loadingPolicy'
import { VoteRowSkeleton } from './VoteRowSkeleton'

const SKELETON_ROW_COUNT = 8

type VoteList = { total: number; items: Vote[]; limit: number; offset: number }
type HeroStat = { value: string; label: string }

const THEMES = [
  'Économie & Budget',
  'Santé & Social',
  'Justice & Sécurité',
  'Énergie & Environnement',
  'Éducation & Culture',
  'Agriculture',
  'Transport & Logement',
  'Institutions',
  'International',
  'Autre',
]

const PAGE_SIZE = 50

function shortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function buildPageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '…')[] = []
  pages.push(1)
  if (current > 3) pages.push('…')
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p)
  if (current < total - 2) pages.push('…')
  pages.push(total)
  return pages
}

export function VotesClient({ initial, heroStats }: { initial: VoteList; heroStats: HeroStat[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [result, setResult] = useState(() => searchParams.get('result') ?? '')
  const [theme, setTheme]   = useState(() => searchParams.get('theme')  ?? '')
  const [search, setSearch] = useState('')
  const [inputVal, setInputVal] = useState('')
  const [page, setPage]     = useState(1)

  const offset = (page - 1) * PAGE_SIZE

  const skipFirstSync = useRef(true)
  useEffect(() => {
    if (skipFirstSync.current) { skipFirstSync.current = false; return }
    const p = new URLSearchParams()
    if (result) p.set('result', result)
    if (theme)  p.set('theme', theme)
    const qs = p.toString()
    router.replace(`/votes${qs ? `?${qs}` : ''}`, { scroll: false })
  }, [result, theme, router])

  const { data, isLoading } = useSWR(
    `votes:${result}:${theme}:${search}:${offset}`,
    () => api.votes.list({ result: result || undefined, theme: theme || undefined, search: search || undefined, limit: PAGE_SIZE, offset }),
    { keepPreviousData: true }
  )
  const loadingPhase = useLoadingPhase(isLoading)

  const votes = data?.items ?? (search ? [] : initial.items)
  const total = data?.total  ?? (search ? 0 : initial.total)

  const totalPages = Math.ceil(total / PAGE_SIZE)

  function changeFilter(newResult: string, newTheme: string) {
    setResult(newResult)
    setTheme(newTheme)
    setPage(1)
    setSearch('')
    setInputVal('')
  }

  function handleSearch() {
    setSearch(inputVal)
    setPage(1)
  }

  return (
    <div style={{ background: 'var(--dp-page-bg)', minHeight: '100vh' }}>

      {/* ── Hero ── */}
      <div className="px-5 sm:px-14 pt-8 sm:pt-[50px] pb-8 sm:pb-10" style={{ background: 'linear-gradient(180deg,var(--dp-card-bg) 0%,var(--dp-page-bg) 100%)', borderBottom: '1px solid var(--dp-border-subtle)' }}>
        <div className="xl:grid xl:grid-cols-[1fr_340px] xl:gap-16 xl:items-start" style={{ maxWidth: 1180, margin: '0 auto' }}>

          <div className="xl:col-start-1 xl:row-start-1" style={{ font: '700 12px/1 var(--font-sans)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--dp-red)' }}>
            Scrutins publics
          </div>

          <h1 className="font-newsreader text-display xl:col-start-1 xl:row-start-2" style={{ fontWeight: 600, lineHeight: 1.05, letterSpacing: '-0.015em', color: 'var(--dp-text)', margin: '16px 0 0', maxWidth: 760 }}>
            Les votes de l&apos;Assemblée nationale, <span style={{ color: 'var(--dp-red)' }}>en clair</span>.
          </h1>

          <p className="xl:col-start-1 xl:row-start-3" style={{ margin: '16px 0 0', fontSize: 17, lineHeight: 1.6, color: 'var(--dp-text-secondary)', maxWidth: 540 }}>
            Retrouvez chaque scrutin public de la XVII&#7497; législature — texte voté, résultat, et ventilation par groupe.
          </p>

          {/* Stats strip (below xl) */}
          <div className="xl:hidden grid grid-cols-2 sm:flex gap-3" style={{ marginTop: 32, maxWidth: 700 }}>
            {heroStats.map((hs, i) => (
              <div key={i} style={{ padding: '18px 22px', border: '1px solid var(--dp-border-subtle)', borderRadius: 12, background: 'var(--dp-card-bg)', boxShadow: '0 1px 3px var(--dp-shadow-sm)' }}>
                <div className="font-newsreader text-section-sm" style={{ fontWeight: 600, color: 'var(--dp-text)', letterSpacing: '-0.01em' }}>{hs.value}</div>
                <div style={{ fontSize: 12, color: 'var(--dp-text-muted)', marginTop: 4, lineHeight: 1.35 }}>{hs.label}</div>
              </div>
            ))}
          </div>

          {/* Stats column (xl and up) */}
          <div className="hidden xl:flex xl:flex-col xl:gap-3 xl:col-start-2 xl:row-start-1 xl:row-span-5 xl:self-start">
            {heroStats.map((hs, i) => (
              <div key={i} style={{ padding: '18px 22px', border: '1px solid var(--dp-border-subtle)', borderRadius: 12, background: 'var(--dp-card-bg)', boxShadow: '0 1px 3px var(--dp-shadow-sm)' }}>
                <div className="font-newsreader text-section-sm" style={{ fontWeight: 600, color: 'var(--dp-text)', letterSpacing: '-0.01em' }}>{hs.value}</div>
                <div style={{ fontSize: 12, color: 'var(--dp-text-muted)', marginTop: 4, lineHeight: 1.35 }}>{hs.label}</div>
              </div>
            ))}
          </div>

          {/* Search bar */}
          <div className="xl:col-start-1 xl:row-start-4 flex flex-col sm:flex-row gap-3" style={{ marginTop: 28, maxWidth: 720 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--dp-card-bg)', border: '1px solid var(--dp-border)', borderRadius: 10, padding: '0 18px', height: 54, boxShadow: '0 1px 3px var(--dp-shadow-sm)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--dp-text-muted)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>
              <input
                type="text"
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Titre du scrutin, numéro, mot-clé…"
                style={{ flex: 1, border: 'none', fontSize: 16, color: 'var(--dp-text)', background: 'transparent' }}
              />
            </div>
            <button
              onClick={handleSearch}
              className="w-full sm:w-auto justify-center"
              style={{ display: 'flex', alignItems: 'center', background: 'var(--dp-cta-bg)', color: '#fff', height: 54, padding: '0 28px', borderRadius: 10, fontWeight: 600, fontSize: 16, cursor: 'pointer', whiteSpace: 'nowrap', border: 'none', boxShadow: '0 2px 8px var(--dp-cta-shadow)' }}>
              Rechercher
            </button>
          </div>

          {/* Filter chips */}
          <div className="xl:col-start-1 xl:row-start-5" style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 18, alignItems: 'center' }}>
            {(['', 'adopté', 'rejeté'] as const).map((r) => {
              const label = r === '' ? 'Tous les scrutins' : r === 'adopté' ? 'Adoptés' : 'Rejetés'
              const active = result === r && theme === ''
              return (
                <button key={r} onClick={() => changeFilter(r, '')}
                  style={{ background: active ? 'var(--dp-active-bg)' : 'var(--dp-card-bg)', color: active ? '#fff' : 'var(--dp-text-secondary)', border: `1px solid ${active ? 'var(--dp-active-bg)' : 'var(--dp-border)'}`, padding: '8px 16px', borderRadius: 999, fontSize: 13.5, fontWeight: active ? 600 : 400, cursor: 'pointer' }}>
                  {label}
                </button>
              )
            })}
            {THEMES.map((t) => {
              const active = theme === t
              return (
                <button key={t} onClick={() => changeFilter(result, active ? '' : t)}
                  style={{ background: active ? 'var(--dp-active-bg)' : 'var(--dp-card-bg)', color: active ? '#fff' : 'var(--dp-text-secondary)', border: `1px solid ${active ? 'var(--dp-active-bg)' : 'var(--dp-border)'}`, padding: '8px 16px', borderRadius: 999, fontSize: 13.5, fontWeight: active ? 600 : 400, cursor: 'pointer' }}>
                  {t.split(' & ')[0]}
                </button>
              )
            })}
          </div>

          {/* Theme hub pages (MON-106) — aggregate stats per theme, distinct
              from the in-page filter chips above. */}
          <div className="xl:col-start-1 xl:row-start-6" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14, alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, color: 'var(--dp-text-muted)', marginRight: 4 }}>Voir le bilan par thème :</span>
            {THEMES.map((t) => {
              const slug = themeSlug(t)
              if (!slug) return null
              const tc = themeColors(t)
              return (
                <Link key={t} href={`/themes/${slug}`}
                  style={{ display: 'inline-flex', alignItems: 'center', fontSize: 12.5, fontWeight: 600, padding: '5px 12px', borderRadius: 999, background: tc.bg, color: tc.c, textDecoration: 'none' }}>
                  {t.split(' & ')[0]}
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="px-5 sm:px-14 pt-8 pb-14 sm:pb-[72px]">
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 14px' }}>
            <span className="font-mono" style={{ fontSize: 13, color: 'var(--dp-text-secondary)' }}>
              {total.toLocaleString('fr-FR')} scrutins
              {result && ` · ${result.charAt(0).toUpperCase() + result.slice(1)}s`}
              {theme && ` · ${theme}`}
              {' · triés par date'}
            </span>
            {(result || theme || search) && (
              <button onClick={() => changeFilter('', '')} style={{ fontSize: 13, color: 'var(--dp-red)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Effacer les filtres
              </button>
            )}
          </div>

          <div style={{ background: 'var(--dp-card-bg)', border: '1px solid var(--dp-border)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px var(--dp-shadow-sm)' }}>
            {/* Table header */}
            <div className="hidden sm:grid" style={{ gridTemplateColumns: '100px 1fr 180px 260px 36px', gap: 16, padding: '13px 26px', borderBottom: '1px solid var(--dp-border)', background: 'var(--dp-header-bg)', font: '600 11.5px/1 var(--font-sans)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--dp-text-muted)' }}>
              <span>Date</span><span>Scrutin</span><span>Thème</span><span>Résultat</span><span></span>
            </div>

            {loadingPhase === 'content' ? (
              <ContentSkeleton label="Chargement des scrutins…">
                {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
                  <VoteRowSkeleton key={i} />
                ))}
              </ContentSkeleton>
            ) : loadingPhase === 'inline' ? (
              <div style={{ padding: '20px 0' }}>
                <AsyncStatus status="Chargement…" phase="inline" className="flex justify-center" />
              </div>
            ) : votes.length === 0 ? (
              <div style={{ padding: '40px 26px', textAlign: 'center', color: 'var(--dp-text-muted)', fontSize: 14 }}>Aucun scrutin trouvé.</div>
            ) : (
              votes.map((vote) => {
                const total_v = vote.total_voters || 1
                const forPct  = Math.round(vote.votes_for     / total_v * 100)
                const agtPct  = Math.round(vote.votes_against / total_v * 100)
                const tc = themeColors(vote.theme ?? null)
                const adopted = vote.result === 'adopté'
                return (
                  <Link key={vote.vote_id} href={`/votes/${vote.vote_id}`}
                    className="grid grid-cols-1 sm:grid-cols-[100px_1fr_180px_260px_36px] gap-1.5 sm:gap-4 px-4 sm:px-[26px] py-4 sm:py-[18px]"
                    style={{ borderBottom: '1px solid var(--dp-track-bg)', alignItems: 'center', textDecoration: 'none', background: 'var(--dp-card-bg)', transition: 'background 0.12s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--dp-header-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--dp-card-bg)')}>

                    {/* Date */}
                    <div suppressHydrationWarning className="font-mono order-1 sm:order-none" style={{ fontSize: 12, color: 'var(--dp-text-muted)', lineHeight: 1.4 }}>
                      {shortDate(vote.voted_at)}
                    </div>

                    {/* Title */}
                    <div className="order-2 sm:order-none" style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--dp-text)', lineHeight: 1.3 }}
                        className="line-clamp-2">
                        {vote.summary_plain || vote.vote_title}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--dp-text-muted)', marginTop: 4 }}
                        className="line-clamp-1">
                        Scrutin n°{vote.vote_id}
                        {vote.summary_plain && ` · ${vote.vote_title}`}
                      </div>
                    </div>

                    {/* Theme */}
                    <div className="order-3 sm:order-none">
                      {vote.theme ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 999, background: tc.bg, color: tc.c }}>
                          {vote.theme.split(' & ')[0]}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--dp-abstention)', fontSize: 12 }}>—</span>
                      )}
                    </div>

                    {/* Result */}
                    <div className="order-4 sm:order-none">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', padding: '3px 10px', borderRadius: 999, background: adopted ? 'var(--dp-badge-pos-bg)' : 'var(--dp-badge-neg-bg)', color: adopted ? 'var(--dp-green)' : 'var(--dp-red)' }}>
                          {adopted ? 'Adopté' : 'Rejeté'}
                        </span>
                        <span className="font-mono" style={{ fontSize: 11.5, color: 'var(--dp-text-secondary)' }}>
                          {vote.votes_for} pour · {vote.votes_against} contre
                        </span>
                      </div>
                      <div style={{ display: 'flex', height: 5, borderRadius: 999, overflow: 'hidden', background: 'var(--dp-track-bg)' }}>
                        <div style={{ height: '100%', background: 'var(--dp-green)', width: `${forPct}%` }} />
                        <div style={{ height: '100%', background: 'var(--dp-red)', width: `${agtPct}%` }} />
                        <div style={{ height: '100%', background: 'var(--dp-abstention)', flex: 1 }} />
                      </div>
                    </div>

                    {/* Chevron */}
                    <svg className="hidden sm:block" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--dp-underline)" strokeWidth="2.2" strokeLinecap="round"><path d="m9 6 6 6-6 6"/></svg>
                  </Link>
                )
              })
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 26, fontSize: 14, color: 'var(--dp-text-secondary)' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--dp-border)', borderRadius: 8, background: 'var(--dp-card-bg)', cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1 }}>
                ‹
              </button>
              {buildPageNumbers(page, totalPages).map((p, i) =>
                p === '…' ? (
                  <span key={`ellipsis-${i}`} style={{ padding: '0 6px' }}>…</span>
                ) : (
                  <button key={p} onClick={() => setPage(p as number)}
                    style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: page === p ? 'var(--dp-active-bg)' : 'var(--dp-card-bg)', color: page === p ? '#fff' : 'var(--dp-text-secondary)', border: page === p ? 'none' : '1px solid var(--dp-border)', fontWeight: page === p ? 600 : 400, cursor: 'pointer' }}>
                    {p}
                  </button>
                )
              )}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--dp-border)', borderRadius: 8, background: 'var(--dp-card-bg)', cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? 0.4 : 1 }}>
                ›
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
