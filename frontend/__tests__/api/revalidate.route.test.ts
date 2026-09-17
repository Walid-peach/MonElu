/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

import {
  AGENDA_TAG,
  DEPUTIES_TAG,
  HEALTH_TAG,
  MARTS_TAG,
  POSITIONS_TAG,
  VOTES_TAG,
  VOTE_SUMMARIES_TAG,
} from '@/lib/cacheTags'

const revalidatePath = jest.fn()
const revalidateTag = jest.fn()
jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
}))

const SECRET = 'test-secret' // pragma: allowlist secret

let POST: typeof import('@/app/api/revalidate/route').POST

beforeAll(async () => {
  process.env.REVALIDATE_SECRET = SECRET
  ;({ POST } = await import('@/app/api/revalidate/route'))
})

afterEach(() => jest.clearAllMocks())

const request = (secret: string | null, body?: unknown) =>
  new NextRequest('http://localhost/api/revalidate', {
    method: 'POST',
    headers: secret === null ? {} : { 'x-revalidate-secret': secret },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

const tags = () => revalidateTag.mock.calls.map(([tag]) => tag)

describe('POST /api/revalidate — authentication', () => {
  it('revalidates nothing on a bad secret', async () => {
    const res = await POST(request('wrong-secret'))
    expect(res.status).toBe(401)
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects a scoped call with a bad secret before reading the body', async () => {
    const res = await POST(request('wrong-secret', { families: ['votes'] }))
    expect(res.status).toBe(401)
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})

/**
 * The conservative recovery path. Anything that is not a recognisable scope -
 * no body, a manual `curl`, a payload shape from a future revision - purges
 * everything, so every way of getting this wrong over-purges.
 */
describe('POST /api/revalidate — full purge', () => {
  it('purges every route family when no scope is sent', async () => {
    const res = await POST(request(SECRET))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ revalidated: true, mode: 'full' })
    for (const path of ['/', '/votes', '/deputes', '/deputes/tableau', '/sitemap.xml'])
      expect(revalidatePath).toHaveBeenCalledWith(path)
  })

  // GH #354: the health fetch behind the root-layout freshness badge is on a
  // long time fallback, so this call is what normally refreshes the badge after
  // ingestion. Dropping the tag would leave it stale for hours with no failure.
  it('invalidates the health tag so the freshness badge refreshes', async () => {
    await POST(request(SECRET))
    expect(tags()).toContain(HEALTH_TAG)
  })

  it('falls back to the full purge on a body with no families key', async () => {
    await POST(request(SECRET, { votes: ['VTANR5L17V1'] }))
    expect(revalidatePath).toHaveBeenCalledWith('/')
    expect(tags()).toContain(HEALTH_TAG)
  })

  // What a workflow actually sends when its scope variable is unset:
  // `curl --data ""` is an empty body, not an absent one.
  it('falls back to the full purge on an empty body', async () => {
    const req = new NextRequest('http://localhost/api/revalidate', {
      method: 'POST',
      headers: { 'x-revalidate-secret': SECRET, 'Content-Type': 'application/json' },
      body: '',
    })
    const res = await POST(req)
    expect(await res.json()).toMatchObject({ mode: 'full' })
    expect(revalidatePath).toHaveBeenCalledWith('/')
  })

  it('falls back to the full purge on a malformed body', async () => {
    const req = new NextRequest('http://localhost/api/revalidate', {
      method: 'POST',
      headers: { 'x-revalidate-secret': SECRET },
      body: 'not json',
    })
    await POST(req)
    expect(revalidatePath).toHaveBeenCalledWith('/')
  })
})

describe('POST /api/revalidate — targeted scopes (GH #353)', () => {
  it('purges nothing at all for a no-op ingestion run', async () => {
    const res = await POST(request(SECRET, { families: [] }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ mode: 'targeted', tags: [], paths: [] })
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('leaves deputy, aggregate and snapshot caches alone on a summary update', async () => {
    await POST(request(SECRET, { families: ['summaries'], votes: ['VTANR5L17V1'] }))
    expect(tags()).toEqual(expect.arrayContaining([VOTE_SUMMARIES_TAG, 'vote:VTANR5L17V1']))
    // The health tag is the load-bearing exclusion: the root layout reads
    // /health, so purging it would purge every page on the site.
    expect(tags()).not.toContain(HEALTH_TAG)
    expect(tags()).not.toContain(DEPUTIES_TAG)
    expect(tags()).not.toContain(MARTS_TAG)
    expect(tags()).not.toContain(POSITIONS_TAG)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('purges a corrected deputy and the aggregates, not the vote corpus', async () => {
    await POST(request(SECRET, { families: ['deputies', 'marts'], deputies: ['PA1592'] }))
    expect(tags()).toEqual(expect.arrayContaining([DEPUTIES_TAG, MARTS_TAG, 'deputy:PA1592']))
    expect(tags()).not.toContain(VOTES_TAG)
    expect(tags()).not.toContain(VOTE_SUMMARIES_TAG)
  })

  it('carries the health tag only with the votes family', async () => {
    await POST(request(SECRET, { families: ['votes'], votes: ['VTANR5L17V1'] }))
    expect(tags()).toEqual(expect.arrayContaining([VOTES_TAG, HEALTH_TAG, 'vote:VTANR5L17V1']))
  })

  it('purges the agenda on its own', async () => {
    await POST(request(SECRET, { families: ['agenda'] }))
    expect(tags()).toEqual([AGENDA_TAG])
  })

  it('drops an unknown family instead of failing the purge', async () => {
    const res = await POST(request(SECRET, { families: ['votes', 'chocolate'] }))
    expect(res.status).toBe(200)
    expect(tags()).toEqual(expect.arrayContaining([VOTES_TAG]))
  })

  it('ignores non-string entries in the id lists', async () => {
    await POST(request(SECRET, { families: ['summaries'], votes: ['VT1', 42, null] }))
    expect(tags()).toEqual([VOTE_SUMMARIES_TAG, 'vote:VT1'])
  })
})
