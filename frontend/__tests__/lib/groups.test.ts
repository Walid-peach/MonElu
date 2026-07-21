import { groupName, groupSlug } from '@/lib/groups'

describe('groupName', () => {
  it('maps a canonical slug to its full label', () => {
    expect(groupName('rassemblement-national')).toBe('Rassemblement National')
    expect(groupName('lfi-nfp')).toBe('La France insoumise - Nouveau Front Populaire')
    expect(groupName('liot')).toBe('Libertés, Indépendants, Outre-mer et Territoires')
    expect(groupName('non-inscrits')).toBe('Non inscrit')
  })

  it('normalizes case and surrounding whitespace', () => {
    expect(groupName('Rassemblement-National')).toBe('Rassemblement National')
    expect(groupName('  liot  ')).toBe('Libertés, Indépendants, Outre-mer et Territoires')
  })

  it('returns null for unknown slugs', () => {
    expect(groupName('does-not-exist')).toBeNull()
    expect(groupName('renaissance')).toBeNull()
  })
})

describe('groupSlug', () => {
  it('maps a canonical label to its slug', () => {
    expect(groupSlug('Rassemblement National')).toBe('rassemblement-national')
    expect(groupSlug('Non inscrit')).toBe('non-inscrits')
  })

  it('returns null for null, undefined, and unknown values', () => {
    expect(groupSlug(null)).toBeNull()
    expect(groupSlug(undefined)).toBeNull()
    expect(groupSlug('Not A Real Group')).toBeNull()
  })

  it('accepts the short code used by vote breakdowns (party_short)', () => {
    expect(groupSlug('RN')).toBe('rassemblement-national')
    expect(groupSlug('LFI')).toBe('lfi-nfp')
    expect(groupSlug('LIOT')).toBe('liot')
  })
})
