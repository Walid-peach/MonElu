'use client'
import Link from 'next/link'
import type { Vote } from '@/lib/api'
import type { LoadingPhase } from '@/lib/loadingPolicy'
import { themeColors } from '@/lib/utils'
import { Pill, PhonePageHeader, ResultBadge, SplitBar, cardClass } from '@/components/phone/kit'

function shortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * The votes list below `md` (canvas "Votes · liste"). Filters, search and
 * paging live in `VotesClient`, which renders this next to the desktop
 * layout; this view lays the same list out as cards with a split bar each.
 */
export function VotesMobile({
  votes,
  total,
  result,
  theme,
  themes,
  onFilter,
  inputVal,
  onInput,
  onSearch,
  page,
  totalPages,
  onPage,
  loadingPhase,
}: {
  votes: Vote[]
  total: number
  result: string
  theme: string
  themes: string[]
  onFilter: (result: string, theme: string) => void
  inputVal: string
  onInput: (value: string) => void
  onSearch: () => void
  page: number
  totalPages: number
  onPage: (page: number) => void
  loadingPhase: LoadingPhase
}) {
  return (
    <div className="bg-[color:var(--dp-page-bg)] pb-8 md:hidden">
      <PhonePageHeader eyebrow="Scrutins publics" title="Chaque vote, en clair.">
        <form
          role="search"
          onSubmit={e => { e.preventDefault(); onSearch() }}
          className="flex h-[52px] items-center gap-2.5 rounded-2xl border border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] pl-3.5 pr-1.5"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="flex-none text-[color:var(--dp-text-muted)]">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <label className="sr-only" htmlFor="votes-mobile-search">Rechercher un scrutin</label>
          <input
            id="votes-mobile-search"
            type="search"
            value={inputVal}
            onChange={e => onInput(e.target.value)}
            placeholder="Titre, numéro, mot-clé"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-[color:var(--dp-text)] outline-none placeholder:text-[color:var(--dp-text-muted)]"
          />
          <button type="submit" className="h-11 flex-none rounded-xl bg-[color:var(--dp-cta-bg)] px-3.5 text-sm font-semibold text-white">
            Chercher
          </button>
        </form>
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" role="group" aria-label="Filtrer les scrutins">
          {(['', 'adopté', 'rejeté'] as const).map(r => (
            <Pill key={r || 'tous'} pressed={result === r && theme === ''} onClick={() => onFilter(r, '')}>
              {r === '' ? 'Tous' : r === 'adopté' ? 'Adoptés' : 'Rejetés'}
            </Pill>
          ))}
          {themes.map(t => (
            <Pill key={t} pressed={theme === t} onClick={() => onFilter(result, theme === t ? '' : t)}>
              {t.split(' & ')[0]}
            </Pill>
          ))}
        </div>
        <p className="text-sm text-[color:var(--dp-text-secondary)]">
          {total.toLocaleString('fr-FR')} scrutin{total > 1 ? 's' : ''}
          {theme ? ` · ${theme}` : ''} · les plus récents d&apos;abord
        </p>
      </PhonePageHeader>

      {loadingPhase !== 'none' ? (
        <p role="status" className="px-5 py-6 text-center text-sm text-[color:var(--dp-text-secondary)]">
          Chargement des scrutins…
        </p>
      ) : votes.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-[color:var(--dp-text-secondary)]">Aucun scrutin trouvé.</p>
      ) : (
        <ul className="flex flex-col gap-2 px-4" aria-label="Liste des scrutins">
          {votes.map(v => {
            const tc = themeColors(v.theme ?? null)
            return (
              <li key={v.vote_id}>
                <Link href={`/votes/${v.vote_id}`} className={`${cardClass} flex flex-col gap-2.5 p-4`}>
                  <span className="flex items-center justify-between gap-2">
                    <span suppressHydrationWarning className="font-mono text-xs text-[color:var(--dp-text-secondary)]">
                      {shortDate(v.voted_at)}
                    </span>
                    {v.theme && (
                      <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: tc.bg, color: tc.c }}>
                        {v.theme.split(' & ')[0]}
                      </span>
                    )}
                  </span>
                  <span className="line-clamp-3 text-base font-semibold leading-snug">{v.summary_plain || v.vote_title}</span>
                  <span className="text-xs text-[color:var(--dp-text-secondary)]">Scrutin n°{v.vote_id}</span>
                  <SplitBar pour={v.votes_for} contre={v.votes_against} abstention={v.abstentions} height={8} />
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[color:var(--dp-text-secondary)]">
                    <ResultBadge result={v.result} />
                    <span>{v.votes_for} pour · {v.votes_against} contre</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <nav aria-label="Pages des scrutins" className="flex items-center justify-between gap-3 px-4 pt-4">
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={page === 1}
            className="h-11 rounded-[14px] border-[1.5px] border-[color:var(--dp-text)] px-4 text-sm font-medium text-[color:var(--dp-text)] disabled:opacity-40"
          >
            ‹ Plus récents
          </button>
          <span className="text-sm text-[color:var(--dp-text-secondary)]">
            Page {page} sur {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={page === totalPages}
            className="h-11 rounded-[14px] border-[1.5px] border-[color:var(--dp-text)] px-4 text-sm font-medium text-[color:var(--dp-text)] disabled:opacity-40"
          >
            Plus anciens ›
          </button>
        </nav>
      )}
    </div>
  )
}
