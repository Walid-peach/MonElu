/**
 * Next.js cache tags shared between the fetches that produce a cache entry and
 * the `/api/revalidate` route that invalidates it after ingestion (GH #353).
 *
 * ## Why tags rather than paths
 *
 * `/api/revalidate` used to purge every route family by path on every call, so
 * a weekday run that ingested nothing, and a summary backfill that rewrote one
 * sentence on one vote, both cost the same as a full publication: every
 * deputy, vote, group, department and theme page regenerated on the next
 * crawl. That fan-out is the runtime half of the ISR write volume GH #352 and
 * GH #354 attacked from the timer side (460 903 write units in the Aug 5 -
 * Sep 4 window against a Hobby allowance of 200 000).
 *
 * A tag names *what data* a cache entry read, so ingestion can invalidate only
 * what it actually changed. Next.js invalidates both the data-cache entry and
 * every rendered route that consumed it, so a tag on a fetch in `@/lib/api`
 * reaches the pages built from it without any per-route bookkeeping.
 *
 * ## The rule that makes this work
 *
 * A route's cache entry depends on the union of the tags of every fetch its
 * render touched, **including the fetches in the root layout**. That is why
 * `HEALTH_TAG` is not purged unconditionally: `FreshnessBadge` renders from the
 * root layout, so invalidating the health tag invalidates every page on the
 * site at once, exactly the fan-out this file exists to remove. `/health`
 * reports `last_ingestion` as `MAX(voted_at)` (`api/main.py`), which moves only
 * when a new scrutin lands, so the tag belongs to the `votes` scope and to
 * nothing else. Do not add `HEALTH_TAG` to any other scope, and do not add a
 * second fetch to the root layout without giving it the same treatment.
 *
 * ## Deliberate gap: vote summaries on deputy pages
 *
 * `/deputes/[id]` renders each recent vote's `summary_plain` through
 * `VoteTimelineItem`, but `deputies.votes()` is **not** tagged
 * `VOTE_SUMMARIES_TAG`. Tagging it would mean one retried summary purges all
 * 577 deputy pages, which is the cost this change exists to remove. The tail it
 * trades away is small: `run_ingestion_prod.py` generates summaries in the same
 * run that ingests the vote, so the deputy page is already being purged by
 * `POSITIONS_TAG` that day. Only a summary that failed and is retried later by
 * `summarize_backfill.yml` shows up late on a deputy timeline, and it corrects
 * itself within the one-day fallback in `@/lib/cachePolicy`. The vote's own
 * page, the vote lists and the theme pages all carry the tag and update
 * immediately.
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

/** The deputy roster and profile fields: identity, party, department, photo, mandate. */
export const DEPUTIES_TAG = 'deputies'

/** The scrutin corpus: rows, titles, dates, tallies, results. */
export const VOTES_TAG = 'votes'

/** `summary_plain` / `theme`, written by the summary generators, not by ingestion. */
export const VOTE_SUMMARIES_TAG = 'vote-summaries'

/** Per-deputy positions: vote timelines, dissident and diverging votes, split votes. */
export const POSITIONS_TAG = 'positions'

/** Everything served out of the dbt marts: scorecards, alignment, averages. */
export const MARTS_TAG = 'marts'

/** Séance publique agenda items (ADR-030). */
export const AGENDA_TAG = 'agenda'

/** One deputy's own data, so a single corrected profile purges a single page. */
export const deputyTag = (deputyId: string) => `deputy:${deputyId}`

/** One scrutin's own record, so a retried summary purges a single vote page. */
export const voteTag = (voteId: string) => `vote:${voteId}`

/**
 * The scope vocabulary `/api/revalidate` accepts, and the tags each name maps
 * to. Ingestion speaks in data families ('votes changed') rather than in tags,
 * so the workflow payload stays readable in a job summary and the mapping
 * lives in one place on the frontend side.
 */
export const SCOPE_FAMILY_TAGS: Record<string, readonly string[]> = {
  // HEALTH_TAG rides here and nowhere else - see the file header.
  votes: [VOTES_TAG, HEALTH_TAG],
  summaries: [VOTE_SUMMARIES_TAG],
  deputies: [DEPUTIES_TAG],
  positions: [POSITIONS_TAG],
  marts: [MARTS_TAG],
  agenda: [AGENDA_TAG],
}

export type RevalidateScope = {
  /** Every family name in `SCOPE_FAMILY_TAGS` that this run changed. */
  families?: string[]
  /** Individual scrutins that changed, when few enough to name (see the script-side cap). */
  votes?: string[]
  /** Individual deputies that changed, when few enough to name. */
  deputies?: string[]
}

/** Every tag a full, conservative purge invalidates. */
export const ALL_FAMILY_TAGS: readonly string[] = [
  ...new Set(Object.values(SCOPE_FAMILY_TAGS).flat()),
]

/**
 * Resolve a scope payload to the tags to invalidate. Unknown family names are
 * dropped rather than failing the call: a newer ingestion run must never be
 * able to make the purge 401/400 its way into a day of stale pages, and the
 * caller can see what landed in the response body.
 */
export function tagsForScope(scope: RevalidateScope): string[] {
  const tags = new Set<string>()
  for (const family of scope.families ?? [])
    for (const tag of SCOPE_FAMILY_TAGS[family] ?? []) tags.add(tag)
  for (const id of scope.votes ?? []) tags.add(voteTag(id))
  for (const id of scope.deputies ?? []) tags.add(deputyTag(id))
  return [...tags]
}
