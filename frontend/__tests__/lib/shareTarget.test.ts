import { buildSharedClaim, SHARED_CLAIM_MAX_LENGTH } from '@/lib/shareTarget'

describe('buildSharedClaim', () => {
  it('combines title and text', () => {
    expect(buildSharedClaim('Titre du jour', 'Le député X a voté contre', null)).toBe(
      'Titre du jour - Le député X a voté contre',
    )
  })

  it('returns empty string when nothing usable is shared', () => {
    expect(buildSharedClaim(null, null, null)).toBe('')
    expect(buildSharedClaim('', '   ', 'https://example.com/article')).toBe('')
  })

  it('strips URLs embedded in the shared text (Android Chrome pattern)', () => {
    expect(
      buildSharedClaim(null, 'Le député X a voté contre https://news.example.com/a?b=c', null),
    ).toBe('Le député X a voté contre')
  })

  it('ignores the url param entirely', () => {
    expect(buildSharedClaim('Un titre', null, 'https://example.com')).toBe('Un titre')
  })

  it('deduplicates when title is repeated inside text', () => {
    expect(buildSharedClaim('Un titre', 'Un titre - avec du contexte', null)).toBe(
      'Un titre - avec du contexte',
    )
    expect(buildSharedClaim('Même chose', 'Même chose', null)).toBe('Même chose')
  })

  it('collapses whitespace and newlines', () => {
    expect(buildSharedClaim(null, 'Ligne 1\n\nLigne  2\t fin', null)).toBe('Ligne 1 Ligne 2 fin')
  })

  it('truncates to the verify input limit', () => {
    const long = 'a'.repeat(SHARED_CLAIM_MAX_LENGTH + 100)
    expect(buildSharedClaim(null, long, null)).toHaveLength(SHARED_CLAIM_MAX_LENGTH)
  })
})
