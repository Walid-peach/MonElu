import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { DAILY_REVALIDATE_SECONDS } from '@/lib/cachePolicy'
import { HEALTH_REVALIDATE_SECONDS } from '@/lib/cacheTags'

const SRC = join(__dirname, '..', '..', 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

/**
 * GH #352: every server-rendered resource reads data that changes at most once
 * a day and is invalidated on demand by `/api/revalidate`, so the time-based
 * interval is only a fallback. Hourly and sub-hourly timers regenerated
 * identical pages between data releases. This pins the floor on both halves:
 * route segment literals, and the fetch-level intervals in `lib/api.ts`.
 */
describe('ISR fallback policy (GH #352)', () => {
  it('uses a one-day fallback, and the site-wide health floor matches it', () => {
    expect(DAILY_REVALIDATE_SECONDS).toBe(24 * 60 * 60)
    // The root layout's health fetch caps every route (GH #354), so a shorter
    // value would silently undo every page below.
    expect(HEALTH_REVALIDATE_SECONDS).toBeGreaterThanOrEqual(DAILY_REVALIDATE_SECONDS)
  })

  it('declares no route segment revalidate below a day', () => {
    const offenders = sourceFiles(join(SRC, 'app')).flatMap((path) => {
      const match = readFileSync(path, 'utf8').match(/^export const revalidate = (\d+)/m)
      return match && Number(match[1]) < DAILY_REVALIDATE_SECONDS
        ? [`${relative(SRC, path)}: ${match[1]}`]
        : []
    })
    expect(offenders).toEqual([])
  })

  it('gives every API fetch a named interval rather than a literal', () => {
    const api = readFileSync(join(SRC, 'lib', 'api.ts'), 'utf8')
    expect(api.match(/revalidate: \d/g)).toBeNull()
    expect(api).not.toMatch(/revalidate \?\?/)
  })
})
