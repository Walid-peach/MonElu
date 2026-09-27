import { buildAppleAppSiteAssociation } from '@/lib/appleAppSiteAssociation'

/**
 * `/.well-known/apple-app-site-association` (ADR-041, #439). Apple fetches it
 * through its own CDN when the app is installed; it must be served as JSON,
 * with no redirect and no file extension.
 *
 * 404 until `APPLE_TEAM_ID` and `IOS_BUNDLE_ID` are both set on Vercel, so the
 * live site is unchanged before the app exists. Static: the variables are read
 * at build time, and Vercel only rebuilds when `frontend/` changes (#356), so
 * setting them takes a redeploy.
 */
export const dynamic = 'force-static'

export function GET(): Response {
  const association = buildAppleAppSiteAssociation(
    process.env.APPLE_TEAM_ID,
    process.env.IOS_BUNDLE_ID
  )
  if (!association) return new Response('Not Found', { status: 404 })
  return Response.json(association, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  })
}
