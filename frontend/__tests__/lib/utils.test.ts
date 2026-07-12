import { formatDate, formatPct, getInitials, groupVotesByParty, normalizePartyShort, partyColor, partyHex, partyShort } from '@/lib/utils'

describe('formatDate', () => {
  it('formats a valid ISO date in French locale', () => {
    expect(formatDate('2025-06-01T00:00:00Z')).toMatch(/juin/)
  })

  it('includes day, month and year', () => {
    const result = formatDate('2025-01-15T00:00:00Z')
    expect(result).toMatch(/2025/)
    expect(result).toMatch(/janvier/)
  })
})

describe('formatPct', () => {
  it('multiplies fraction by 100 and appends %', () => {
    expect(formatPct(0.75)).toBe('75%')
  })

  it('rounds to nearest integer', () => {
    expect(formatPct(0.333)).toBe('33%')
    expect(formatPct(0.999)).toBe('100%')
  })

  it('handles zero', () => {
    expect(formatPct(0)).toBe('0%')
  })
})

describe('getInitials', () => {
  it('returns first letters of each word, up to 2', () => {
    expect(getInitials('Jean Dupont')).toBe('JD')
  })

  it('uppercases result', () => {
    expect(getInitials('jean dupont')).toBe('JD')
  })

  it('handles single name', () => {
    expect(getInitials('Dupont')).toBe('D')
  })

  it('caps at 2 initials for names with many parts', () => {
    expect(getInitials('Yaël Marie Braun-Pivet')).toBe('YM')
  })
})

describe('partyShort', () => {
  it('returns known party abbreviation', () => {
    expect(partyShort('Rassemblement National')).toBe('RN')
    expect(partyShort('Ensemble pour la République')).toBe('EPR')
    expect(partyShort('La France insoumise - Nouveau Front Populaire')).toBe('LFI')
  })

  it('returns ? for null', () => {
    expect(partyShort(null)).toBe('?')
  })

  it('falls back to first 3 chars uppercase for unknown party', () => {
    expect(partyShort('Mouvement Indépendant')).toBe('MOU')
  })
})

describe('normalizePartyShort', () => {
  it('returns a resolved short code as-is', () => {
    expect(normalizePartyShort('EPR')).toBe('EPR')
  })

  it('returns null for a raw unresolved organe ID', () => {
    expect(normalizePartyShort('PO838901')).toBeNull()
  })

  it('returns null for null input', () => {
    expect(normalizePartyShort(null)).toBeNull()
  })
})

describe('groupVotesByParty', () => {
  it('groups positions by party_short', () => {
    const result = groupVotesByParty([
      { party_short: 'EPR', position: 'pour' },
      { party_short: 'EPR', position: 'contre' },
      { party_short: 'RN', position: 'contre' },
    ])
    expect(result).toEqual({
      EPR: { pour: 1, contre: 1, abstention: 0, nonVotant: 0 },
      RN: { pour: 0, contre: 1, abstention: 0, nonVotant: 0 },
    })
  })

  it('buckets unresolved raw organe IDs under Non inscrit instead of one row per ID', () => {
    const result = groupVotesByParty([
      { party_short: 'PO838901', position: 'pour' },
      { party_short: 'PO111222', position: 'contre' },
    ])
    expect(result).toEqual({
      'Non inscrit': { pour: 1, contre: 1, abstention: 0, nonVotant: 0 },
    })
  })
})

describe('partyHex', () => {
  it('resolves a full party name to its color', () => {
    expect(partyHex('Rassemblement National')).toBe('#003189')
  })

  it('resolves a short code to the same color as its full name', () => {
    expect(partyHex('RN')).toBe(partyHex('Rassemblement National'))
    expect(partyHex('LFI')).toBe(partyHex('La France insoumise - Nouveau Front Populaire'))
  })

  it('returns fallback gray for null', () => {
    expect(partyHex(null)).toBe('#9CA3AF')
  })

  it('returns fallback gray for an unrecognized value', () => {
    expect(partyHex('PO838901')).toBe('#6B7280')
  })
})

describe('partyColor', () => {
  it('returns a Tailwind class string for a known party', () => {
    const cls = partyColor('Rassemblement National')
    expect(cls).toContain('bg-')
    expect(cls).toContain('text-')
  })

  it('returns fallback classes for null', () => {
    expect(partyColor(null)).toBe('bg-gray-100 text-gray-600')
  })

  it('returns fallback classes for unknown party', () => {
    expect(partyColor('Parti Inconnu')).toBe('bg-gray-100 text-gray-700')
  })
})
