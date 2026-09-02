import { render } from '@testing-library/react'
import DonneesPage from '@/app/donnees/page'
import LicenceDonneesPage from '@/app/licence-donnees/page'
import { API_BASE } from '@/lib/api'
import { CSV_EXPORTS } from '@/lib/exports'
import {
  DATA_CATALOG_ID,
  DATA_LICENSE_URL,
  DATA_TEMPORAL_COVERAGE,
  ORGANIZATION_ID,
  SITE_URL,
  buildDataCatalogJsonLd,
  buildDataLicenseJsonLd,
} from '@/lib/seo'

/**
 * `/donnees` and `/licence-donnees` are the two pages built for machine reuse,
 * so their structured data has to keep describing the exports the page actually
 * offers (MON-262) - including when a fourth export is added or a contentUrl
 * moves.
 */

type JsonLdNode = Record<string, unknown>

function jsonLdBlocks(container: HTMLElement): JsonLdNode[] {
  return Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map(el =>
    JSON.parse(el.textContent ?? '{}')
  )
}

describe('buildDataCatalogJsonLd', () => {
  const catalog = buildDataCatalogJsonLd()
  const datasets = catalog.dataset as JsonLdNode[]

  it('is a DataCatalog under the shared licence, published by the Organization', () => {
    expect(catalog['@type']).toBe('DataCatalog')
    expect(catalog['@id']).toBe(DATA_CATALOG_ID)
    expect(catalog.url).toBe(`${SITE_URL}/donnees`)
    expect(catalog.license).toBe(DATA_LICENSE_URL)
    expect(catalog.usageInfo).toBe(`${SITE_URL}/licence-donnees`)
    expect(catalog.publisher).toEqual({ '@id': ORGANIZATION_ID })
    expect(catalog.creator).toEqual({ '@id': ORGANIZATION_ID })
  })

  it('carries one Dataset per published export', () => {
    expect(datasets).toHaveLength(CSV_EXPORTS.length)
    expect(datasets.map(d => d['@id'])).toEqual(
      CSV_EXPORTS.map(entry => `${SITE_URL}/donnees#${entry.id}`)
    )
    for (const dataset of datasets) {
      expect(dataset['@type']).toBe('Dataset')
      expect(dataset.license).toBe(DATA_LICENSE_URL)
      expect(dataset.publisher).toEqual({ '@id': ORGANIZATION_ID })
      expect(dataset.includedInDataCatalog).toEqual({ '@id': DATA_CATALOG_ID })
    }
  })

  it('advertises only the coverage production actually holds', () => {
    // 2025-07-01, not the start of the legislature - CLAUDE.md decision 7.
    expect(DATA_TEMPORAL_COVERAGE).toBe('2025-07-01/..')
    for (const dataset of datasets) {
      expect(dataset.temporalCoverage).toBe(DATA_TEMPORAL_COVERAGE)
    }
  })

  it('names every column of the export as a measured variable', () => {
    for (const [index, entry] of CSV_EXPORTS.entries()) {
      const measured = datasets[index].variableMeasured as { name: string }[]
      expect(measured.map(v => v.name)).toEqual(entry.columns.split(', '))
    }
  })

  it('gives a downloadable export a contentUrl and a parameterized one a url template', () => {
    for (const [index, entry] of CSV_EXPORTS.entries()) {
      const dataset = datasets[index]
      if (entry.href) {
        expect(dataset.distribution).toEqual({
          '@type': 'DataDownload',
          encodingFormat: 'text/csv',
          contentUrl: entry.href,
        })
        expect(dataset.potentialAction).toBeUndefined()
      } else {
        expect(dataset.distribution).toBeUndefined()
        const action = dataset.potentialAction as { target: { urlTemplate: string } }
        expect(action.target.urlTemplate).toBe(`${API_BASE}${entry.pattern}`)
        // A template is only useful if it still carries its placeholder.
        expect(action.target.urlTemplate).toContain('{')
      }
    }
  })
})

describe('buildDataLicenseJsonLd', () => {
  it('states the licence as a URL and points back at the catalog', () => {
    const page = buildDataLicenseJsonLd()
    expect(page['@type']).toBe('WebPage')
    expect(page.license).toBe(DATA_LICENSE_URL)
    expect(page.publisher).toEqual({ '@id': ORGANIZATION_ID })
    expect(page.about).toEqual({ '@id': DATA_CATALOG_ID })
  })
})

describe('the pages built for machine reuse', () => {
  it('/donnees emits the catalog, and lists the same exports it marks up', () => {
    const { container } = render(<DonneesPage />)
    const catalog = jsonLdBlocks(container).find(block => block['@type'] === 'DataCatalog')
    expect(catalog).toBeDefined()
    expect(catalog!.dataset).toHaveLength(CSV_EXPORTS.length)

    const visible = container.textContent ?? ''
    for (const entry of CSV_EXPORTS) {
      expect(visible).toContain(entry.name)
      expect(visible).toContain(`${API_BASE}${entry.pattern}`)
    }
  })

  it('/licence-donnees emits the licence block, and links the licence it names', () => {
    const { container } = render(<LicenceDonneesPage />)
    const page = jsonLdBlocks(container).find(block => block['@type'] === 'WebPage')
    expect(page).toBeDefined()
    expect(page!.license).toBe(DATA_LICENSE_URL)
    expect(container.querySelector(`a[href="${DATA_LICENSE_URL}"]`)).not.toBeNull()
  })
})
