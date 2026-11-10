'use client'
import type { ReactNode } from 'react'
import Link from 'next/link'
import type { AgendaDay } from '@/lib/api'
import { AGENDA_DAY_ATTR, formatSittingDay, formatSittingTime } from '@/lib/agenda'
import { AgendaItemCard, dayTab } from '@/components/home/MobileAgenda'
import { PhonePageHeader } from '@/components/phone/kit'
import { scrollToAgendaDay } from './ScrollToToday'

/**
 * The agenda page below `md` (canvas "Ordre du jour"): the homepage's day
 * buttons and timeline, with every point of every day of the week rather than
 * the first few, in one list `ScrollToToday` opens at today (#679). The empty and unavailable states come from `page.tsx`.
 */
export function AgendaMobile({ days, empty }: { days: AgendaDay[]; empty: ReactNode }) {
  const withItems = days.filter(d => d.items.length > 0)

  return (
    <div className="bg-[color:var(--dp-page-bg)] pb-8 md:hidden">
      <PhonePageHeader
        eyebrow="Ordre du jour"
        title="Cette semaine dans l'hémicycle"
        lead="Prévisionnel : un point peut être reporté ou retiré. Le compte rendu officiel fait foi."
      />

      {withItems.length > 0 ? (
        <div className="flex flex-col gap-5 px-5">
          {/* Jump buttons, as on the homepage: they scroll to a day of the
              week-long list below, they never hide the others (#679). */}
          <div
            role="group"
            aria-label="Aller à un jour de séance"
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${Math.min(withItems.length, 5)}, minmax(0, 1fr))` }}
          >
            {withItems.map(d => {
              const { weekday, day: dayNumber } = dayTab(d.sitting_date)
              return (
                <button
                  key={d.sitting_date}
                  type="button"
                  onClick={() => scrollToAgendaDay(d.sitting_date)}
                  className="flex h-[72px] flex-col items-center justify-center gap-0.5 rounded-2xl border border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] text-[color:var(--dp-text)]"
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

          {withItems.map(day => (
            <section
              key={day.sitting_date}
              {...{ [AGENDA_DAY_ATTR]: day.sitting_date }}
              className="flex scroll-mt-2 flex-col gap-5"
            >
              <h2 className="font-newsreader text-[22px] font-medium">{formatSittingDay(day.sitting_date)}</h2>

              <ol className="flex flex-col">
                {day.items.map(item => (
                  <li key={item.point_uid} className="grid grid-cols-[52px_20px_minmax(0,1fr)]">
                    <span className="pt-3.5 font-mono text-[13px] font-bold">{formatSittingTime(item.sitting_start) ?? ''}</span>
                    <span aria-hidden="true" className="relative flex justify-center">
                      <span className="absolute inset-y-0 w-0.5 bg-[color:var(--dp-border)]" />
                      <span
                        className={`relative mt-[17px] h-2.5 w-2.5 rounded-full border-2 border-[color:var(--dp-page-bg)] ${
                          item.vote_id ? 'bg-[color:var(--dp-solid-bg)]' : 'bg-red-civic'
                        }`}
                      />
                    </span>
                    <AgendaItemCard item={item} />
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      ) : (
        <div className="px-4">{empty}</div>
      )}

      <div className="px-5 pt-6">
        <Link href="/votes" className="text-sm font-semibold text-[color:var(--dp-text)] underline underline-offset-2">
          ← Les scrutins déjà tenus
        </Link>
      </div>
    </div>
  )
}
