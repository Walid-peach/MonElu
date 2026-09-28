import { accountApiFetch } from '@/lib/supabase/accountApi'
import {
  NO_STORE,
  authConfig,
  authError,
  createSupabaseServerClient,
  isSameOrigin,
  noStoreJson,
} from '@/lib/supabase/server'

/**
 * The browser's only door to FastAPI's `/account/*` routes (#415, ADR-040 §4).
 *
 * Reads the session from the httpOnly cookie, forwards its access token as a
 * bearer, and relays the answer. The API verifies that token itself (#413);
 * this handler never tells it who the caller is. `GET /api/account/export`
 * becomes `GET /account/export`, and so on for every account route.
 *
 * Per-user: never cached, no `revalidate`, and every response `private,
 * no-store` (GH #352).
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Ids and slugs only - no dots, slashes or encodings that could walk out of `/account`. */
const SEGMENT = /^[A-Za-z0-9_-]{1,64}$/

/** Upstream headers worth relaying; the export needs its filename. */
const RELAYED_HEADERS = ['content-type', 'content-disposition'] as const

type Context = { params: Promise<{ path: string[] }> }

async function proxy(req: Request, { params }: Context): Promise<Response> {
  if (req.method !== 'GET' && !isSameOrigin(req)) return noStoreJson({ error: 'unknown' }, 403)

  const { path } = await params
  if (!path.length || !path.every(segment => SEGMENT.test(segment))) {
    return noStoreJson({ error: 'unknown' }, 404)
  }

  const config = authConfig()
  if (!config) return authError('unavailable')

  let accessToken: string | undefined
  try {
    const supabase = await createSupabaseServerClient(config)
    // Unverified here on purpose: the API verifies the signature, expiry,
    // audience and issuer before trusting a byte of it.
    const { data } = await supabase.auth.getSession()
    accessToken = data.session?.access_token
  } catch {
    return authError('unavailable')
  }
  if (!accessToken) return authError('signed_out')

  const hasBody = !['GET', 'HEAD', 'DELETE'].includes(req.method)
  let upstream: Response
  try {
    upstream = await accountApiFetch(`/${path.join('/')}`, accessToken, {
      method: req.method,
      body: hasBody ? await req.text() : null,
      contentType: hasBody ? req.headers.get('content-type') : null,
    })
  } catch {
    return authError('unavailable')
  }

  // A 401 means the API no longer accepts this session (expired, or the
  // account was deleted); a 5xx is ours to explain, not the API's to show.
  if (upstream.status === 401) {
    upstream.body?.cancel()
    return authError('signed_out')
  }
  if (upstream.status >= 500) {
    upstream.body?.cancel()
    return authError('unavailable')
  }

  const headers = new Headers({ 'Cache-Control': NO_STORE })
  for (const name of RELAYED_HEADERS) {
    const value = upstream.headers.get(name)
    if (value) headers.set(name, value)
  }
  return new Response(upstream.status === 204 ? null : upstream.body, {
    status: upstream.status,
    headers,
  })
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
