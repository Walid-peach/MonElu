import type { Metadata } from 'next'
import Link from 'next/link'
import { api, type AgendaDay, type AgendaItem, type AgendaResponse } from '@/lib/api'
import {
  LOOKAHEAD_DAYS,
  addDays,
  agendaHeadline,
  agendaItemHref,
  formatSittingDay,
  formatSittingTime,
  parisToday,
  showsPointType,
} from '@/lib/agenda'
import { themeColors } from '@/lib/utils'
import { JsonLd } from '@/components/JsonLd'
import { SITE_URL, buildBreadcrumbJsonLd } from '@/lib/seo'
import { canonicalUrl } from '@/lib/site'

// The agenda table only changes when `ingest_agenda.py` runs, and that run
// POSTs /api/revalidate, which invalidates this path. An hour is therefore the
// fallback for a run whose revalidate call never fired - a shorter window would
// only re-create the ISR write volume GH #354 cut, for no extra freshness.
export const revalidate = 3600

const NAVY = 'var(--dp-text)'
const CREAM = 'var(--dp-page-bg)'
const LINE = 'var(--dp-border)'
const RED = 'var(--dp-red)'

const TITLE = "À l'ordre du jour de l'Assemblée nationale - MonÉlu"
const DESCRIPTION =
  "Ce que l'Assemblée nationale doit examiner en séance publique cette semaine : " +
  'chaque point de l’ordre du jour en français clair, avec le lien vers le dossier ' +
  'officiel et vers le scrutin dès qu’il a eu lieu.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: canonicalUrl('/agenda') },
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

/**
 * The current week, plus - only when that week is empty - a lookahead used to
 * name the next sitting day.
 *
 * The Assemblée is in recess for much of the summer, so an empty week is a
 * normal state, not a failure: the second call only happens then, and its
 * failure degrades the empty state rather than the page.
 */
async function loadAgenda(): Promise<{ week: AgendaResponse | null; nextDay: string | null }> {
  const week = await api.agenda.get().catch(() => null)
  if (week && week.days.length > 0) return { week, nextDay: null }

  const today = parisToday()
  const ahead = await api.agenda
    .get({ from: today, to: addDays(today, LOOKAHEAD_DAYS) })
    .catch(() => null)
  return { week, nextDay: ahead?.days[0]?.sitting_date ?? null }
}

export default async function AgendaPage() {
  const { week, nextDay } = await loadAgenda()

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'Accueil', url: SITE_URL },
    { name: 'Ordre du jour', url: `${SITE_URL}/agenda` },
  ])

  return (
    <div style={{ background: CREAM, minHeight: '100vh' }}>
      <JsonLd data={breadcrumb} />

      <div
        className="px-5 sm:px-14 pt-8 sm:pt-[50px] pb-8 sm:pb-10"
        style={{
          background: `linear-gradient(180deg,var(--dp-card-bg) 0%,${CREAM} 100%)`,
          borderBottom: '1px solid var(--dp-border-subtle)',
        }}
      >
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: RED,
              marginBottom: 16,
            }}
          >
            Ordre du jour
          </div>
          <h1
            className="font-newsreader text-[clamp(30px,4vw,48px)]"
            style={{
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: '-0.015em',
              color: NAVY,
              margin: 0,
              maxWidth: 760,
            }}
          >
            Ce que l&apos;Assemblée examine cette semaine
          </h1>
          <p
            style={{
              margin: '16px 0 0',
              fontSize: 17,
              lineHeight: 1.6,
              color: 'var(--dp-text-secondary)',
              maxWidth: 620,
            }}
          >
            Les points inscrits en séance publique, jour par jour. L&apos;ordre du jour est
            <strong> prévisionnel</strong> : il est réécrit en continu et un point peut être
            reporté ou retiré. Le compte rendu officiel fait foi.
          </p>
        </div>
      </div>

      <div className="px-5 sm:px-14 pt-10 pb-14 sm:pb-[72px]">
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          {week && week.days.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
              {week.days.map(day => (
                <DaySection key={day.sitting_date} day={day} />
              ))}
            </div>
          ) : (
            <EmptyState nextDay={nextDay} unavailable={week === null} />
          )}

          <div style={{ marginTop: 48 }}>
            <Link href="/votes" style={{ fontSize: 14, color: NAVY, textDecoration: 'underline' }}>
              ← Les scrutins déjà tenus
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function DaySection({ day }: { day: AgendaDay }) {
  return (
    <section>
      <h2
        className="font-newsreader text-section-sm"
        style={{
          fontWeight: 600,
          color: NAVY,
          margin: '0 0 18px',
          letterSpacing: '-0.01em',
        }}
      >
        {formatSittingDay(day.sitting_date)}
      </h2>
      <div
        style={{
          background: 'var(--dp-card-bg)',
          border: `1px solid ${LINE}`,
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 1px 3px var(--dp-shadow-sm)',
        }}
      >
        {day.items.map((item, i) => (
          <Row key={item.point_uid} item={item} last={i === day.items.length - 1} />
        ))}
      </div>
    </section>
  )
}

