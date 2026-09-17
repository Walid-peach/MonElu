import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { DAILY_REVALIDATE_SECONDS, WINDOWED_REVALIDATE_SECONDS } from '@/lib/cachePolicy'
import { HEALTH_REVALIDATE_SECONDS, HEALTH_TAG, SCOPE_FAMILY_TAGS } from '@/lib/cacheTags'

const SRC = join(__dirname, '..', '..', 'src')
const APP = join(SRC, 'app')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

/**
 * Routes whose render encodes a date window rather than a snapshot of a table,
 * so the calendar - not ingestion - is what makes them stale. See
 * `WINDOWED_REVALIDATE_SECONDS`.
 */
const WINDOWED_ROUTES = ['agenda/page.tsx']

/**
 * Server routes that read the API but are deliberately not purged by
 * `/api/revalidate`, with the reason each one is exempt.
 */
const UNPURGED_ROUTES: Record<string, string> = {
  '/chat/s/[id]': 'immutable snapshot (ADR-024)',
  '/quiz/s/[id]': 'immutable snapshot (ADR-025)',
  '/verifier/v/[id]': 'immutable snapshot (ADR-022)',
  '/api/oembed': 'route handler on its own Cache-Control, no ISR entry',
}

/** `src/app/deputes/(liste)/page.tsx` -> `/deputes`; `src/app/page.tsx` -> `/`. */
function routePath(file: string): string {
  const segments = relative(APP, file)
    .split(sep)
    .slice(0, -1)
    .filter((s) => !s.startsWith('(') && !s.startsWith('@'))
  return `/${segments.join('/')}`.replace(/\/$/, '') || '/'
}

/**
 * Every path the webhook's full purge covers, read from the table it iterates
 * (`['/deputes/[id]', 'layout']`) rather than from a run of calls.
 */
function purgeCalls(): Array<{ path: string; scope: string | null }> {
  const route = readFileSync(join(APP, 'api', 'revalidate', 'route.ts'), 'utf8')
  const table = route.split('const paths:')[1]?.split('\n  ]')[0] ?? ''
  return [...table.matchAll(/\['([^']+)'(?:,\s*'(\w+)')?\]/g)].map((m) => ({
    path: m[1],
    scope: m[2] ?? null,
  }))
}

/** A 'layout' purge also covers everything nested under it. */
function isPurged(path: string, calls: ReturnType<typeof purgeCalls>): boolean {
  return calls.some(
    ({ path: p, scope }) => p === path || (scope === 'layout' && path.startsWith(`${p}/`))
  )
}

/**
 * GH #352: every server-rendered resource reads data that changes at most once
 * a day and is invalidated on demand by `/api/revalidate`, so the time-based
 * interval is only a fallback. Hourly and sub-hourly timers regenerated
 * identical pages between data releases.
 */
