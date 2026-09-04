/**
 * @jest-environment node
 */
import { HEALTH_TAG } from '@/lib/cacheTags'

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

const request = (secret: string | null) =>
  new Request('http://localhost/api/revalidate', {
    method: 'POST',
    headers: secret === null ? {} : { 'x-revalidate-secret': secret },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any

describe('POST /api/revalidate', () => {
  // GH #354: the health fetch behind the root-layout freshness badge is on a
  // long time fallback, so this call is what normally refreshes the badge after
  // ingestion. Dropping the tag would leave it stale for hours with no failure.
  it('invalidates the health tag so the freshness badge refreshes after ingestion', async () => {
    const res = await POST(request(SECRET))
    expect(res.status).toBe(200)
    expect(revalidateTag).toHaveBeenCalledWith(HEALTH_TAG)
  })

  it('still revalidates the data route families', async () => {
    await POST(request(SECRET))
    for (const path of ['/', '/votes', '/deputes', '/sitemap.xml'])
      expect(revalidatePath).toHaveBeenCalledWith(path)
  })

  it('revalidates nothing on a bad secret', async () => {
    const res = await POST(request('wrong-secret'))
    expect(res.status).toBe(401)
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
