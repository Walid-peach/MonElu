import type { MetadataRoute } from 'next'
import { api, type Deputy, type Vote } from '@/lib/api'

const SITE_URL = 'https://mon-elu.vercel.app'
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

async function deputyUrls(): Promise<MetadataRoute.Sitemap> {
  const first = await api.deputies.list({ limit: PAGE_SIZE, offset: 0 })
  const offsets: number[] = []
  for (let offset = PAGE_SIZE; offset < first.total; offset += PAGE_SIZE) offsets.push(offset)

  const rest = await Promise.all(
    offsets.map(offset => api.deputies.list({ limit: PAGE_SIZE, offset }))
  )

  return [first, ...rest].flatMap(page => page.items.map(toDeputyUrl))
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
    { url: `${SITE_URL}/votes`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/chat`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/a-propos`, changeFrequency: 'monthly', priority: 0.4 },
  ]

  const [deputies, votes] = await Promise.all([deputyUrls(), voteUrls()])

  return [...staticUrls, ...deputies, ...votes]
}
