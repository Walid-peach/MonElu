import { scrubBreadcrumb, scrubPrivateUrl, scrubSpan } from '@/lib/sentryPrivacy'
import { readFileSync } from 'fs'
import { join } from 'path'

const ADDRESS_URL = 'https://data.geopf.fr/geocodage/search?q=8+boulevard+du+Port+Amiens&limit=15'
const POSTAL_URL = 'https://geo.api.gouv.fr/communes?codePostal=80000&fields=departement'

describe('Sentry privacy (ADR-047 §4)', () => {
  it('drops the query of a geocoder or postal-code URL and keeps any other URL whole', () => {
    expect(scrubPrivateUrl(ADDRESS_URL)).toBe('https://data.geopf.fr/geocodage/search')
    expect(scrubPrivateUrl(POSTAL_URL)).toBe('https://geo.api.gouv.fr/communes')
    const api = 'https://monelu-production.up.railway.app/votes?limit=10'
    expect(scrubPrivateUrl(api)).toBe(api)
    expect(scrubPrivateUrl('not a url')).toBe('not a url')
  })

  it('scrubs fetch breadcrumbs', () => {
    const crumb = scrubBreadcrumb({ category: 'fetch', data: { url: ADDRESS_URL, method: 'GET', status_code: 200 } })
    expect(JSON.stringify(crumb)).not.toContain('boulevard')
    expect(crumb.data?.status_code).toBe(200)
  })

  it('scrubs http.client spans, description and data', () => {
    const span = scrubSpan({
      description: `GET ${ADDRESS_URL}`,
      data: { url: ADDRESS_URL, 'url.full': ADDRESS_URL, 'http.query': '?q=8+boulevard+du+Port+Amiens' },
    })
    expect(JSON.stringify(span)).not.toContain('boulevard')
    expect(span.description).toBe('GET https://data.geopf.fr/geocodage/search')
  })

  it('is wired into the browser Sentry config', () => {
    const config = readFileSync(join(__dirname, '..', '..', 'instrumentation-client.ts'), 'utf8')
    expect(config).toContain('beforeBreadcrumb')
    expect(config).toContain('beforeSendSpan')
  })
})
