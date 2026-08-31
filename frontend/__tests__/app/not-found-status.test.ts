import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

const APP = join(__dirname, '..', '..', 'src', 'app')

function pageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return pageFiles(full)
    return entry.name === 'page.tsx' ? [full] : []
  })
}

/**
 * Comments are stripped before scanning: the route-group pages explain this
 * very rule in prose, and a page that only *mentions* notFound() is not a
 * page that calls it.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const pages = pageFiles(APP).map((file) => ({
  file,
  route: relative(APP, file).split(sep).join('/'),
  code: stripComments(readFileSync(file, 'utf8')),
}))

const notFoundPages = pages.filter((p) => p.code.includes('notFound()'))

/** Every directory from the page's own up to and including `src/app`. */
function ancestorDirs(file: string): string[] {
  const dirs: string[] = []
  for (let dir = dirname(file); ; dir = dirname(dir)) {
    dirs.push(dir)
    if (dir === APP) return dirs
  }
}

describe('notFound() must be able to set a 404 (MON-275)', () => {
  it('finds the pages that call notFound()', () => {
    expect(notFoundPages.length).toBeGreaterThanOrEqual(10)
  })

  // A `loading.tsx` wraps its whole segment subtree in a Suspense boundary,
  // and streaming flushes HTTP 200 before the page body runs - so `notFound()`
  // underneath one renders the 404 body with a 200 status. That soft-404 is
  // indexable, and with ISR it is cached for `revalidate` seconds. Scope a
  // loading state to its own page with a route group instead: see
  // src/app/deputes/(liste)/ and src/app/votes/(liste)/.
  it.each(notFoundPages)('$route has no loading.tsx above it', ({ file }) => {
    const boundaries = ancestorDirs(file)
      .filter((dir) => existsSync(join(dir, 'loading.tsx')))
      .map((dir) => relative(APP, dir).split(sep).join('/') || '.')
    expect(boundaries).toEqual([])
  })

  // A bare `.catch(() => null)` in front of notFound() cannot tell "no such
  // row" from "the API is rate-limited or down", so an unwell API would turn
  // every detail page into a 404 - cached, under ISR.
  it.each(notFoundPages)('$route decides notFound() from nullIfMissing', ({ code }) => {
    expect(code).toContain('nullIfMissing')
  })
})
