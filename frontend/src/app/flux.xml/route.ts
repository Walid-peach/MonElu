import { api } from '@/lib/api'
import { FEED_ITEM_COUNT, buildVotesFeed } from '@/lib/feed'

// A one-day fallback (GH #352): the fetch carries the votes and summaries tags,
// so the post-ingestion webhook refreshes the feed without a deploy (#424).
export const revalidate = 86400

export async function GET() {
  const { items } = await api.votes.list({ limit: FEED_ITEM_COUNT })
  return new Response(buildVotesFeed(items), {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  })
}
