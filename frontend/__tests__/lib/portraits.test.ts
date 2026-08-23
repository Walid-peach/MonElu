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
    expect(portraitSrc(AN('718942'))).toBe('/api/portraits/718942')
  })

  it('returns null when there is no photo', () => {
    expect(portraitSrc(null)).toBeNull()
    expect(portraitSrc(undefined)).toBeNull()
  })

  it('passes unrecognised URLs through unchanged', () => {
    expect(portraitSrc('https://example.com/photo.png')).toBe('https://example.com/photo.png')
  })

  it('is stable: one URL per deputy regardless of rendered size', () => {
    expect(portraitSrc(AN('1'))).toBe(portraitSrc(AN('1')))
    expect(portraitSrc(AN('1'))).not.toBe(portraitSrc(AN('2')))
  })
})

describe('portraitUpstream', () => {
  it('builds the AN URL for a valid id', () => {
    expect(portraitUpstream('718942')).toBe(AN('718942'))
  })

  it('refuses anything that is not a plain numeric id', () => {
    expect(portraitUpstream('..')).toBeNull()
    expect(portraitUpstream('7189/../x')).toBeNull()
    expect(portraitUpstream('')).toBeNull()
    expect(portraitUpstream('1234567890')).toBeNull()
  })
})
