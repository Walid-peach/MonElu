import { AN_PORTRAIT_PREFIX, portraitId, portraitSrc, portraitUpstream } from '@/lib/portraits'
import { PORTRAIT_IDS } from '@/lib/portraitIds'

const AN = (id: string) => `${AN_PORTRAIT_PREFIX}${id}.jpg`

/** A real deputy (PA842137). portraitUpstream only serves allowlisted ids
 * since MON-251, so anything exercising it needs one that exists. */
const REAL = '842137'
/** Correct shape, not a deputy — what an attacker enumerating ids sends. */
const INVENTED = '718942'

describe('portraitId', () => {
  it('extracts the numeric id from an AN square-portrait URL', () => {
    expect(portraitId(AN('718942'))).toBe('718942')
  })

  it('returns null for null, undefined and empty values', () => {
    expect(portraitId(null)).toBeNull()
    expect(portraitId(undefined)).toBeNull()
    expect(portraitId('')).toBeNull()
  })

  it('returns null for non-AN hosts and non-portrait paths', () => {
    expect(portraitId('https://example.com/718942.jpg')).toBeNull()
    expect(portraitId('https://www.assemblee-nationale.fr/dyn/other/718942.jpg')).toBeNull()
  })

  it('rejects ids that are not plain numbers', () => {
    expect(portraitId(AN('../../etc/passwd'))).toBeNull()
    expect(portraitId(AN('PA718942'))).toBeNull()
    expect(portraitId(`${AN_PORTRAIT_PREFIX}718942`)).toBe('718942')
  })
})

describe('portraitSrc', () => {
  it('rewrites an AN portrait to the same-origin proxy', () => {
    expect(portraitSrc(AN('718942'))).toBe('/api/portraits/718942.jpg')
  })

  it('returns null when there is no photo', () => {
    expect(portraitSrc(null)).toBeNull()
    expect(portraitSrc(undefined)).toBeNull()
  })

  it('passes unrecognised URLs through unchanged', () => {
    expect(portraitSrc('https://example.com/photo.png')).toBe('https://example.com/photo.png')
  })

  it('keeps the .jpg suffix the service worker matches images by (MON-198)', () => {
    // public/sw.js registers its StaleWhileRevalidate image rule by file
    // extension *before* its NetworkFirst /api/* rule; dropping the suffix
    // would sink avatars into the 16-entry `apis` cache.
    expect(portraitSrc(AN('718942'))).toMatch(/\.jpg$/)
  })

  it('is stable: one URL per deputy regardless of rendered size', () => {
    expect(portraitSrc(AN('1'))).toBe(portraitSrc(AN('1')))
    expect(portraitSrc(AN('1'))).not.toBe(portraitSrc(AN('2')))
  })
})

describe('portraitUpstream', () => {
  it('accepts the <id>.jpg segment portraitSrc emits, and a bare id', () => {
    expect(portraitUpstream(`${REAL}.jpg`)).toBe(AN(REAL))
    expect(portraitUpstream(REAL)).toBe(AN(REAL))
  })

  it('round-trips whatever portraitSrc produced', () => {
    const segment = portraitSrc(AN(REAL))!.split('/').pop()!
    expect(portraitUpstream(segment)).toBe(AN(REAL))
  })

  it('refuses anything that is not a plain numeric id', () => {
    expect(portraitUpstream('..')).toBeNull()
    expect(portraitUpstream('7189/../x')).toBeNull()
    expect(portraitUpstream(`${REAL}.png`)).toBeNull()
    expect(portraitUpstream('')).toBeNull()
    expect(portraitUpstream('1234567890')).toBeNull()
  })

  it('refuses a correctly-shaped id that is not a real deputy (MON-251)', () => {
    // The shape check alone admits a billion ids and the route acts on every
    // one: a function invocation plus an outbound fetch to the AN.
    expect(PORTRAIT_IDS.has(INVENTED)).toBe(false)
    expect(portraitUpstream(INVENTED)).toBeNull()
    expect(portraitUpstream(`${INVENTED}.jpg`)).toBeNull()
    for (const id of ['0', '1', '2', '99', '123456', '999999999']) {
      if (PORTRAIT_IDS.has(id)) continue
      expect(portraitUpstream(id)).toBeNull()
    }
  })
})

describe('the allowlist (MON-251)', () => {
  it('is the real deputy set, not a placeholder', () => {
    // Guards against a truncated or empty regeneration, which would 404 every
    // portrait on the site.
    expect(PORTRAIT_IDS.size).toBeGreaterThan(500)
    expect(PORTRAIT_IDS.has(REAL)).toBe(true)
  })

  it('bounds the id space by orders of magnitude', () => {
    // /^\d{1,9}$/ admits 10^9 - 1 ids; the allowlist admits ~648.
    expect(PORTRAIT_IDS.size).toBeLessThan(2000)
  })
})

describe('portraitSrc stays independent of the allowlist (MON-251)', () => {
  it('still rewrites an unknown id to the proxy rather than passing it through', () => {
    // Passing the raw AN URL through would point next/image straight at the AN
    // host, which is the image-optimization blowout MON-198 removed. A stale
    // allowlist must degrade to a 404 and initials, never to that.
    expect(PORTRAIT_IDS.has(INVENTED)).toBe(false)
    expect(portraitSrc(AN(INVENTED))).toBe(`/api/portraits/${INVENTED}.jpg`)
    expect(portraitId(AN(INVENTED))).toBe(INVENTED)
  })
})
