import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { SITE_URL, SITE_HOST } from '@/lib/site'

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
