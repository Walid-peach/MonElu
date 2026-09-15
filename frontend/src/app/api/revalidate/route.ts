import { revalidatePath, revalidateTag } from 'next/cache'
import { timingSafeEqual } from 'crypto'
import { NextRequest } from 'next/server'

import { HEALTH_TAG } from '@/lib/cacheTags'

function secretsMatch(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
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

  // Every route family reading ingestion-refreshed data (deputy presence/dissidence,
  // party rosters, vote lists) needs a line here - `/mon-depute` is exempt because it's
  // a client component that fetches the API directly, with no ISR cache to invalidate.
  revalidatePath('/')
  revalidatePath('/votes')
  // Refreshed by `ingest_agenda.py` in the same nightly run (MON-210, MON-213).
  revalidatePath('/agenda')
  revalidatePath('/deputes')
  // Force-dynamic, but its scorecards fetch sits in the data cache for a day.
  revalidatePath('/deputes/tableau')
  // 'layout' rather than 'page': it also covers what nests under the detail
  // route - `/deputes/[id]/dossier` and the per-entity OG images (GH #352).
  revalidatePath('/deputes/[id]', 'layout')
  revalidatePath('/votes/[id]', 'layout')
  // Markdown twins (MON-271) and the vote embed read the same data. 'layout'
  // is mandatory on the twins, not stylistic: a route handler's page id ends
  // in `/route`, so a 'page'-scoped tag matches nothing and silently no-ops.
  // The argument is the internal app-router path, not the public
  // `/deputes/{id}.md` URL the rewrite exposes - tags come from the route
  // definition, not the request URL.
  revalidatePath('/md/deputes/[id]', 'layout')
  revalidatePath('/md/votes/[id]', 'layout')
  revalidatePath('/embed/votes/[id]', 'layout')
  // Root OG card prints live deputy/vote counts from /health.
  revalidatePath('/opengraph-image', 'layout')
  // 'layout' throughout on dynamic families: a page-scoped tag covers only
  // `<path>/page`, so a nested route or an OG image added later would fall
  // out of coverage silently (GH #352).
  revalidatePath('/departements/[code]', 'layout')
  revalidatePath('/groupes/[slug]', 'layout')
  revalidatePath('/themes/[slug]', 'layout')
  revalidatePath('/sitemap.xml')

  // The freshness badge in the root layout (GH #354). Its `/health` fetch is on a
  // one-day fallback (GH #352) so it does not drag every static route into a short ISR
  // interval, which makes this call the thing that normally refreshes the badge.
  revalidateTag(HEALTH_TAG)

  return Response.json({ revalidated: true, at: new Date().toISOString() })
}
