import { AN_PORTRAIT_PREFIX, portraitId, portraitSrc, portraitUpstream } from '@/lib/portraits'

const AN = (id: string) => `${AN_PORTRAIT_PREFIX}${id}.jpg`

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
    expect(portraitUpstream('718942.jpg')).toBe(AN('718942'))
    expect(portraitUpstream('718942')).toBe(AN('718942'))
  })

  it('round-trips whatever portraitSrc produced', () => {
    const segment = portraitSrc(AN('718942'))!.split('/').pop()!
    expect(portraitUpstream(segment)).toBe(AN('718942'))
  })

  it('refuses anything that is not a plain numeric id', () => {
    expect(portraitUpstream('..')).toBeNull()
    expect(portraitUpstream('7189/../x')).toBeNull()
    expect(portraitUpstream('718942.png')).toBeNull()
    expect(portraitUpstream('')).toBeNull()
    expect(portraitUpstream('1234567890')).toBeNull()
  })
})
