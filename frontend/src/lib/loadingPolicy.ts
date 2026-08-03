'use client'

import { useEffect, useState } from 'react'

/**
 * MON-207/MON-214: centralized loading-treatment thresholds. Pages must read
 * these rather than hardcoding their own delay values, so the policy stays
 * consistent app-wide and can be tuned in one place.
 */
export const LOADING_NO_INDICATOR_MS = 200
export const LOADING_INLINE_MS = 1500

export type LoadingPhase = 'none' | 'inline' | 'content'

/**
 * Maps a raw `isLoading` boolean to a loading-treatment phase per the
 * MON-207 timing policy:
 * - `none`: not loading, or loading for less than LOADING_NO_INDICATOR_MS — show nothing.
 * - `inline`: loading past LOADING_NO_INDICATOR_MS but under LOADING_INLINE_MS — subtle inline activity.
 * - `content`: loading past LOADING_INLINE_MS — a layout-matched skeleton or a contextual status.
 */
export function useLoadingPhase(isLoading: boolean): LoadingPhase {
  const [phase, setPhase] = useState<LoadingPhase>('none')
  // React's documented "adjusting state when a prop changes" pattern: a
  // render-phase setState conditioned on a previous-value mismatch, not an
  // effect. This resets the phase the instant a new loading session starts
  // (or a fast one ends) without the cascading-render issue effect-body
  // setState calls have.
  const [prevIsLoading, setPrevIsLoading] = useState(isLoading)
  if (isLoading !== prevIsLoading) {
    setPrevIsLoading(isLoading)
    setPhase('none')
  }

  useEffect(() => {
    if (!isLoading) return

    const inlineTimer = setTimeout(() => setPhase('inline'), LOADING_NO_INDICATOR_MS)
    const contentTimer = setTimeout(() => setPhase('content'), LOADING_INLINE_MS)

    return () => {
      clearTimeout(inlineTimer)
      clearTimeout(contentTimer)
    }
  }, [isLoading])

  return phase
}
