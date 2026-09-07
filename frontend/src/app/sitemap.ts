import type { MetadataRoute } from 'next'
import { api, type Deputy, type Vote } from '@/lib/api'
import { departmentCode } from '@/lib/departments'
import { THEME_ENTRIES } from '@/lib/themes'
import { GROUP_ENTRIES } from '@/lib/groups'
import { SITE_URL } from '@/lib/site'

const PAGE_SIZE = 200
const OFFSET_CAP = 2000 // api.votes.list() rejects offset beyond this — see api/routers/votes.py

export const revalidate = 3600

function toDeputyUrl(d: Deputy): MetadataRoute.Sitemap[number] {
  return {
    url: `${SITE_URL}/deputes/${d.deputy_id}`,
    lastModified: new Date(d.mandate_end ?? d.mandate_start ?? Date.now()),
    changeFrequency: 'daily',
    priority: 0.7,
  }
}

function toVoteUrl(v: Vote): MetadataRoute.Sitemap[number] {
  return {
    url: `${SITE_URL}/votes/${v.vote_id}`,
    lastModified: new Date(v.voted_at ?? Date.now()),
    changeFrequency: 'monthly',
    priority: 0.6,
  }
}

async function deputyAndDepartmentUrls(): Promise<MetadataRoute.Sitemap> {
  const first = await api.deputies.list({ limit: PAGE_SIZE, offset: 0 })
  const offsets: number[] = []
  for (let offset = PAGE_SIZE; offset < first.total; offset += PAGE_SIZE) offsets.push(offset)

  const rest = await Promise.all(
    offsets.map(offset => api.deputies.list({ limit: PAGE_SIZE, offset }))
  )
  const deputies = [first, ...rest].flatMap(page => page.items)

  // Department pages (MON-107), derived from the same fetch so only
  // departments that actually have deputies get a sitemap entry.
  const codes = new Set<string>()
  for (const d of deputies) {
    const code = departmentCode(d.department)
    if (code) codes.add(code)
  }
  const departmentUrls: MetadataRoute.Sitemap = [...codes].sort().map(code => ({
    url: `${SITE_URL}/departements/${code}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  return [...deputies.map(toDeputyUrl), ...departmentUrls]
}

async function voteUrls(): Promise<MetadataRoute.Sitemap> {
  // First 2000 votes: offset-based pages fetched in parallel (offset is capped
  // server-side at OFFSET_CAP). Anything beyond that walks the keyset `before`
  // cursor sequentially, since deep pagination has no parallel-safe offset.
  const offsets: number[] = []
  for (let offset = 0; offset < OFFSET_CAP; offset += PAGE_SIZE) offsets.push(offset)

  const offsetPages = await Promise.all(
    offsets.map(offset => api.votes.list({ limit: PAGE_SIZE, offset }))
  )
  const urls = offsetPages.flatMap(page => page.items.map(toVoteUrl))

  let cursor = offsetPages.at(-1)?.next_cursor ?? undefined
  while (cursor) {
    const page = await api.votes.list({ limit: PAGE_SIZE, before: cursor })
    urls.push(...page.items.map(toVoteUrl))
    cursor = page.next_cursor ?? undefined
  }

  return urls
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticUrls: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/deputes`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/deputes/tableau`, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE_URL}/donnees`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/votes`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/mon-depute`, changeFrequency: 'monthly', priority: 0.6 },
    ...THEME_ENTRIES.map(({ slug }) => ({
      url: `${SITE_URL}/themes/${slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...GROUP_ENTRIES.map(({ slug }) => ({
      url: `${SITE_URL}/groupes/${slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    { url: `${SITE_URL}/chat`, changeFrequency: 'monthly', priority: 0.5 },
    // /quiz only. The /quiz/s/*, /chat/s/* and /verifier/v/* share snapshots
    // stay out of the sitemap AND out of the index (ADR-036, MON-264): they
    // are an unmoderated, user-submitted corpus, so each page declares
    // `robots: { index: false }` rather than relying on this omission alone.
    { url: `${SITE_URL}/quiz`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/a-propos`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/developpeurs`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/methodologie`, changeFrequency: 'monthly', priority: 0.5 },
  ]

  const [deputiesAndDepartments, votes] = await Promise.all([
    deputyAndDepartmentUrls(),
    voteUrls(),
  ])

  return [...staticUrls, ...deputiesAndDepartments, ...votes]
}
