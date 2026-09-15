/**
 * Next.js cache tags shared between the fetches that produce a cache entry and
 * the `/api/revalidate` route that invalidates it after ingestion.
 */
import { DAILY_REVALIDATE_SECONDS } from './cachePolicy'

/**
 * Tags the `/health` fetch behind `FreshnessBadge` (GH #354).
 *
 * The badge renders from the root layout, and Next.js takes the lowest
 * `revalidate` across a route and all of its layouts - so the badge's former
 * 300 s fetch made every otherwise-static route regenerate every five minutes,
 * which is what pushed the project past the Vercel Hobby ISR write allowance.
 *
 * The badge only needs to change when ingestion publishes new data, and
 * ingestion already POSTs `/api/revalidate` when it does, so the fetch is
 * invalidated on demand by tag. `HEALTH_REVALIDATE_SECONDS` is only the bounded
 * fallback for a run whose revalidate call failed or never fired. Because it is
 * the site-wide floor, it sits on the same daily interval as the data it
 * reports on (GH #352, `@/lib/cachePolicy`): a shorter value would drag every
 * daily page back under it, and a day is still well inside the four-day window
 * after which the badge's stale warning appears.
 */
export const HEALTH_TAG = 'health'
export const HEALTH_REVALIDATE_SECONDS = DAILY_REVALIDATE_SECONDS
