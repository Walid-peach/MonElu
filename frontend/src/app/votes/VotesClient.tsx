'use client'
import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import Link from 'next/link'
import { api, Vote } from '@/lib/api'
import { formatDate, themeColors } from '@/lib/utils'

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
    <div style={{ background: '#F7F4ED', minHeight: '100vh' }}>

      {/* ── Hero ── */}
      <div className="px-5 sm:px-14 pt-8 sm:pt-[50px] pb-8 sm:pb-10" style={{ background: 'linear-gradient(180deg,#fff 0%,#F7F4ED 100%)', borderBottom: '1px solid #ECE7DC' }}>
        <div className="xl:grid xl:grid-cols-[1fr_340px] xl:gap-16 xl:items-start" style={{ maxWidth: 1180, margin: '0 auto' }}>

          <div className="xl:col-start-1 xl:row-start-1" style={{ font: '700 12px/1 var(--font-sans)', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9302A' }}>
            Scrutins publics
          </div>

          <h1 className="font-newsreader text-display xl:col-start-1 xl:row-start-2" style={{ fontWeight: 600, lineHeight: 1.05, letterSpacing: '-0.015em', color: '#1B2B50', margin: '16px 0 0', maxWidth: 760 }}>
            Les votes de l&apos;Assemblée nationale, <span style={{ color: '#C9302A' }}>en clair</span>.
          </h1>

          <p className="xl:col-start-1 xl:row-start-3" style={{ margin: '16px 0 0', fontSize: 17, lineHeight: 1.6, color: '#4B5563', maxWidth: 540 }}>
            Retrouvez chaque scrutin public de la XVII&#7497; législature — texte voté, résultat, et ventilation par groupe.
          </p>

          {/* Stats strip (below xl) */}
          <div className="xl:hidden grid grid-cols-2 sm:flex gap-3" style={{ marginTop: 32, maxWidth: 700 }}>
            {heroStats.map((hs, i) => (
              <div key={i} style={{ padding: '18px 22px', border: '1px solid #ECE7DC', borderRadius: 12, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div className="font-newsreader text-section-sm" style={{ fontWeight: 600, color: '#1B2B50', letterSpacing: '-0.01em' }}>{hs.value}</div>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4, lineHeight: 1.35 }}>{hs.label}</div>
              </div>
            ))}
          </div>

          {/* Stats column (xl and up) */}
          <div className="hidden xl:flex xl:flex-col xl:gap-3 xl:col-start-2 xl:row-start-1 xl:row-span-5 xl:self-start">
            {heroStats.map((hs, i) => (
              <div key={i} style={{ padding: '18px 22px', border: '1px solid #ECE7DC', borderRadius: 12, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div className="font-newsreader text-section-sm" style={{ fontWeight: 600, color: '#1B2B50', letterSpacing: '-0.01em' }}>{hs.value}</div>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4, lineHeight: 1.35 }}>{hs.label}</div>
              </div>
            ))}
          </div>

          {/* Search bar */}
          <div className="xl:col-start-1 xl:row-start-4 flex flex-col sm:flex-row gap-3" style={{ marginTop: 28, maxWidth: 720 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid #E4E6EA', borderRadius: 10, padding: '0 18px', height: 54, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>
              <input
                type="text"
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Titre du scrutin, numéro, mot-clé…"
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 16, color: '#1B2B50', background: 'transparent' }}
              />
            </div>
            <button
              onClick={handleSearch}
              className="w-full sm:w-auto justify-center"
              style={{ display: 'flex', alignItems: 'center', background: '#E0786E', color: '#fff', height: 54, padding: '0 28px', borderRadius: 10, fontWeight: 600, fontSize: 16, cursor: 'pointer', whiteSpace: 'nowrap', border: 'none', boxShadow: '0 2px 8px rgba(224,120,110,0.4)' }}>
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
                  style={{ background: active ? '#1B2B50' : '#fff', color: active ? '#fff' : '#4B5563', border: `1px solid ${active ? '#1B2B50' : '#E4E6EA'}`, padding: '8px 16px', borderRadius: 999, fontSize: 13.5, fontWeight: active ? 600 : 400, cursor: 'pointer' }}>
                  {label}
                </button>
              )
            })}
            {THEMES.map((t) => {
              const active = theme === t
              return (
                <button key={t} onClick={() => changeFilter(result, active ? '' : t)}
                  style={{ background: active ? '#1B2B50' : '#fff', color: active ? '#fff' : '#4B5563', border: `1px solid ${active ? '#1B2B50' : '#E4E6EA'}`, padding: '8px 16px', borderRadius: 999, fontSize: 13.5, fontWeight: active ? 600 : 400, cursor: 'pointer' }}>
                  {t.split(' & ')[0]}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="px-5 sm:px-14 pt-8 pb-14 sm:pb-[72px]">
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 14px' }}>
            <span className="font-mono" style={{ fontSize: 13, color: '#6B7280' }}>
              {total.toLocaleString('fr-FR')} scrutins
              {result && ` · ${result.charAt(0).toUpperCase() + result.slice(1)}s`}
              {theme && ` · ${theme}`}
              {' · triés par date'}
            </span>
            {(result || theme || search) && (
              <button onClick={() => changeFilter('', '')} style={{ fontSize: 13, color: '#C9302A', background: 'none', border: 'none', cursor: 'pointer' }}>
                Effacer les filtres
              </button>
            )}
          </div>

          <div style={{ background: '#fff', border: '1px solid #E4E6EA', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            {/* Table header */}
            <div className="hidden sm:grid" style={{ gridTemplateColumns: '100px 1fr 180px 260px 36px', gap: 16, padding: '13px 26px', borderBottom: '1px solid #E4E6EA', background: '#FBFAF6', font: '600 11.5px/1 var(--font-sans)', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF' }}>
              <span>Date</span><span>Scrutin</span><span>Thème</span><span>Résultat</span><span></span>
            </div>

            {isLoading ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Chargement…</div>
            ) : votes.length === 0 ? (
              <div style={{ padding: '40px 26px', textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Aucun scrutin trouvé.</div>
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
                    style={{ borderBottom: '1px solid #F0F1F3', alignItems: 'center', textDecoration: 'none', background: '#fff', transition: 'background 0.12s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#FBFAF6')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>

                    {/* Date */}
                    <div suppressHydrationWarning className="font-mono order-1 sm:order-none" style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.4 }}>
                      {shortDate(vote.voted_at)}
                    </div>

                    {/* Title */}
                    <div className="order-2 sm:order-none" style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 15, color: '#1B2B50', lineHeight: 1.3 }}
                        className="line-clamp-2">
                        {vote.summary_plain || vote.vote_title}
                      </div>
                      <div style={{ fontSize: 12.5, color: '#9CA3AF', marginTop: 4 }}
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
                        <span style={{ color: '#D1D5DB', fontSize: 12 }}>—</span>
                      )}
                    </div>

                    {/* Result */}
                    <div className="order-4 sm:order-none">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', padding: '3px 10px', borderRadius: 999, background: adopted ? '#EAF5EF' : '#FBE9E7', color: adopted ? '#1F8A5B' : '#C9302A' }}>
                          {adopted ? 'Adopté' : 'Rejeté'}
                        </span>
                        <span className="font-mono" style={{ fontSize: 11.5, color: '#6B7280' }}>
                          {vote.votes_for} pour · {vote.votes_against} contre
                        </span>
                      </div>
                      <div style={{ display: 'flex', height: 5, borderRadius: 999, overflow: 'hidden', background: '#F0F1F3' }}>
                        <div style={{ height: '100%', background: '#1F8A5B', width: `${forPct}%` }} />
                        <div style={{ height: '100%', background: '#D9685E', width: `${agtPct}%` }} />
                        <div style={{ height: '100%', background: '#D1D5DB', flex: 1 }} />
                      </div>
                    </div>

                    {/* Chevron */}
                    <svg className="hidden sm:block" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C4C9D2" strokeWidth="2.2" strokeLinecap="round"><path d="m9 6 6 6-6 6"/></svg>
                  </Link>
                )
              })
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 26, fontSize: 14, color: '#6B7280' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #E4E6EA', borderRadius: 8, background: '#fff', cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1 }}>
                ‹
              </button>
              {buildPageNumbers(page, totalPages).map((p, i) =>
                p === '…' ? (
                  <span key={`ellipsis-${i}`} style={{ padding: '0 6px' }}>…</span>
                ) : (
                  <button key={p} onClick={() => setPage(p as number)}
                    style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: page === p ? '#1B2B50' : '#fff', color: page === p ? '#fff' : '#6B7280', border: page === p ? 'none' : '1px solid #E4E6EA', fontWeight: page === p ? 600 : 400, cursor: 'pointer' }}>
                    {p}
                  </button>
                )
              )}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #E4E6EA', borderRadius: 8, background: '#fff', cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? 0.4 : 1 }}>
                ›
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
