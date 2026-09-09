import type { Metadata } from 'next'
import { ChatClient } from './ChatClient'
import { canonicalUrl } from '@/lib/site'

// Server component so the route can declare its own canonical (MON-269).
// `/chat?q=…` and `/chat?mode=verify&claim=…` are entry points into the same
// document — the canonical points at the bare route so those variants do not
// compete with it in an index.
export const metadata: Metadata = {
  alternates: { canonical: canonicalUrl('/chat') },
}

export default function ChatPage() {
  return <ChatClient />
}
