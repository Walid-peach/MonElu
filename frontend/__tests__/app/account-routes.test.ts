/**
 * @jest-environment node
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * The account surface's invariants (#415, ADR-040), checked on the source so a
 * later edit cannot quietly undo them.
 *
 * 1. The access token never reaches client JavaScript: no client module
 *    imports Supabase, nothing reads `document.cookie` or keeps auth state in
 *    web storage, and no `NEXT_PUBLIC_SUPABASE_*` variable exists to inline a
 *    project key into the bundle.
 * 2. Session state has one source, `SessionProvider` - the ThemeProvider rule
 *    (MON-168) applied to auth.
 * 3. Authenticated route handlers are per-request and uncached (GH #352).
 * 4. Account pages are `noindex` through the shared `SNAPSHOT_ROBOTS` and stay
 *    out of the sitemap.
 */

const SRC = join(__dirname, '..', '..', 'src')
const APP = join(SRC, 'app')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

/** Strip comments so prose explaining a rule is not mistaken for breaking it. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
}

const rel = (path: string) => relative(SRC, path).split(sep).join('/')
const files = sourceFiles(SRC)
const isClient = (path: string) => /^['"]use client['"]/m.test(readFileSync(path, 'utf8'))

/** Route handlers that carry a session, found from the tree rather than listed. */
const AUTH_HANDLERS = files
  .map(rel)
  .filter((p) => /^app\/api\/(auth|account)\/.*route\.ts$/.test(p))

/** Account pages. `/mon-compte` (#416) joins this list when it lands. */
const ACCOUNT_PAGES = ['app/connexion/page.tsx']

describe('the token stays on the server (ADR-040 §4)', () => {
  it('keeps every Supabase import out of client modules', () => {
    const offenders = files
      .filter(isClient)
      .filter((p) => /from ['"](@supabase\/|@\/lib\/supabase)/.test(code(p)))
      .map(rel)
    expect(offenders).toEqual([])
  })

  it('marks every module under lib/supabase as server-only', () => {
    const modules = files.map(rel).filter((p) => p.startsWith('lib/supabase/'))
    expect(modules.length).toBeGreaterThan(0)
    for (const module of modules) {
      expect(readFileSync(join(SRC, module), 'utf8')).toMatch(/^import 'server-only'$/m)
    }
  })

  it('imports @supabase/* only from lib/supabase', () => {
    const offenders = files
      .filter((p) => /from ['"]@supabase\//.test(code(p)))
      .map(rel)
      .filter((p) => !p.startsWith('lib/supabase/'))
    expect(offenders).toEqual([])
  })

  it('declares no public Supabase variable', () => {
    const offenders = files.filter((p) => /NEXT_PUBLIC_SUPABASE/.test(code(p))).map(rel)
    expect(offenders).toEqual([])
  })

  it('never touches document.cookie or web storage for auth', () => {
    const offenders = files
      .filter((p) => {
        const source = code(p)
        if (/document\.cookie/.test(source)) return true
        // Web storage is fine for the theme, the chat history and the
        // followed deputy; a key or value about sessions is not.
        return /(localStorage|sessionStorage)[\s\S]{0,120}(auth|session|token|sb-)/i.test(source)
      })
      .map(rel)
    expect(offenders).toEqual([])
  })

  it('writes the session cookie httpOnly', () => {
    const server = readFileSync(join(SRC, 'lib', 'supabase', 'server.ts'), 'utf8')
    expect(server).toMatch(/httpOnly: true/)
    expect(server).toMatch(/\.\.\.options, \.\.\.SESSION_COOKIE_OPTIONS/)
  })
})

describe('session state has one source (MON-168 pattern)', () => {
  it('reads /api/auth/session from SessionProvider alone', () => {
    const readers = files.filter((p) => /['"]\/api\/auth\/session['"]/.test(code(p))).map(rel)
    expect(readers).toEqual(['components/SessionProvider.tsx'])
  })

  it('renders SessionProvider once, in the root layout', () => {
    const renderers = files.filter((p) => /<SessionProvider>/.test(code(p))).map(rel)
    expect(renderers).toEqual(['app/layout.tsx'])
  })
})

describe('authenticated route handlers are uncached (GH #352)', () => {
  it('finds the handlers', () => {
    expect(AUTH_HANDLERS).toEqual(
      expect.arrayContaining([
        'app/api/account/[...path]/route.ts',
        'app/api/auth/code/route.ts',
        'app/api/auth/session/route.ts',
        'app/api/auth/signout/route.ts',
        'app/api/auth/verify/route.ts',
      ])
    )
  })

  it.each(AUTH_HANDLERS)('%s is force-dynamic with no revalidate', (handler) => {
    const source = code(join(SRC, handler))
    expect(source).toMatch(/^export const dynamic = 'force-dynamic'$/m)
    expect(source).not.toMatch(/\brevalidate\b/)
    // The `api` client in lib/api.ts caches through ISR tags; per-user reads
    // must not go through it.
    expect(source).not.toMatch(/from '@\/lib\/api'/)
  })

  it('sends the account API call with cache: no-store', () => {
    const source = code(join(SRC, 'lib', 'supabase', 'accountApi.ts'))
    expect(source).toMatch(/cache: 'no-store'/)
    expect(source).not.toMatch(/\brevalidate\b/)
  })
})

describe('account pages are noindex and out of the sitemap', () => {
  const sitemap = readFileSync(join(APP, 'sitemap.ts'), 'utf8')

  it.each(ACCOUNT_PAGES)('%s applies the shared SNAPSHOT_ROBOTS', (page) => {
    const source = code(join(SRC, page))
    expect(source).toMatch(/import \{[^}]*\bSNAPSHOT_ROBOTS\b[^}]*\} from '@\/lib\/seo'/)
    expect(source).not.toMatch(/const SNAPSHOT_ROBOTS\s*=/)
    // A static metadata export has no early-return path to lose it on; a
    // generateMetadata would need every return covered, like ADR-036's routes.
    expect(source).not.toMatch(/generateMetadata/)
    expect(source).toMatch(/export const metadata[\s\S]*robots: SNAPSHOT_ROBOTS/)
  })

  it.each(ACCOUNT_PAGES)('%s is absent from sitemap.ts', (page) => {
    const path = '/' + page.replace(/^app\//, '').replace(/\/page\.tsx$/, '')
    expect(sitemap).not.toContain('${SITE_URL}' + path)
  })
})

describe('no password and no social sign-in (ADR-040 §2)', () => {
  it('renders no password field and no OAuth provider anywhere', () => {
    const offenders = files
      .filter((p) => {
        const source = code(p)
        return (
          /type=["']password["']/.test(source) ||
          /signInWithOAuth|signInWithPassword|signInWithIdToken|signUp\(/.test(source)
        )
      })
      .map(rel)
    expect(offenders).toEqual([])
  })
})
