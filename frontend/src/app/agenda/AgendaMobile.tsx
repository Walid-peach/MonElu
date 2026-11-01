'use client'
import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import type { AgendaDay } from '@/lib/api'
import { formatSittingDay, formatSittingTime } from '@/lib/agenda'
import { AgendaItemCard, dayTab } from '@/components/home/MobileAgenda'
import { PhonePageHeader } from '@/components/phone/kit'

/**
 * The agenda page below `md` (canvas "Ordre du jour"): the homepage's day
 * buttons and timeline, with every point of the chosen day rather than the
 * first few. The empty and unavailable states come from `page.tsx`.
 */
export function AgendaMobile({ days, empty }: { days: AgendaDay[]; empty: ReactNode }) {
  const withItems = days.filter(d => d.items.length > 0)
  const [selected, setSelected] = useState(0)
  const day = withItems[Math.min(selected, withItems.length - 1)]

  return (
    <div className="bg-[color:var(--dp-page-bg)] pb-8 md:hidden">
      <PhonePageHeader
        eyebrow="Ordre du jour"
        title="Cette semaine dans l'hémicycle"
        lead="Prévisionnel : un point peut être reporté ou retiré. Le compte rendu officiel fait foi."
      />

      {day ? (
        <div className="flex flex-col gap-5 px-5">
          {/* Plain toggle buttons, as on the homepage (PR #610 review). */}
          <div
            role="group"
            aria-label="Jour de séance"
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${Math.min(withItems.length, 5)}, minmax(0, 1fr))` }}
          >
            {withItems.map((d, i) => {
              const { weekday, day: dayNumber } = dayTab(d.sitting_date)
              const on = d === day
              return (
                <button
                  key={d.sitting_date}
                  type="button"
                  aria-pressed={on}
                  aria-controls="agenda-points"
                  onClick={() => setSelected(i)}
                  className={`flex h-[72px] flex-col items-center justify-center gap-0.5 rounded-2xl border ${
                    on
                      ? 'border-[color:var(--dp-text)] bg-[color:var(--dp-solid-bg)] text-[color:var(--dp-solid-text)]'
                      : 'border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] text-[color:var(--dp-text)]'
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

          <h2 className="font-newsreader text-[22px] font-medium">{formatSittingDay(day.sitting_date)}</h2>

          <ol id="agenda-points" aria-live="polite" className="flex flex-col">
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