function Row({ item, last }: { item: AgendaItem; last: boolean }) {
  const { lead, official } = agendaHeadline(item)
  const href = agendaItemHref(item)
  const time = formatSittingTime(item.sitting_start)
  const external = !item.vote_id

  const body = (
    <>
      {/* Wraps rather than sitting on one line: at 375px a `Discussion
          générale` badge next to a time would otherwise push the row wide
          (the MON-144 failure mode). */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 10,
          marginBottom: 8,
          fontSize: 12.5,
          color: 'var(--dp-text-muted)',
        }}
      >
        {time && <span className="font-mono">{time}</span>}
        {showsPointType(item.point_type, lead) && <span>{item.point_type}</span>}
        {item.theme && <ThemeChip theme={item.theme} />}
        {item.result && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 999,
              color: item.result === 'adopté' ? 'var(--dp-green)' : RED,
              background:
                item.result === 'adopté' ? 'var(--dp-badge-pos-bg)' : 'var(--dp-badge-neg-bg)',
            }}
          >
            {item.result === 'adopté' ? 'Adopté' : 'Rejeté'}
          </span>
        )}
      </div>

      <div
        style={{
          fontWeight: 600,
          fontSize: 15.5,
          lineHeight: 1.45,
          color: NAVY,
          overflowWrap: 'anywhere',
        }}
      >
        {lead}
      </div>

      {official && (
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.5,
            color: 'var(--dp-text-muted)',
            marginTop: 6,
            overflowWrap: 'anywhere',
          }}
        >
          {official}
        </div>
      )}

      {href && (
        <div style={{ fontSize: 13, fontWeight: 600, color: RED, marginTop: 10 }}>
          {item.vote_id ? 'Voir le scrutin →' : 'Dossier officiel ↗'}
        </div>
      )}
    </>
  )

  const style = {
    display: 'block',
    padding: '18px 20px',
    textDecoration: 'none',
    borderBottom: last ? 'none' : '1px solid var(--dp-track-bg)',
  } as const

  if (!href) return <div style={style}>{body}</div>

  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" style={style}>
      {body}
    </a>
  ) : (
    <Link href={href} style={style}>
      {body}
    </Link>
  )
}

function ThemeChip({ theme }: { theme: string }) {
  const c = themeColors(theme)
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color: c.c,
        background: c.bg,
      }}
    >
      {theme}
    </span>
  )
}

function EmptyState({ nextDay, unavailable }: { nextDay: string | null; unavailable: boolean }) {
  return (
    <div
      style={{
        background: 'var(--dp-card-bg)',
        border: `1px solid ${LINE}`,
        borderRadius: 12,
        padding: '32px 24px',
        maxWidth: 640,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 17, color: NAVY }}>
        {unavailable
          ? "L'ordre du jour n'a pas pu être chargé"
          : 'Aucune séance publique inscrite cette semaine'}
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 15, lineHeight: 1.6, color: 'var(--dp-text-secondary)' }}>
        {unavailable ? (
          "Le service est momentanément indisponible. Les scrutins déjà tenus restent consultables."
        ) : nextDay ? (
          <>
            Prochaine séance annoncée :{' '}
            <strong style={{ color: NAVY }}>
              {formatSittingDay(nextDay)}
            </strong>
            .
          </>
        ) : (
          <>
            Aucune séance n&apos;est annoncée dans les {LOOKAHEAD_DAYS} prochains jours -
            l&apos;Assemblée est probablement en intersession.
          </>
        )}
      </p>
    </div>
  )
}
