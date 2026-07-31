'use client'
import { useState, useEffect, useRef, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { api, type Deputy, type Vote } from '@/lib/api'
import { getInitials, partyHex } from '@/lib/utils'

type ResultRow =
  | { type: 'deputy'; key: string; id: string; label: string; sub: string | null }
  | { type: 'vote'; key: string; id: string; label: string; adopted: boolean }
  | { type: 'ai'; key: string; query: string }

// Simple heuristic: French interrogatives at the start, or a trailing "?".
const INTERROGATIVES = ['qui', 'quel', 'quelle', 'quels', 'quelles', 'comment', 'pourquoi', 'quand', 'où', 'combien']

function looksLikeQuestion(q: string): boolean {
  const trimmed = q.trim()
  if (trimmed.endsWith('?')) return true
  const first = trimmed.toLowerCase().split(/\s+/)[0]?.replace(/[’']/g, "'").split("'")[0]
  return INTERROGATIVES.includes(first ?? '')
}

type Results = { query: string; deputies: Deputy[]; votes: Vote[] }

const EMPTY_RESULTS: Results = { query: '', deputies: [], votes: [] }

// The search overlay is mounted once in the layout; the nav menus and the
// mobile sheet open it by firing this event rather than owning a trigger.
const OPEN_SEARCH_EVENT = 'monelu:open-search'

export function openGlobalSearch() {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))
}

/** `hideTrigger` mounts the overlay without its own button (⌘K / event only). */
export function GlobalSearch({ hideTrigger = false }: { hideTrigger?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [results, setResults] = useState<Results>(EMPTY_RESULTS)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  function closeSearch() {
    setOpen(false)
    setQuery('')
    setResults(EMPTY_RESULTS)
    setActiveIndex(0)
  }

  // Cmd/Ctrl-K opens from anywhere; Escape closes.
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      } else if (e.key === 'Escape') {
        closeSearch()
      }
    }
    function onOpenRequest() { setOpen(true) }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener(OPEN_SEARCH_EVENT, onOpenRequest)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpenRequest)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => inputRef.current?.focus(), 10)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    const q = debounced.trim()
    if (q.length < 2) return
    let cancelled = false
    Promise.all([
      api.deputies.list({ search: q, limit: 5 }).catch(() => ({ items: [] as Deputy[] })),
      api.votes.list({ search: q, limit: 5 }).catch(() => ({ items: [] as Vote[] })),
    ]).then(([d, v]) => {
      if (!cancelled) { setResults({ query: q, deputies: d.items, votes: v.items }); setActiveIndex(0) }
    })
    return () => { cancelled = true }
  }, [debounced])

  // Only show results for the query they were fetched for — avoids a flash of
  // stale rows from the previous search while the new one is in flight.
  const resultsMatch = results.query === debounced.trim()
  const deputies = resultsMatch ? results.deputies : []
  const votes = resultsMatch ? results.votes : []

  const isQuestion = query.trim().length > 2 && looksLikeQuestion(query)

  const rows: ResultRow[] = [
    ...deputies.map(d => ({ type: 'deputy' as const, key: `d-${d.deputy_id}`, id: d.deputy_id, label: d.full_name, sub: d.party })),
    ...votes.map(v => ({ type: 'vote' as const, key: `v-${v.vote_id}`, id: v.vote_id, label: v.vote_title, adopted: v.result === 'adopté' })),
    ...(isQuestion ? [{ type: 'ai' as const, key: 'ai', query: query.trim() }] : []),
  ]

  function go(row: ResultRow) {
    closeSearch()
    if (row.type === 'deputy') router.push(`/deputes/${row.id}`)
    else if (row.type === 'vote') router.push(`/votes/${row.id}`)
    else router.push(`/chat?q=${encodeURIComponent(row.query)}`)
  }

  function onQueryChange(value: string) {
    setQuery(value)
    setActiveIndex(0)
  }

  function onInputKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, rows.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const row = rows[activeIndex]; if (row) go(row) }
  }

  let lastGroup: string | null = null

  return (
    <>
      {!hideTrigger && (
      <button
        onClick={() => setOpen(true)}
        aria-label="Rechercher (Cmd+K)"
        style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #E4E6EA', borderRadius: 8, padding: '6px 12px', background: '#fff', color: '#6B7280', fontSize: 13, cursor: 'pointer' }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
        <span className="hidden lg:inline">Rechercher</span>
        <span className="hidden lg:inline font-mono" style={{ fontSize: 11, color: '#9CA3AF', border: '1px solid #E4E6EA', borderRadius: 4, padding: '1px 5px' }}>⌘K</span>
      </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Recherche globale"
          onClick={closeSearch}
          style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.5)', zIndex: 100, display: 'flex', justifyContent: 'center', paddingTop: '12vh' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, maxHeight: '70vh', background: '#fff', borderRadius: 14, boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid #E4E6EA', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
              <input
                ref={inputRef}
                value={query}
                onChange={e => onQueryChange(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Un député, un vote, ou une question…"
                aria-label="Rechercher un député, un vote, ou poser une question"
                style={{ flex: 1, border: 'none', fontSize: 16, color: '#1B2B50' }}
              />
              <button onClick={closeSearch} aria-label="Fermer la recherche" style={{ border: 'none', background: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 12.5 }}>Échap</button>
            </div>

            <div role="listbox" style={{ overflowY: 'auto', padding: '8px 0' }}>
              {rows.length === 0 && (
                <div style={{ padding: '24px 20px', textAlign: 'center', color: '#9CA3AF', fontSize: 13.5 }}>
                  {query.trim().length < 2 ? 'Tapez au moins 2 caractères…' : `Aucun résultat pour « ${query.trim()} ».`}
                </div>
              )}

              {rows.map((row, i) => {
                const groupLabel = row.type === 'deputy' ? 'Députés' : row.type === 'vote' ? 'Votes' : 'Assistant IA'
                const showGroup = groupLabel !== lastGroup
                lastGroup = groupLabel
                return (
                  <div key={row.key}>
                    {showGroup && (
                      <div style={{ padding: '8px 20px 4px', font: '700 11px/1 var(--font-sans)', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9CA3AF' }}>
                        {groupLabel}
                      </div>
                    )}
                    <div
                      role="option"
                      aria-selected={activeIndex === i}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => go(row)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', cursor: 'pointer', background: activeIndex === i ? '#F7F4ED' : 'transparent' }}
                    >
                      {row.type === 'deputy' && (
                        <>
                          <span style={{ width: 26, height: 26, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 10, color: '#fff', background: partyHex(row.sub) }}>
                            {getInitials(row.label)}
                          </span>
                          <span style={{ fontWeight: 500, color: '#1B2B50' }}>{row.label}</span>
                        </>
                      )}
                      {row.type === 'vote' && (
                        <>
                          <span style={{ fontWeight: 500, color: '#1B2B50', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, flexShrink: 0, color: row.adopted ? '#1F8A5B' : '#C9302A' }}>{row.adopted ? 'Adopté' : 'Rejeté'}</span>
                        </>
                      )}
                      {row.type === 'ai' && (
                        <>
                          <span style={{ fontSize: 15 }}>💬</span>
                          <span style={{ fontWeight: 500, color: '#1B2B50' }}>Poser « {row.query} » à l&apos;IA →</span>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
