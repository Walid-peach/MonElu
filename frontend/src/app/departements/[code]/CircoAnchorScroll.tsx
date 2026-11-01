'use client'
import { useEffect } from 'react'

/**
 * Makes `/departements/<code>#circo-N` land on the right card on a phone.
 *
 * The `circo-N` ids live on the desktop cards, which are `display: none` below
 * `md`, so the browser's own hash scroll has nothing to go to there. When that
 * target is hidden, this scrolls to the phone card carrying the same value in
 * `data-circo-anchor` instead, on load and on every later hash change.
 */
export function CircoAnchorScroll() {
  useEffect(() => {
    function scrollToHash() {
      const hash = decodeURIComponent(window.location.hash.slice(1))
      if (!/^circo-\d+$/.test(hash)) return
      const target = document.getElementById(hash)
      if (target && target.getClientRects().length > 0) return
      const fallback = [...document.querySelectorAll<HTMLElement>(`[data-circo-anchor="${hash}"]`)].find(
        el => el.getClientRects().length > 0,
      )
      fallback?.scrollIntoView({ block: 'start' })
    }
    scrollToHash()
    window.addEventListener('hashchange', scrollToHash)
    return () => window.removeEventListener('hashchange', scrollToHash)
  }, [])
  return null
}
