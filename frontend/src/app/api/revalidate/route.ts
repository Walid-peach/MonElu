import { revalidatePath, revalidateTag } from 'next/cache'
import { timingSafeEqual } from 'crypto'
import { NextRequest } from 'next/server'

import {
  ALL_FAMILY_TAGS,
  RevalidateScope,
  tagsForScope,
} from '@/lib/cacheTags'

function secretsMatch(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

/**
 * The conservative recovery path (GH #353): purge every route family by path
 * and every family tag, exactly as this endpoint did before scopes existed.
 *
 * It stays the default for a call with no body, so a manual `curl`, an older
 * workflow revision, or an unexpected upstream correction all still publish
 * everything. A caller must opt *into* a narrower purge; nothing narrows it by
 * accident.
 *
 * Every route family reading ingestion-refreshed data (deputy presence/dissidence,
 * party rosters, vote lists) needs a line here - `/mon-depute` is exempt because it's
 * a client component that fetches the API directly, with no ISR cache to invalidate.
 */
function purgeEverything(): string[] {
  // Kept as data rather than as a run of calls so the response body can report
  // exactly what was purged, and so `__tests__/lib/cachePolicy.test.ts` can
  // enumerate the coverage from the source.
  const paths: Array<[string] | [string, 'layout']> = [
    ['/'],
    ['/votes'],
    // Refreshed by `ingest_agenda.py` in the same nightly run (MON-210, MON-213).
    ['/agenda'],
    ['/deputes'],
    // Force-dynamic, but its scorecards fetch sits in the data cache for a day.
    ['/deputes/tableau'],
    // 'layout' rather than 'page': it also covers what nests under the detail
    // route - `/deputes/[id]/dossier` and the per-entity OG images (GH #352).
    ['/deputes/[id]', 'layout'],
    ['/votes/[id]', 'layout'],
    // Markdown twins (MON-271) and the vote embed read the same data. 'layout'
    // is mandatory on the twins, not stylistic: a route handler's page id ends
    // in `/route`, so a 'page'-scoped tag matches nothing and silently no-ops.
    // The argument is the internal app-router path, not the public
    // `/deputes/{id}.md` URL the rewrite exposes - tags come from the route
    // definition, not the request URL.
    ['/md/deputes/[id]', 'layout'],
    ['/md/votes/[id]', 'layout'],
    ['/embed/votes/[id]', 'layout'],
    // Root OG card prints live deputy/vote counts from /health.
    ['/opengraph-image', 'layout'],
    // 'layout' throughout on dynamic families: a page-scoped tag covers only
    // `<path>/page`, so a nested route or an OG image added later would fall
    // out of coverage silently (GH #352).
    ['/departements/[code]', 'layout'],
    ['/groupes/[slug]', 'layout'],
    ['/themes/[slug]', 'layout'],
    ['/sitemap.xml'],
  ]
  for (const [path, scope] of paths) {
    if (scope) revalidatePath(path, scope)
    else revalidatePath(path)
  }
  return paths.map(([path]) => path)
}

/**
 * Read the optional scope payload.
 *
 * A malformed or absent body is not an error: it falls back to the full purge.
 * Failing the request instead would turn a payload bug into a silent day of
 * stale pages, which is the failure GH #352 made fatal in `ingest_prod.yml`.
 */
async function readScope(req: NextRequest): Promise<RevalidateScope | null> {
  try {
    const body = await req.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null
    const scope = body as Record<string, unknown>
    const strings = (value: unknown): string[] | undefined =>
      Array.isArray(value)
        ? value.filter((v): v is string => typeof v === 'string')
        : undefined
    // `families` is what makes a payload a scope. Without it there is nothing
    // to narrow to, so an unrecognised body still gets the full purge.
    if (!Array.isArray(scope.families)) return null
    return {
      families: strings(scope.families),
      votes: strings(scope.votes),
      deputies: strings(scope.deputies),
    }
  } catch {
    return null
  }
}

export async function GET() {
  return new Response('Method Not Allowed', { status: 405 })
}

export async function POST(req: NextRequest) {
  const provided = req.headers.get('x-revalidate-secret') ?? ''
  const expected = process.env.REVALIDATE_SECRET ?? ''
  if (!expected || !secretsMatch(provided, expected))
    return new Response('Unauthorized', { status: 401 })

  const scope = await readScope(req)

  // Targeted: invalidate only the tags the caller's change manifest names.
  // An empty `families` with no entity ids is a no-op run (nothing was
  // ingested), and purges nothing at all - that is the point of the scope.
  if (scope) {
    const tags = tagsForScope(scope)
    for (const tag of tags) revalidateTag(tag)
    return Response.json({
      revalidated: true,
      mode: 'targeted',
      tags,
      paths: [],
      at: new Date().toISOString(),
    })
  }

  const paths = purgeEverything()
  for (const tag of ALL_FAMILY_TAGS) revalidateTag(tag)
  return Response.json({
    revalidated: true,
    mode: 'full',
    tags: [...ALL_FAMILY_TAGS],
    paths,
    at: new Date().toISOString(),
  })
}
