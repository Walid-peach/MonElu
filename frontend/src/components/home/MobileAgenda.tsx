'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { AgendaItem, AgendaResponse } from '@/lib/api'
import { agendaHeadline, agendaItemHref, formatSittingTime, showsPointType } from '@/lib/agenda'

/** Sitting days offered as tabs: enough for a week, never a scrolling strip. */
export const MOBILE_AGENDA_DAYS = 5
/** Points shown per day before "et N autres" sends the reader to /agenda. */
export const MOBILE_AGENDA_ITEMS = 4

const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' })

/** "SAM" and "24" for `2026-10-24`, read as the calendar date the API grouped by. */
export function dayTab(isoDate: string): { weekday: string; day: string } {
  const date = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return { weekday: '', day: isoDate }
  return {
    weekday: WEEKDAY.format(date).replace('.', '').toUpperCase(),
    day: String(date.getUTCDate()),
  }
}

/** One agenda point as a timeline card; shared with the /agenda phone layout. */
export function AgendaItemCard({ item }: { item: AgendaItem }) {
  const { lead } = agendaHeadline(item)
  const kind = showsPointType(item.point_type, lead) ? item.point_type : null
  const href = agendaItemHref(item)
  const voted = item.vote_id && item.result

  const body = (
    <>
      {(kind || voted) && (
        <span className="flex flex-wrap gap-1.5">
          {kind && (
            <span className="rounded-md bg-[#EDECEA] dark:bg-[color:var(--dp-track-bg)] px-2 py-0.5 text-[11px] font-bold text-[color:var(--dp-text-secondary)]">
              {kind}
            </span>
          )}
          {voted && (
            <span className="rounded-md bg-[color:var(--dp-badge-info-bg)] px-2 py-0.5 text-[11px] font-bold text-[color:var(--dp-badge-info-text)]">
              Voté · {item.result === 'adopté' ? 'Adopté' : 'Rejeté'}
            </span>
          )}
        </span>
      )}
      <span className="line-clamp-3 font-newsreader text-[17px] leading-snug text-[color:var(--dp-text)]">{lead}</span>
    </>
  )
  const cardClass =
    'mb-3 ml-1.5 mt-1 flex flex-col gap-2 rounded-2xl border border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] px-3.5 py-3'

  if (!href) return <div className={cardClass}>{body}</div>
  if (href.startsWith('/')) {
    return (
      <Link href={href} className={cardClass}>
        {body}
      </Link>
    )
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cardClass}>
      {body}
    </a>
  )
}

/**
 * The homepage agenda below `md` (G1): a tab per sitting day, then that day's
 * points on a timeline. Same data as `UpcomingAgenda`, which keeps the desktop.
 * Renders nothing when nothing is scheduled, for the same reason it does.
 */
export function MobileAgenda({ agenda }: { agenda: AgendaResponse | null }) {
  const days = (agenda?.days ?? []).filter(d => d.items.length > 0).slice(0, MOBILE_AGENDA_DAYS)
  const [selected, setSelected] = useState(0)
  if (days.length === 0) return null

  const day = days[Math.min(selected, days.length - 1)]
  const shown = day.items.slice(0, MOBILE_AGENDA_ITEMS)
  const hidden = day.items.length - shown.length

  return (
    <section
      aria-labelledby="ordre-du-jour-mobile"
      className="flex flex-col gap-5 border-t border-[color:var(--dp-border)] bg-gray-off dark:bg-[color:var(--dp-page-bg)] px-5 pb-8 pt-10 text-[color:var(--dp-text)] md:hidden"
    >
      <div className="flex flex-col gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[color:var(--dp-red)]">À venir</p>
        <h2 id="ordre-du-jour-mobile" className="font-newsreader text-[30px] font-medium leading-[1.1]">
          À l&apos;ordre du jour
        </h2>
        <p className="text-[15px] leading-normal text-[color:var(--dp-text-secondary)]">
          Ce que les députés examinent dans l&apos;hémicycle ces prochains jours.
        </p>
      </div>

      {/* Plain toggle buttons, not ARIA tabs: the tab pattern promises arrow-key
          navigation, and five buttons need none (PR #610 review). */}
      <div
        role="group"
        aria-label="Jour de séance"
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
      >
        {days.map((d, i) => {
          const { weekday, day: dayNumber } = dayTab(d.sitting_date)
          const on = d === day
          return (
            <button
              key={d.sitting_date}
              type="button"
              aria-pressed={on}
              aria-controls="ordre-du-jour-points"
              onClick={() => setSelected(i)}
              className={`flex h-[72px] flex-col items-center justify-center gap-0.5 rounded-2xl border ${
                on ? 'border-[color:var(--dp-text)] bg-[color:var(--dp-solid-bg)] text-[color:var(--dp-solid-text)]' : 'border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] text-[color:var(--dp-text)]'
              }`}
            >
              <span className="text-[11px] font-bold tracking-[0.08em]">{weekday}</span>
              <span className="font-serif text-2xl leading-none">{dayNumber}</span>
              <span className="text-[10px]">
                {d.items.length} {d.items.length > 1 ? 'points' : 'point'}
              </span>
            </button>
          )
        })}
      </div>

      <ol id="ordre-du-jour-points" aria-live="polite" className="flex flex-col">
        {shown.map(item => (
          <li key={item.point_uid} className="grid grid-cols-[52px_20px_minmax(0,1fr)]">
            <span className="pt-3.5 font-mono text-[13px] font-bold">{formatSittingTime(item.sitting_start) ?? ''}</span>
            <span aria-hidden="true" className="relative flex justify-center">
              <span className="absolute inset-y-0 w-0.5 bg-[#E0DED9] dark:bg-[color:var(--dp-border)]" />
              <span
                className={`relative mt-[17px] h-2.5 w-2.5 rounded-full border-2 border-gray-off dark:border-[color:var(--dp-page-bg)] ${
                  item.vote_id ? 'bg-[color:var(--dp-solid-bg)]' : 'bg-red-civic'
                }`}
              />
            </span>
            <AgendaItemCard item={item} />
          </li>
        ))}
      </ol>

      <Link
        href="/agenda"
        className="flex h-[50px] items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-[color:var(--dp-text)] text-[15px] font-medium"
      >
        {hidden > 0 ? `Et ${hidden} autre${hidden > 1 ? 's' : ''} point${hidden > 1 ? 's' : ''} · tout l'ordre du jour` : "Tout l'ordre du jour"}
        <span aria-hidden="true">→</span>
      </Link>
    </section>
  )
}
