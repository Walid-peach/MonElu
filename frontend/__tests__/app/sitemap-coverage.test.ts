import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const APP = join(__dirname, '..', '..', 'src', 'app')
const SITEMAP = readFileSync(join(APP, 'sitemap.ts'), 'utf8')

/**
 * Static routes deliberately left out of the sitemap.
 *
 * `~offline` is the service worker's navigation fallback, not a document.
 * Dynamic routes are excluded from this check entirely — they are either
 * enumerated from the API (`/deputes/[id]`, `/votes/[id]`, …), generated from
 * a slug table (`/themes`, `/groupes`), or share snapshots that stay out by
 * decision (`/chat/s`, `/quiz/s`, `/verifier/v` — MON-264).
 */
const NOT_IN_SITEMAP = ['/~offline']

function pageRoutes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return pageRoutes(full)
    if (entry.name !== 'page.tsx') return []
    const route = relative(APP, full).split(sep).slice(0, -1)
    // Route groups — `(liste)` — are organisational, not part of the URL.
    return ['/' + route.filter((s) => !s.startsWith('(')).join('/')]
  })
}

const staticRoutes = pageRoutes(APP)
  .map((route) => (route === '/' ? '/' : route.replace(/\/$/, '')))
  .filter((route) => !route.includes('['))
  .filter((route) => !NOT_IN_SITEMAP.includes(route))
  .sort()

describe('sitemap covers every static page (MON-265)', () => {
  it('finds the static routes', () => {
    expect(staticRoutes.length).toBeGreaterThan(10)
    expect(staticRoutes).toContain('/deputes/comparer')
    expect(staticRoutes).toContain('/licence-donnees')
  })

  // `/deputes/comparer` shipped, was linked only from inside the app, and sat
  // out of the sitemap for months without anything reporting it. A new page
  // reaching production undiscoverable is the failure this test exists to stop.
  it.each(staticRoutes)('%s appears in sitemap.ts', (route) => {
    const literal = route === '/' ? 'url: SITE_URL,' : '${SITE_URL}' + route + '`'
    expect(SITEMAP).toContain(literal)
  })
})
