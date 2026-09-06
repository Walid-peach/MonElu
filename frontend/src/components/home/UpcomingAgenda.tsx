import Link from 'next/link'
import type { AgendaResponse } from '@/lib/api'
import {
  HOME_TEASER_ITEMS,
  agendaHeadline,
  formatSittingDay,
  formatSittingTime,
  isSubstantive,
} from '@/lib/agenda'

/**
 * The homepage "à venir" teaser (MON-213).
 *
 * Server-rendered and non-interactive, like `HomeSummary` beneath it, so it is
 * in the HTML on every viewport with or without JavaScript.
 *
 * It renders **nothing at all** when there is nothing scheduled - the
 * Assemblée is in recess for much of the summer, and an empty shell announcing
 * an empty ordre du jour is worse than silence. The fetch failing degrades the
 * same way: the homepage is not the place to report an agenda outage.
 */
export function UpcomingAgenda({ agenda }: { agenda: AgendaResponse | null }) {
  const days = agenda?.days ?? []
  const all = days.flatMap(day => day.items.map(item => ({ day: day.sitting_date, item })))
  // Three lines and one chance to be interesting: prefer the points that say
  // something, and only fall back to the raw order when none of them do.
  const substantive = all.filter(({ item }) => isSubstantive(item))
  const entries = (substantive.length > 0 ? substantive : all).slice(0, HOME_TEASER_ITEMS)

  if (entries.length === 0) return null

  return (
    <section
      aria-labelledby="a-lordre-du-jour"
      style={{
        background: 'var(--dp-page-bg)',
        borderTop: '1px solid var(--dp-border)',
        padding: 'clamp(40px,5vw,60px) clamp(16px,5vw,56px)',
      }}
    >
      <div style={{ maxWidth: '860px', margin: '0 auto' }}>
        <p
          style={{
            fontSize: '12.5px',
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--dp-red)',
            margin: '0 0 14px',
          }}
        >
          À venir
        </p>
        <h2
          id="a-lordre-du-jour"
          style={{
            fontFamily: 'var(--font-serif), Georgia, serif',
            fontSize: 'clamp(22px,3vw,30px)',
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            color: 'var(--dp-text)',
            margin: 0,
          }}
        >
          À l&apos;ordre du jour cette semaine
        </h2>

        <ul style={{ listStyle: 'none', margin: '24px 0 0', padding: 0, display: 'grid', gap: '18px' }}>
          {entries.map(({ day, item }) => {
            const { lead } = agendaHeadline(item)
            const time = formatSittingTime(item.sitting_start)
            return (
              <li key={item.point_uid} style={{ display: 'grid', gap: '4px' }}>
                <span
                  style={{
                    fontSize: '12.5px',
                    color: 'var(--dp-text-muted)',
                  }}
                >
                  {formatSittingDay(day, { withYear: false })}
                  {time ? ` · ${time}` : ''}
                </span>
                <span
                  style={{
                    fontSize: '15.5px',
                    lineHeight: 1.5,
                    color: 'var(--dp-text-secondary)',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {lead}
                </span>
              </li>
            )
          })}
        </ul>

        <p style={{ margin: '24px 0 0', fontSize: '14.5px' }}>
          <Link href="/agenda" style={{ color: 'var(--dp-text)', fontWeight: 600 }}>
            Voir tout l&apos;ordre du jour →
          </Link>
        </p>
      </div>
    </section>
  )
}
