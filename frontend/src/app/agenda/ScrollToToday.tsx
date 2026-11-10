'use client'
import { useEffect } from 'react'
import { AGENDA_DAY_ATTR, landingDay, parisToday } from '@/lib/agenda'

/**
 * Scrolls to a day's section, whichever of the two layouts is on screen (the
 * other is `display: none`, so it has no box). Instant, never animated.
 */
export function scrollToAgendaDay(date: string): void {
  const sections = document.querySelectorAll<HTMLElement>(`[${AGENDA_DAY_ATTR}="${date}"]`)
  const visible = Array.from(sections).find(el => el.getClientRects().length > 0)
  visible?.scrollIntoView({ block: 'start', behavior: 'instant' })
}

/**
 * Opens `/agenda` on today, or the next sitting day (#679). A scroll position
 * only: every day stays on the page, and Monday is one scroll up.
 *
 * It runs in the browser because the page is cached for the whole day and the
 * server cannot know the visitor's today. It leaves the page alone when the URL
 * names a section or the browser has already restored a scroll position.
 */
export function ScrollToToday({ days }: { days: ReadonlyArray<{ sitting_date: string }> }) {
  useEffect(() => {
    if (window.location.hash || window.scrollY > 0) return
    const day = landingDay(days, parisToday())
    if (!day) return
    scrollToAgendaDay(day)
    // Web fonts change the height of what sits above the day; settle once
    // they are in, unless the visitor has already scrolled on their own.
    const landedAt = window.scrollY
    void document.fonts?.ready.then(() => {
      if (window.scrollY === landedAt) scrollToAgendaDay(day)
    })
  }, [days])
  return null
}
