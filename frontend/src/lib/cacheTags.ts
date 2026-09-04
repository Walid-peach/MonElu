/**
 * Next.js cache tags shared between the fetches that produce a cache entry and
 * the `/api/revalidate` route that invalidates it after ingestion.
 */

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
 * fallback for a run whose revalidate call failed or never fired - long enough
 * that it cannot recreate the write volume, short enough that the four-day
 * stale warning still appears well before the badge itself goes unrefreshed.
 */
export const HEALTH_TAG = 'health'
export const HEALTH_REVALIDATE_SECONDS = 6 * 60 * 60
