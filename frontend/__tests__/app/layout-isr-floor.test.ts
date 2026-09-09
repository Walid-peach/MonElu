import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(__dirname, '..', '..', 'src')

/**
 * GH #354: Next.js takes the lowest `revalidate` across a route and all of its
 * layouts, so a server fetch in the root layout sets the ISR floor for every
 * route on the site. `FreshnessBadge`'s `/health` fetch at `revalidate: 300`
 * made otherwise-static pages regenerate every five minutes and pushed the
 * project past the Vercel Hobby ISR write allowance.
 *
 * The fix was per-fetch, so nothing stops the next component added to the root
 * layout from re-creating the same site-wide cost. This test is the guard: the
 * root layout's *server* subtree may reach the API from exactly one component,
 * and that component's only call is the tagged `api.health()`.
 *
 * If you are here because you added a server fetch to the layout, that is the
 * decision to reconsider - not this list. If the fetch really belongs there,
 * give it a tag in `@/lib/cacheTags` plus a fallback measured in hours, and add
 * it below.
 */
const ALLOWED_FETCHERS = ['FreshnessBadge']

const layout = readFileSync(join(SRC, 'app', 'layout.tsx'), 'utf8')

/** Local components the root layout renders, by `@/components/...` import. */
const imported = [...layout.matchAll(/from '@\/components\/([\w/]+)'/g)].map((m) => m[1])

function sourceOf(component: string): string | null {
  for (const ext of ['.tsx', '.ts']) {
    const path = join(SRC, 'components', `${component}${ext}`)
    if (existsSync(path)) return readFileSync(path, 'utf8')
  }
  return null
}

const components = imported.map((name) => {
  const source = sourceOf(name)
  return {
    name,
    source,
    isClient: source !== null && /^['"]use client['"]/m.test(source),
    callsApi: source !== null && /\bapi\.\w/.test(source),
  }
})

describe('root layout ISR floor (GH #354)', () => {
  it('resolves the components the layout imports', () => {
    expect(components.length).toBeGreaterThan(5)
    expect(components.every((c) => c.source !== null)).toBe(true)
    expect(components.map((c) => c.name)).toContain('FreshnessBadge')
  })

  it('reaches the API from no server component other than the allowed ones', () => {
    const offenders = components
      .filter((c) => !c.isClient && c.callsApi && !ALLOWED_FETCHERS.includes(c.name))
      .map((c) => c.name)
    expect(offenders).toEqual([])
  })

  it('keeps the freshness badge on the tagged health fetch alone', () => {
    const badge = sourceOf('FreshnessBadge') ?? ''
    const calls = [...badge.matchAll(/\bapi\.(\w+)/g)].map((m) => m[1])
    expect(calls).toEqual(['health'])
  })

  it('gives the health fetch a tag and a fallback measured in hours', () => {
    const api = readFileSync(join(SRC, 'lib', 'api.ts'), 'utf8')
    const health = api.slice(api.indexOf("apiFetch<Record<string, unknown>>('/health/'"))
    expect(health).toContain('tags: [HEALTH_TAG]')
    expect(health).toContain('revalidate: HEALTH_REVALIDATE_SECONDS')
  })
})
