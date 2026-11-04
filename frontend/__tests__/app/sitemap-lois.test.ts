/**
 * @jest-environment node
 */
import type { LoiListItem } from '@/lib/api'
import { SITE_URL } from '@/lib/site'

const loisList = jest.fn()

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  api: {
    deputies: { list: () => Promise.resolve({ total: 0, items: [] }) },
    votes: { list: () => Promise.resolve({ total: 0, items: [], next_cursor: null }) },
    lois: { list: () => loisList() },
  },
}))

import sitemap from '@/app/sitemap'

function loi(o: Partial<LoiListItem>): LoiListItem {
  return {
    dossier_uid: 'DLR5L17N51670', titre: 'Fin de vie', status: 'promulguee', status_label: 'adoptée',
    current_stage: 'PROM', parcours_start: '2025-03-11', parcours_end: '2026-08-18',
    last_scrutin_at: '2026-07-15T00:00:00Z', scrutin_count: 400, headline_scrutin_count: 3, theme: null,
    lois_url: 'https://mon-elu.vercel.app/lois/DLR5L17N51670', ...o,
  }
}

describe('bill pages in the sitemap (#372)', () => {
  it('lists /lois and one URL per bill GET /lois returns, dated by its last scrutin', async () => {
    loisList.mockResolvedValue({ total: 2, limit: 200, offset: 0, items: [loi({}), loi({ dossier_uid: 'DLR5L17N2', last_scrutin_at: null })] })
    const urls = await sitemap()
    expect(urls.map(u => u.url)).toEqual(expect.arrayContaining([`${SITE_URL}/lois`, `${SITE_URL}/lois/DLR5L17N51670`, `${SITE_URL}/lois/DLR5L17N2`]))
    expect(urls.find(u => u.url.endsWith('/DLR5L17N51670'))?.lastModified).toEqual(new Date('2026-07-15T00:00:00Z'))
    expect(urls.find(u => u.url.endsWith('/DLR5L17N2'))?.lastModified).toEqual(new Date('2026-08-18'))
    expect(urls.filter(u => u.url.includes('/lois/'))).toHaveLength(2)
  })

  it('drops the bill entries rather than failing the build when GET /lois fails', async () => {
    loisList.mockRejectedValue(new Error('down'))
    const urls = await sitemap()
    expect(urls.some(u => u.url === `${SITE_URL}/lois`)).toBe(true)
    expect(urls.some(u => u.url.includes('/lois/'))).toBe(false)
  })
})
