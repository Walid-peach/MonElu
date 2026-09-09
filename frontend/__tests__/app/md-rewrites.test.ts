/**
 * @jest-environment node
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import nextConfig from '../../next.config.mjs'

/**
 * The `.md` twins (MON-271) are the only feature in the app whose public URLs
 * exist solely because of a `rewrites()` entry: the route handlers live at
 * `/md/**`, and nothing but `next.config.mjs` connects `/deputes/{id}.md` to
 * them. The handler unit tests in `md-routes.test.ts` call those handlers
 * directly, so deleting the rewrite block would 404 every advertised `.md` URL
 * - including the one `llms.txt` publishes and the ones every deputy and vote
 * page emits as `<link rel="alternate">` - while leaving the suite green.
 *
 * This is the test that pins that half, the same way `layout-isr-floor` and
 * `canonical` pin theirs.
 */

const APP = join(__dirname, '..', '..', 'src', 'app')

type Rewrite = { source: string; destination: string }

/** `/md/deputes/:id` -> `src/app/md/deputes/[id]/route.ts` */
function routeHandlerFor(destination: string): string {
  const segments = destination
    .split('/')
    .filter(Boolean)
    .map(segment => (segment.startsWith(':') ? `[${segment.slice(1)}]` : segment))
  return join(APP, ...segments, 'route.ts')
}

async function rewrites(): Promise<Rewrite[]> {
  const configured = await nextConfig.rewrites!()
  // `rewrites()` may return an array or the {beforeFiles,afterFiles,fallback}
  // shape; normalise so this test keeps working if that ever changes.
  return Array.isArray(configured)
    ? configured
    : [
        ...(configured.beforeFiles ?? []),
        ...(configured.afterFiles ?? []),
        ...(configured.fallback ?? []),
      ]
}

describe('.md twin rewrites (MON-271)', () => {
  it.each([
    ['/deputes/:id.md', '/md/deputes/:id'],
    ['/votes/:id.md', '/md/votes/:id'],
    ['/methodologie.md', '/md/methodologie'],
  ])('maps %s to %s', async (source, destination) => {
    const configured = await rewrites()
    expect(configured).toContainEqual(expect.objectContaining({ source, destination }))
  })

  // A rewrite pointing at a route handler that does not exist is a 404 that no
  // other test would notice, since nothing else references these paths.
  it('points every rewrite at a route handler that exists on disk', async () => {
    const missing = (await rewrites())
      .filter(rule => rule.destination.startsWith('/md/'))
      .filter(rule => !existsSync(routeHandlerFor(rule.destination)))
      .map(rule => rule.destination)
    expect(missing).toEqual([])
  })

  // Every `.md` source must keep the literal suffix: `:id.md` is what makes
  // path-to-regexp capture the id up to the extension. A source of `/deputes/:id`
  // would swallow the real deputy page.
  it('keeps every .md rewrite scoped to the literal .md suffix', async () => {
    const mdRules = (await rewrites()).filter(rule => rule.destination.startsWith('/md/'))
    expect(mdRules.length).toBeGreaterThan(0)
    for (const rule of mdRules) expect(rule.source.endsWith('.md')).toBe(true)
  })
})
