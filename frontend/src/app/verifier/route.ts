import { NextRequest, NextResponse } from 'next/server'

// Per ADR-023, the standalone verifier form is retired in favor of the chat's
// verify mode. A Route Handler guarantees a real HTTP 308, unlike redirect()
// in a Server Component page, which degrades to a client-side-only redirect
// once the parent layout has started streaming.
export function GET(request: NextRequest) {
  const claim = request.nextUrl.searchParams.get('claim')
  const target = new URL('/chat', request.url)
  target.searchParams.set('mode', 'verify')
  if (claim) target.searchParams.set('claim', claim)
  return NextResponse.redirect(target, 308)
}
