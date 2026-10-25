'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { Deputy } from '@/lib/api'
import { partyHex, partyShort } from '@/lib/utils'
import { departmentLabel } from '@/lib/departments'
import { DeputyAvatar } from '@/components/DeputyAvatar'
import { Pill, PhonePageHeader, cardClass } from '@/components/phone/kit'

/** Rows shown before "Afficher plus", and how many more each tap adds. */
export const MOBILE_PAGE_SIZE = 20

type SortKey = 'nom' | 'region' | 'parti'

/**
 * The deputies directory below `md` (canvas "Députés · liste"). The search,
 * postal-code lookup and sorting live in `DeputiesClient`, which renders this
 * next to the desktop layout and hands it the filtered list; this view adds
 * the group chips and "Afficher plus" paging that suit a phone.
 */
export function DeputiesMobile({
  total,
  search,
  onSearch,
  sort,
  onSort,
  filtered,
  groups,
  postalNotFound,
  departmentLink,
}: {
  total: number
  search: string
  onSearch: (value: string) => void
  sort: SortKey
  onSort: (value: SortKey) => void
  filtered: Deputy[]
  groups: Array<{ party: string; count: number }>
  postalNotFound: boolean
  departmentLink: { href: string; label: string } | null
}) {
  const [group, setGroup] = useState<string | null>(null)
  const [shown, setShown] = useState(MOBILE_PAGE_SIZE)

  const rows = group ? filtered.filter(d => (d.party ?? 'Non inscrit') === group) : filtered
  const visible = rows.slice(0, shown)

  return (
    <div className="bg-[color:var(--dp-page-bg)] pb-8 md:hidden">
      <PhonePageHeader eyebrow="Annuaire des députés" title="Chaque député, vote par vote.">
        <label className="flex h-[52px] items-center gap-2.5 rounded-2xl border border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] pl-3.5 pr-1.5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="text-[color:var(--dp-text-muted)]">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <span className="sr-only">Rechercher un député</span>
          <input
            type="search"
            value={search}
            onChange={e => { onSearch(e.target.value); setShown(MOBILE_PAGE_SIZE) }}
            placeholder="Nom, département ou code postal"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-[color:var(--dp-text)] outline-none placeholder:text-[color:var(--dp-text-muted)]"
          />
          <Link
            href="/mon-depute"
            aria-label="Trouver mon député par code postal"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-[color:var(--dp-page-bg)] text-[color:var(--dp-text)]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
          </Link>
        </label>
        {postalNotFound && (
          <p className="text-sm text-[color:var(--dp-text-secondary)]">Aucun département trouvé pour ce code postal.</p>
        )}
        {departmentLink && (
          <Link href={departmentLink.href} className="text-sm font-semibold text-[color:var(--dp-text)] underline underline-offset-2">
            Voir tous les députés de {departmentLink.label} →
          </Link>
        )}
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" role="group" aria-label="Groupe">
          <Pill pressed={group === null} onClick={() => { setGroup(null); setShown(MOBILE_PAGE_SIZE) }}>
            Tous
          </Pill>
          {groups.map(g => (
            <Pill key={g.party} pressed={group === g.party} onClick={() => { setGroup(g.party); setShown(MOBILE_PAGE_SIZE) }}>
              {partyShort(g.party)} · {g.count}
            </Pill>
          ))}
        </div>
        <label className="flex items-center justify-between gap-3 text-sm text-[color:var(--dp-text-secondary)]">
          <span>
            {rows.length} député{rows.length > 1 ? 's' : ''}
            {rows.length !== total ? ` sur ${total}` : ''}
          </span>
          <span className="flex items-center gap-2">
            Trier par
            <select
              value={sort}
              onChange={e => onSort(e.target.value as SortKey)}
              className="h-10 rounded-full border border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] px-3 text-sm font-semibold text-[color:var(--dp-text)]"
            >
              <option value="nom">Nom</option>
              <option value="region">Département</option>
              <option value="parti">Groupe</option>
            </select>
          </span>
        </label>
      </PhonePageHeader>

      <ul className="flex flex-col gap-2 px-4" aria-label="Liste des députés">
        {visible.map(d => (
          <li key={d.deputy_id}>
            <Link href={`/deputes/${d.deputy_id}`} className={`${cardClass} flex items-center gap-3 p-3`}>
              <span className="relative flex-none">
                <DeputyAvatar name={d.full_name} photoUrl={d.photo_url} decorative />
                <span
                  aria-hidden="true"
                  className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[color:var(--dp-card-bg)]"
                  style={{ background: d.party ? partyHex(d.party) : 'var(--dp-text-muted)' }}
                />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-base font-bold">{d.full_name}</span>
                <span className="truncate text-[13px] text-[color:var(--dp-text-secondary)]">
                  {d.party ?? 'Non inscrit'} · {departmentLabel(d.department) ?? d.department ?? '—'}
                </span>
              </span>
              {d.mandate_end && (
                <span className="flex-none rounded-md bg-[color:var(--dp-track-bg)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--dp-text-secondary)]">
                  Ancien
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>

      {rows.length === 0 && (
        <p className="px-5 py-6 text-center text-sm text-[color:var(--dp-text-secondary)]">Aucun député ne correspond à cette recherche.</p>
      )}
      {rows.length > shown && (
        <div className="px-4 pt-3">
          <button
            type="button"
            onClick={() => setShown(n => n + MOBILE_PAGE_SIZE)}
            className="h-[50px] w-full rounded-[14px] border-[1.5px] border-[color:var(--dp-text)] text-[15px] font-medium text-[color:var(--dp-text)]"
          >
            Afficher plus ({rows.length - shown} restants)
          </button>
        </div>
      )}

      <Link
        href="/deputes/comparer"
        className="dp-dark mx-4 mt-5 flex items-center gap-3.5 rounded-[20px] bg-navy p-4 text-white"
      >
        <span aria-hidden="true" className="flex flex-none">
          <span className="h-9 w-9 rounded-full border-2 border-navy bg-gray-off" />
          <span className="-ml-3 h-9 w-9 rounded-full border-2 border-navy bg-red-civic" />
        </span>
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="text-base font-bold">Comparer deux députés</span>
          <span className="text-[13px] text-[color:var(--dp-text-secondary)]">Où ils votent ensemble, où ils s&apos;opposent</span>
        </span>
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  )
}
