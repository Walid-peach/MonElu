import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const APP = join(__dirname, '..', '..', 'src', 'app')

/**
 * Routes that deliberately emit no canonical (MON-269). Both are excluded
 * from the sitemap and neither is a page a crawler should index:
 * `~offline` is the service worker's navigation fallback, and the embed
 * route already declares `robots: { index: false }`.
 */
const NO_CANONICAL = ['~offline/page.tsx', 'embed/votes/[id]/page.tsx']

/**
 * `alternates: { canonical: ... }` inline, or the `const alternates = {
 * canonical: ... }` form the dynamic routes use so the canonical survives a
 * failed metadata fetch. The capture is the rest of that line.
 */
const CANONICAL = /(?:alternates:|const alternates =)\s*\{\s*canonical:(.*)/g

function pageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return pageFiles(full)
    return entry.name === 'page.tsx' ? [full] : []
  })
}

const pages = pageFiles(APP).map((file) => {
  const source = readFileSync(file, 'utf8')
  return {
    route: relative(APP, file).split(sep).join('/'),
    source,
    declarations: [...source.matchAll(CANONICAL)].map((m) => m[1]),
  }
})

describe('canonical URLs (MON-269)', () => {
  it('finds the app router pages', () => {
    expect(pages.length).toBeGreaterThan(20)
  })

  // Without a canonical, the same document is independently crawlable on
  // mon-elu.vercel.app, on every per-deployment *.vercel.app host and on any
  // future custom domain, with none of them claiming to be the original.
  it.each(pages.filter((p) => !NO_CANONICAL.includes(p.route)))(
    '$route declares a canonical',
    ({ declarations }) => {
      expect(declarations.length).toBeGreaterThan(0)
    }
  )

  // Hardcoding the origin here would reintroduce MON-254 one page at a time.
  it.each(pages.filter((p) => p.declarations.length > 0))(
    '$route builds its canonical from canonicalUrl()',
    ({ declarations }) => {
      for (const declaration of declarations) expect(declaration).toContain('canonicalUrl(')
    }
  )

  it.each(NO_CANONICAL)('%s is still a real page, so the allowlist stays honest', (route) => {
    expect(pages.map((p) => p.route)).toContain(route)
  })
})
