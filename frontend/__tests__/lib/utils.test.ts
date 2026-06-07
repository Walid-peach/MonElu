import { formatDate, formatPct, getInitials, partyShort, partyColor } from '@/lib/utils'

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
