/**
 * @jest-environment node
 *
 * `/.well-known/apple-app-site-association` (ADR-041, #439).
 */
import { GET } from '@/app/.well-known/apple-app-site-association/route'
import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import {
  APP_LINK_COMPONENTS,
  buildAppleAppSiteAssociation,
  opensInApp,
} from '@/lib/appleAppSiteAssociation'

// Shared with the app's AppRouteTests, which checks AppRoute(url:) parses
// every path in opens_in_app (#623).
const APP_LINKS: { opens_in_app: string[]; stays_on_web: string[] } = JSON.parse(
  readFileSync(
    join(process.cwd(), '..', 'ios/Packages/MonEluCore/Tests/MonEluCoreTests/Fixtures/app_links.json'),
    'utf8'
  )
)

const ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ENV }
})

describe('buildAppleAppSiteAssociation', () => {
  it('names the app as <Team ID>.<bundle id>', () => {
    const aasa = buildAppleAppSiteAssociation('TEAMID0001', 'fr.monelu.app')
    expect(aasa?.applinks.details).toEqual([
      { appIDs: ['TEAMID0001.fr.monelu.app'], components: APP_LINK_COMPONENTS },
    ])
  })

  it.each([
    [undefined, 'fr.monelu.app'],
    ['TEAMID0001', undefined],
    ['', 'fr.monelu.app'],
    ['teamid0001', 'fr.monelu.app'],
    ['TEAMID001', 'fr.monelu.app'],
    ['TEAMID0001', 'monelu'],
    ['TEAMID0001', 'fr.monelu app'],
  ])('returns null for team %p and bundle %p', (team, bundle) => {
    expect(buildAppleAppSiteAssociation(team, bundle)).toBeNull()
  })

  it('opens deputy, vote, group, theme and department pages, and excludes the rest first', () => {
    const paths = APP_LINK_COMPONENTS.map((c) => c['/'])
    expect(paths).toEqual(
      expect.arrayContaining(['/deputes/*', '/votes/*', '/groupes/*', '/themes/*', '/departements/*'])
    )
    // Apple takes the first matching component, so every exclusion must come
    // before the broad pattern it carves out of.
    const firstInclude = APP_LINK_COMPONENTS.findIndex((c) => !c.exclude)
    expect(APP_LINK_COMPONENTS.slice(firstInclude).every((c) => !c.exclude)).toBe(true)
    expect(paths).toContain('/deputes/*.md')
    expect(paths).toContain('/votes/*.md')
  })
})

describe('what the app is given (#623)', () => {
  it.each(APP_LINKS.opens_in_app)('gives the app %s', (path) => {
    expect(opensInApp(path)).toBe(true)
  })

  it.each(APP_LINKS.stays_on_web)('keeps %s on the web', (path) => {
    expect(opensInApp(path)).toBe(false)
  })

  // Every page the site serves, with its dynamic segments filled in: one the
  // file claims must be in opens_in_app, which the app's tests then parse.
  // A new nested page under a claimed prefix fails here instead of opening
  // the app on nothing.
  it('claims no website route the app has not been checked against', () => {
    const appDir = join(process.cwd(), 'src', 'app')
    const routes = (readdirSync(appDir, { recursive: true }) as string[])
      .filter((f) => /(^|[\\/])(page\.tsx|route\.ts)$/.test(f))
      .map((f) => '/' + f.split(sep).slice(0, -1).filter((s) => !/^\(.*\)$/.test(s)).join('/'))
    const sample = (route: string) =>
      route
        .replace('/deputes/[id]', '/deputes/PA1008')
        .replace('/votes/[id]', '/votes/VTANR5L17V1')
        .replace(/\[[^\]]+\]/g, 'x')
    const claimed = routes.map(sample).filter(opensInApp)
    expect(claimed.length).toBeGreaterThan(0)
    // A route counts as checked when opens_in_app has a path of the same
    // shape: same prefix, same depth (`/deputes/PA1008` for `/deputes/[id]`).
    const shape = (path: string) => `${path.split('/')[1]}:${path.split('/').length}`
    const checked = new Set(APP_LINKS.opens_in_app.map(shape))
    for (const path of claimed) {
      expect({ path, checked: checked.has(shape(path)) }).toEqual({ path, checked: true })
    }
  })
})

describe('GET /.well-known/apple-app-site-association', () => {
  it('is a 404 while the app is not configured, so the live site is unchanged', async () => {
    delete process.env.APPLE_TEAM_ID
    delete process.env.IOS_BUNDLE_ID
    expect(GET().status).toBe(404)
  })

  it('serves JSON once both variables are set', async () => {
    process.env.APPLE_TEAM_ID = 'TEAMID0001'
    process.env.IOS_BUNDLE_ID = 'fr.monelu.app'
    const res = GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    const body = await res.json()
    expect(body.applinks.details[0].appIDs).toEqual(['TEAMID0001.fr.monelu.app'])
  })
})
