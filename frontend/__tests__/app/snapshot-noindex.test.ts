import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const APP = join(__dirname, '..', '..', 'src', 'app')
const SEO = join(__dirname, '..', '..', 'src', 'lib', 'seo.ts')

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

/** Strip line and block comments so prose about the policy is not mistaken for it. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

const sources = SNAPSHOT_ROUTES.map((route) => {
  const path = join(APP, route)
  const source = existsSync(path) ? readFileSync(path, 'utf8') : ''
  return { route, source, code: stripComments(source) }
})

describe('share snapshots are noindex (ADR-036, MON-264)', () => {
  it.each(sources)('$route still exists, so this list stays honest', ({ source }) => {
    expect(source).not.toBe('')
  })

  // One definition, in seo.ts, like frontend_base_url() on the backend. Three
  // hand-maintained copies of the same literal are what drifts.
  it('SNAPSHOT_ROBOTS is defined once, in lib/seo.ts', () => {
    expect(readFileSync(SEO, 'utf8')).toMatch(
      /export const SNAPSHOT_ROBOTS = \{ index: false, follow: true \} as const/
    )
  })

  it.each(sources)('$route imports the shared SNAPSHOT_ROBOTS', ({ code }) => {
    expect(code).toMatch(/import \{[^}]*\bSNAPSHOT_ROBOTS\b[^}]*\} from '@\/lib\/seo'/)
    // A local redefinition would silently decouple this route from the policy.
    expect(code).not.toMatch(/const SNAPSHOT_ROBOTS\s*=/)
  })

  // A noindex that vanishes when the API is down is not a policy. Both the
  // early return taken on a failed snapshot fetch and the populated metadata
  // object must carry it, so every generateMetadata return path is covered.
  it.each(sources)('$route applies it on every generateMetadata return path', ({ code }) => {
    const start = code.indexOf('export async function generateMetadata')
    expect(start).toBeGreaterThan(-1)
    const end = code.indexOf('\nexport default', start)
    // Slicing on a -1 here would silently trim one character and weaken the
    // assertion instead of failing, so require the marker explicitly.
    expect(end).toBeGreaterThan(start)

    const body = code.slice(start, end)
    const returns = body.match(/return\s*\{/g) ?? []
    expect(returns.length).toBeGreaterThan(1)
    expect([...body.matchAll(/\brobots:/g)].length).toBe(returns.length)
  })

  // Markup like ClaimReview or QAPage is a request to be surfaced as a rich
  // result, which is exactly what ADR-036 declines for this corpus. Checked
  // against comment-stripped code so an explanatory comment naming the type
  // (very natural under this ADR) does not fail the build.
  it.each(sources)('$route emits no rich-result markup', ({ code }) => {
    expect(code).not.toMatch(/ClaimReview|QAPage|JsonLd/)
  })
})

describe('sitemap excludes the snapshot corpus (ADR-036, MON-264)', () => {
  const sitemap = stripComments(readFileSync(join(APP, 'sitemap.ts'), 'utf8'))

  it.each(['/chat/s/', '/verifier/v/', '/quiz/s/'])('does not list %s', (prefix) => {
    expect(sitemap).not.toMatch(new RegExp(`url:.*${prefix.replace(/\//g, '\\/')}`))
  })
})
