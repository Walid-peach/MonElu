import type { MetadataRoute } from 'next'
import { api } from '@/lib/api'

const SITE_URL = 'https://mon-elu.vercel.app'

export const revalidate = 3600

async function deputyUrls(): Promise<MetadataRoute.Sitemap> {
  const urls: MetadataRoute.Sitemap = []
  const limit = 200
  let offset = 0
  let total = Infinity

  while (offset < total) {
    const page = await api.deputies.list({ limit, offset })
    total = page.total
    for (const d of page.items) {
      urls.push({
        url: `${SITE_URL}/deputes/${d.deputy_id}`,
        lastModified: new Date(d.mandate_end ?? d.mandate_start ?? Date.now()),
        changeFrequency: 'daily',
        priority: 0.7,
      })
    }
    offset += limit
    if (page.items.length === 0) break
  }
  return urls
}

async function voteUrls(): Promise<MetadataRoute.Sitemap> {
  const urls: MetadataRoute.Sitemap = []
  let cursor: string | undefined
  const limit = 200

  do {
    const page = await api.votes.list({ limit, before: cursor })
    for (const v of page.items) {
      urls.push({
        url: `${SITE_URL}/votes/${v.vote_id}`,
        lastModified: new Date(v.voted_at),
        changeFrequency: 'monthly',
        priority: 0.6,
      })
    }
    cursor = page.next_cursor ?? undefined
  } while (cursor)

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
