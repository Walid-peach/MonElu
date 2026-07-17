import { NextRequest, NextResponse } from 'next/server'
import { buildSharedClaim } from '@/lib/shareTarget'

// Web Share Target endpoint (MON-115). The manifest's share_target points the
// OS share sheet here (GET with title/text/url params); the shared content is
// normalized into a claim and lands pre-filled in the chat's verify mode.
// Pre-fill only, never auto-submit: a verification writes an immutable row
// (ADR-022/023), so submission stays a user action.
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const claim = buildSharedClaim(params.get('title'), params.get('text'), params.get('url'))
  const target = new URL('/chat', request.url)
  if (claim) {
    target.searchParams.set('mode', 'verify')
    target.searchParams.set('claim', claim)
  }
  // 303: the share is a one-off handoff, not a permanent alias of /chat
  return NextResponse.redirect(target, 303)
}
