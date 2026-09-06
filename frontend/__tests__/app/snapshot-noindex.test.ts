import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const APP = join(__dirname, '..', '..', 'src', 'app')

/**
 * The share-snapshot routes (ADR-036, MON-264).
 *
 * These pages render user-submitted, unmoderated content: a question and a
 * RAG answer, a submitted claim and its verdict, or - via the ADR-028
 * `include_answers` opt-in - the sharer's own political answers. They are
 * shareable by unguessable UUID, but they are not documents a stranger should
 * reach through a search engine.
 *
 * Absence from `sitemap.ts` does not achieve that on its own: `robots.ts`
 * allows every crawler on `/`, so one external link to a share URL is enough
 * to make the page indexable. The `noindex` on the page is the actual policy.
 */
const SNAPSHOT_ROUTES = [
  'chat/s/[id]/page.tsx',
  'verifier/v/[id]/page.tsx',
  'quiz/s/[id]/page.tsx',
]

const sources = SNAPSHOT_ROUTES.map((route) => ({
  route,
  path: join(APP, route),
  source: existsSync(join(APP, route)) ? readFileSync(join(APP, route), 'utf8') : '',
}))

describe('share snapshots are noindex (ADR-036, MON-264)', () => {
  it.each(sources)('$route still exists, so this list stays honest', ({ source }) => {
    expect(source).not.toBe('')
  })

  it.each(sources)('$route declares index: false', ({ source }) => {
    expect(source).toMatch(/index:\s*false/)
  })

  // A noindex that vanishes when the API is down is not a policy. Both the
  // early return taken on a failed snapshot fetch and the populated metadata
  // object must carry it, so every generateMetadata return path is covered.
  it.each(sources)('$route applies it on every generateMetadata return path', ({ source }) => {
    const metadata = source.slice(source.indexOf('export async function generateMetadata'))
    const body = metadata.slice(0, metadata.indexOf('\nexport default'))
    const returns = body.match(/return\s*\{/g) ?? []
    expect(returns.length).toBeGreaterThan(1)
    expect([...body.matchAll(/robots:/g)].length).toBe(returns.length)
  })

  // Markup like ClaimReview or QAPage is a request to be surfaced as a rich
  // result, which is exactly what ADR-036 declines for this corpus.
  it.each(sources)('$route emits no rich-result markup', ({ source }) => {
    expect(source).not.toMatch(/ClaimReview|QAPage|JsonLd/)
  })
})

describe('sitemap excludes the snapshot corpus (ADR-036, MON-264)', () => {
  const sitemap = readFileSync(join(APP, 'sitemap.ts'), 'utf8')

  it.each(['/chat/s/', '/verifier/v/', '/quiz/s/'])('does not list %s', (prefix) => {
    expect(sitemap).not.toContain(`${prefix}$`)
    expect(sitemap).not.toMatch(new RegExp(`url:.*${prefix.replace(/\//g, '\\/')}`))
  })
})
