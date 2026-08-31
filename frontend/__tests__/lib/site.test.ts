import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { SITE_URL, SITE_HOST, canonicalUrl } from '@/lib/site'

const SRC = join(__dirname, '..', '..', 'src')
const ALLOWED = join(SRC, 'lib', 'site.ts')
const LITERAL = 'mon-elu.vercel.app'

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : []
  })
}

describe('site origin constants', () => {
  it('derives SITE_HOST from SITE_URL without the scheme', () => {
    expect(SITE_URL).toMatch(/^https?:\/\//)
    expect(SITE_URL.endsWith('/')).toBe(false)
    expect(SITE_HOST).toBe(SITE_URL.replace(/^https?:\/\//, ''))
  })

  // MON-254: ten files used to inline the domain, so a domain move left stale
  // canonical, sitemap and OG URLs behind. src/lib/site.ts is the only place
  // the literal may appear.
  it('is the only place in src/ that spells the domain out', () => {
    const offenders = walk(SRC).filter(
      (file) => file !== ALLOWED && readFileSync(file, 'utf8').includes(LITERAL)
    )
    expect(offenders).toEqual([])
  })
})

// MON-269: the canonical a page declares must match its sitemap entry
// character for character, or the two signals disagree.
describe('canonicalUrl', () => {
  it('returns the bare origin for the homepage, as the sitemap lists it', () => {
    expect(canonicalUrl('/')).toBe(SITE_URL)
    expect(canonicalUrl()).toBe(SITE_URL)
  })

  it('appends the path without a trailing slash', () => {
    expect(canonicalUrl('/deputes')).toBe(`${SITE_URL}/deputes`)
    expect(canonicalUrl('/deputes/')).toBe(`${SITE_URL}/deputes`)
    expect(canonicalUrl('/deputes/PA123')).toBe(`${SITE_URL}/deputes/PA123`)
  })

  it('tolerates a path given without its leading slash', () => {
    expect(canonicalUrl('quiz')).toBe(`${SITE_URL}/quiz`)
  })

  it('never carries a query string through', () => {
    // Callers pass the route, not the request URL - the whole point of the
    // canonical is that /quiz?deputy=PA123 collapses onto /quiz.
    expect(canonicalUrl('/quiz')).not.toContain('?')
  })
})