describe('ISR fallback policy (GH #352)', () => {
  it('uses a one-day fallback, and the site-wide health floor matches it', () => {
    expect(DAILY_REVALIDATE_SECONDS).toBe(24 * 60 * 60)
    // The root layout's health fetch caps every route (GH #354), so a shorter
    // value would silently undo every page below.
    expect(HEALTH_REVALIDATE_SECONDS).toBeGreaterThanOrEqual(DAILY_REVALIDATE_SECONDS)
    expect(WINDOWED_REVALIDATE_SECONDS).toBeLessThan(DAILY_REVALIDATE_SECONDS)
  })

  it('declares no route segment revalidate below a day outside the windowed routes', () => {
    const offenders = sourceFiles(APP).flatMap((path) => {
      const match = readFileSync(path, 'utf8').match(
        /^export const revalidate(?::\s*\w+)?\s*=\s*([\d_]+)/m
      )
      if (!match) return []
      const seconds = Number(match[1].replace(/_/g, ''))
      const file = relative(APP, path).split(sep).join('/')
      if (seconds >= DAILY_REVALIDATE_SECONDS) return []
      // A windowed route may go shorter, but not shorter than the policy.
      if (WINDOWED_ROUTES.includes(file) && seconds >= WINDOWED_REVALIDATE_SECONDS) return []
      return [`${file}: ${seconds}`]
    })
    expect(offenders).toEqual([])
  })

  it('puts every API fetch on one of the policy constants', () => {
    const api = readFileSync(join(SRC, 'lib', 'api.ts'), 'utf8')
    // Skip the `FetchOpts` type declaration, then read each value up to the
    // first comma - far enough to judge a ternary as one expression.
    const body = api.replace(/^type FetchOpts.*$/m, '')
    const values = [...body.matchAll(/\brevalidate:\s*([^,\n]+)/g)].map((m) => m[1].trim())
    expect(values.length).toBeGreaterThan(10)
    const constants = [
      'DAILY_REVALIDATE_SECONDS',
      'WINDOWED_REVALIDATE_SECONDS',
      'HEALTH_REVALIDATE_SECONDS',
    ]
    // A ternary between two constants is fine; any digit in the expression is
    // a hardcoded interval, which is the thing this bans.
    const offenders = values.filter(
      (v) => v !== 'opts.revalidate' && (/\d/.test(v) || !constants.some((c) => v.includes(c)))
    )
    expect(offenders).toEqual([])
  })

  it('has no numeric fetch-level revalidate anywhere in src', () => {
    const offenders = sourceFiles(SRC).filter((path) =>
      /\brevalidate:\s*\d/.test(readFileSync(path, 'utf8'))
    )
    expect(offenders.map((p) => relative(SRC, p))).toEqual([])
  })

  /**
   * The intervals above are only safe because ingestion purges these routes on
   * demand. Enumerated from the route tree rather than listed by hand: a new
   * route family reading the API must be purged or explicitly exempted, the
   * same shape `sitemap-coverage.test.ts` uses.
   */
  it('purges every server route that reads ingestion-refreshed data', () => {
    const calls = purgeCalls()
    expect(calls.length).toBeGreaterThan(10)

    const reading = sourceFiles(APP)
      .filter((path) => /\/(page|route)\.tsx?$/.test(path.split(sep).join('/')))
      .filter((path) => {
        const source = readFileSync(path, 'utf8')
        return !/^['"]use client['"]/m.test(source) && /\bapi\.\w/.test(source)
      })
      .map(routePath)

    const uncovered = [...new Set(reading)].filter(
      (path) => !(path in UNPURGED_ROUTES) && !isPurged(path, calls)
    )
    expect(uncovered).toEqual([])
  })

  /**
   * GH #353: the timers above are the fallback and `/api/revalidate` is the
   * refresh mechanism, but since that purge became *targeted* it reaches a
   * cache entry only through the tags its fetches declared. An untagged fetch
   * is therefore invisible to ingestion: it serves whatever it cached until the
   * one-day fallback expires, with nothing reporting it.
   */
  it('tags every API fetch that reads ingestion-refreshed data', () => {
    // The `api` object only - not the two `apiFetch` definitions above it.
    const api = readFileSync(join(SRC, 'lib', 'api.ts'), 'utf8').split('export const api = {')[1]
    // Immutable snapshots (ADR-022, ADR-024, ADR-025) are written once and are
    // precisely the routes ingestion must never purge, so they carry no tag.
    const UNTAGGED_PATHS = ['/verify/', '/search/share/', '/quiz/share/']

    // Each fetch call, from its opening paren to the start of the next one.
    const starts = [...api.matchAll(/\bapiFetch(?:Optional)?</g)].map((m) => m.index ?? 0)
    expect(starts.length).toBeGreaterThan(10)
    const offenders = starts
      .map((start, i) => api.slice(start, starts[i + 1] ?? api.length))
      .filter((call) => !UNTAGGED_PATHS.some((path) => call.includes(path)))
      .filter((call) => !/tags:\s*\[/.test(call))
      .map((call) => call.split('\n')[0].trim())
    expect(offenders).toEqual([])
  })

  /**
   * The root layout renders `FreshnessBadge`, and a route's cache entry depends
   * on the union of the tags of every fetch its render touched - layouts
   * included. So `health` invalidates the entire site, and it may only ride on
   * the one family whose data actually moves it (`MAX(voted_at)`).
   */
  it('keeps the health tag on the votes scope alone', () => {
    const owners = Object.entries(SCOPE_FAMILY_TAGS)
      .filter(([, tags]) => tags.includes(HEALTH_TAG))
      .map(([family]) => family)
    expect(owners).toEqual(['votes'])
  })

  it('keeps the exemption list honest', () => {
    const calls = purgeCalls()
    // An exempt route that is in fact purged means the list is stale.
    const stale = Object.keys(UNPURGED_ROUTES).filter((path) => isPurged(path, calls))
    expect(stale).toEqual([])
  })
})
