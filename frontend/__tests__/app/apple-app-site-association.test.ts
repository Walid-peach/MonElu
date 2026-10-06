/**
 * @jest-environment node
 *
 * `/.well-known/apple-app-site-association` (ADR-041, #439).
 */
import { GET } from '@/app/.well-known/apple-app-site-association/route'
import {
  APP_LINK_COMPONENTS,
  buildAppleAppSiteAssociation,
} from '@/lib/appleAppSiteAssociation'

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

  it('opens deputy, vote, group and quiz share pages, and excludes the rest first', () => {
    const paths = APP_LINK_COMPONENTS.map((c) => c['/'])
    expect(paths).toEqual(
      expect.arrayContaining(['/deputes/*', '/votes/*', '/groupes/*', '/quiz/s/*'])
    )
    // Apple takes the first matching component, so every exclusion must come
    // before the broad pattern it carves out of.
    const firstInclude = APP_LINK_COMPONENTS.findIndex((c) => !c.exclude)
    expect(APP_LINK_COMPONENTS.slice(firstInclude).every((c) => !c.exclude)).toBe(true)
    expect(paths).toContain('/deputes/*.md')
    expect(paths).toContain('/votes/*.md')
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
