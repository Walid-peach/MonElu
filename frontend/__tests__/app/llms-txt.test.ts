import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import robots from '@/app/robots'
import { buildLlmsTxt, buildLlmsFullTxt } from '@/lib/llms'
import { GROUP_ENTRIES } from '@/lib/groups'
import { THEME_ENTRIES } from '@/lib/themes'
import { SITE_URL, DATA_ATTRIBUTION } from '@/lib/site'

const APP = join(__dirname, '..', '..', 'src', 'app')

const short = buildLlmsTxt()
const full = buildLlmsFullTxt()

/**
 * Does `path` resolve to an app-router page? Route groups (`(liste)`) are
 * invisible in the URL, and a `[param]` segment matches any literal.
 */
function routeExists(path: string): boolean {
  const segments = path.split('/').filter(Boolean)

  function walk(dir: string, rest: string[]): boolean {
    if (rest.length === 0 && existsSync(join(dir, 'page.tsx'))) return true
    const entries = readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory())
    return entries.some(entry => {
      if (entry.name.startsWith('(')) return walk(join(dir, entry.name), rest)
      if (rest.length === 0) return false
      const [head, ...tail] = rest
      if (entry.name === head || entry.name.startsWith('[')) return walk(join(dir, entry.name), tail)
      return false
    })
  }

  return walk(APP, segments)
}

/** Every `SITE_URL`-rooted path the file links to. */
function internalPaths(text: string): string[] {
  const paths = new Set<string>()
  const origin = SITE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (const match of text.matchAll(new RegExp(`${origin}(/[^)\\s\`]*)?`, 'g'))) {
    const path = (match[1] ?? '/').replace(/\/+$/, '')
    if (path) paths.add(path)
  }
  return [...paths]
}

describe('llms.txt (MON-261)', () => {
  it.each([
    ['llms.txt', short],
    ['llms-full.txt', full],
  ])('%s states what the site is and how to attribute it', (_name, text) => {
    expect(text.startsWith('# MonÉlu')).toBe(true)
    expect(text).toContain('Licence Ouverte 2.0')
    expect(text).toContain(DATA_ATTRIBUTION)
    // The caveats a model would otherwise get wrong.
    expect(text).toContain('nonVotant')
    expect(text).toContain('1er juillet 2025')
    expect(text).toContain('Braun-Pivet')
  })

  it.each([
    ['llms.txt', short],
    ['llms-full.txt', full],
  ])('%s indexes every group and every theme', (_name, text) => {
    for (const { slug } of GROUP_ENTRIES) expect(text).toContain(`/groupes/${slug}`)
    for (const { slug } of THEME_ENTRIES) expect(text).toContain(`/themes/${slug}`)
  })

  // A file whose whole job is to orient a crawler must not point it at 404s.
  it.each([
    ['llms.txt', short],
    ['llms-full.txt', full],
  ])('%s only links pages that exist', (_name, text) => {
    // Route handlers, not pages - they have no page.tsx to resolve to.
    const NOT_PAGES = ['/sitemap.xml', '/llms.txt', '/llms-full.txt']
    const broken = internalPaths(text).filter(
      path => !NOT_PAGES.includes(path) && !routeExists(path)
    )
    expect(broken).toEqual([])
  })

  // Hardcoding the origin here would reintroduce MON-254 in a file nobody reads.
  it('derives its own URLs rather than hardcoding a host', () => {
    const source = readFileSync(join(__dirname, '..', '..', 'src', 'lib', 'llms.ts'), 'utf8')
    expect(source).not.toMatch(/mon-elu\.vercel\.app|monelu\.fr/)
  })

  it('llms-full.txt inlines the calculation definitions llms.txt only links to', () => {
    expect(full).toContain('mart_deputy_scorecard.sql')
    expect(full).toContain('mart_party_alignment.sql')
    expect(full.length).toBeGreaterThan(short.length)
  })
})

describe('AI-crawler policy (MON-261)', () => {
  const rules = robots().rules as Array<{ userAgent?: string | string[]; allow?: string | string[] }>

  it('allows every crawler, named or not', () => {
    for (const rule of rules) expect(rule.allow).toBe('/')
  })

  // Named entries exist so a later "tighten robots.txt" is a visible deletion
  // rather than a silent inheritance change.
  it.each(['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot'])(
    'names %s explicitly',
    agent => {
      expect(rules.some(rule => rule.userAgent === agent)).toBe(true)
    }
  )

  it('keeps the machine endpoints out for every agent', () => {
    for (const rule of rules) {
      expect((rule as { disallow?: string[] }).disallow).toEqual(['/partager', '/~offline'])
    }
  })
})
