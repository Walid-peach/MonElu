import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..')
const APP = join(ROOT, 'src', 'app')

/**
 * The redirect table is read out of `next.config.mjs` as text rather than
 * imported: the config's default export is wrapped by next-pwa and
 * withSentryConfig, which pull in build-time-only plugins that have no business
 * running inside Jest. `canonical.test.ts` reads source files the same way.
 */
const CONFIG = readFileSync(join(ROOT, 'next.config.mjs'), 'utf8')

const REDIRECT =
  /\{\s*source:\s*'([^']+)',\s*destination:\s*'([^']+)',\s*permanent:\s*(true|false)\s*\}/g

const redirects = [...CONFIG.matchAll(REDIRECT)].map(([, source, destination, permanent]) => ({
  source,
  destination,
  permanent: permanent === 'true',
}))

/**
 * Does `path` resolve to an app-router page or route handler? Mirrors the
 * resolution in `llms-txt.test.ts`, plus `route.ts` so a `/api`-style handler
 * counts as a real destination.
 */
function routeExists(path: string): boolean {
  function walk(dir: string, rest: string[]): boolean {
    if (rest.length === 0 && (existsSync(join(dir, 'page.tsx')) || existsSync(join(dir, 'route.ts'))))
      return true
    const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory())
    return entries.some((entry) => {
      if (entry.name.startsWith('(')) return walk(join(dir, entry.name), rest)
      if (rest.length === 0) return false
      const [head, ...tail] = rest
      if (entry.name === head || entry.name.startsWith('[')) return walk(join(dir, entry.name), tail)
      return false
    })
  }

  return walk(APP, path.split('/').filter(Boolean))
}

describe('English alias redirects (MON-272)', () => {
  it('parses the redirect table out of next.config.mjs', () => {
    expect(redirects.length).toBeGreaterThanOrEqual(10)
  })

  // The conventional paths an agent, scanner or link-checker probes before it
  // parses navigation. Each 404'd before MON-272.
  it.each([
    ['/about', '/a-propos'],
    ['/privacy', '/confidentialite'],
    ['/terms', '/mentions-legales'],
    ['/legal', '/mentions-legales'],
    ['/api', '/developpeurs'],
    ['/docs', '/developpeurs'],
    ['/data', '/donnees'],
    ['/methodology', '/methodologie'],
    ['/license', '/licence-donnees'],
  ])('%s redirects to %s', (source, destination) => {
    expect(redirects).toContainEqual({ source, destination, permanent: true })
  })

  // A redirect into a 404 is worse than a plain 404: it costs a round trip
  // first, and it teaches a crawler that the alias is a live URL.
  it.each(redirects)('$source points at a route that exists', ({ destination }) => {
    expect(routeExists(destination)).toBe(true)
  })

  // 308, not 307: the French URL stays canonical, so nothing should index the
  // alias or split ranking between the two spellings.
  it.each(redirects)('$source is permanent', ({ permanent }) => {
    expect(permanent).toBe(true)
  })

  // An alias that shadows a real page would make that page unreachable.
  it.each(redirects)('$source is not itself a route', ({ source }) => {
    expect(routeExists(source)).toBe(false)
  })
})
