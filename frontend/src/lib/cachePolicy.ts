/**
 * ISR fallback policy (GH #352).
 *
 * Every server-rendered page reads data that only changes when something
 * publishes it:
 *
 * - Legislative data (deputies, votes, positions, marts, the agenda) moves
 *   when `ingest_prod.yml` runs - once per weekday - and `summarize_backfill.yml`
 *   adds vote summaries once per day. Both POST `/api/revalidate` after
 *   publishing, which invalidates every route family that reads this data.
 * - The quiz question set is a repo file on the API (ADR-025): it changes by
 *   deploy only.
 * - Chat, verification and quiz share snapshots are immutable once written
 *   (ADR-022, ADR-024, ADR-025).
 *
 * So a time-based `revalidate` is never the refresh mechanism here - it is the
 * bounded fallback for a run whose revalidate call failed or never fired. A
 * timer shorter than the source cadence only regenerates identical pages and
 * spends Vercel ISR writes (GH #354 was that cost at site scale). One day
 * matches the cadence, and still recovers on its own if the webhook breaks.
 *
 * Why immutable snapshots also sit at one day rather than `false`: the root
 * layout renders `FreshnessBadge`, whose `/health` fetch is on this same
 * interval, and Next.js takes the lowest `revalidate` across a route and all
 * of its layouts. No page can cache longer than the badge without moving that
 * fetch out of the layout. Snapshot OG image routes do not render the layout,
 * but they stay at one day for the second reason, which covers pages too: it
 * keeps a takedown lever for the unmoderated share corpus (ADR-036) - a
 * deleted row stops being served within a day, without a redeploy.
 *
 * Route segment `export const revalidate` values must be literals Next.js can
 * read statically, so pages write `86400` and point here;
 * `__tests__/lib/cachePolicy.test.ts` keeps both halves at or above this floor.
 */
export const DAILY_REVALIDATE_SECONDS = 24 * 60 * 60
