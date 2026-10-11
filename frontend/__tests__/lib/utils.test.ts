import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  formatDate, formatPct, getInitials, groupVotesByParty, normalizePartyShort, partyHex, partyHexStatic,
  partyShort, SHORT_TO_FULL_PARTY,
} from '@/lib/utils'

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
  it('resolves a full party name to a theme-aware CSS var (MON-197)', () => {
    expect(partyHex('Rassemblement National')).toBe('var(--party-rn)')
  })

  it('resolves a short code to the same color as its full name', () => {
    expect(partyHex('RN')).toBe(partyHex('Rassemblement National'))
    expect(partyHex('LFI')).toBe(partyHex('La France insoumise - Nouveau Front Populaire'))
  })

  it('returns fallback gray for null', () => {
    expect(partyHex(null)).toBe('var(--dp-text-muted)')
  })

  it('returns fallback gray for an unrecognized value', () => {
    expect(partyHex('PO838901')).toBe('var(--dp-text-secondary)')
  })
})

// OG images cannot read CSS variables, so partyHexStatic() repeats the light
// --party-* values; a group recolored in globals.css alone (#550) would keep
// its old color on every share card.
describe('partyHexStatic', () => {
  const css = readFileSync(join(__dirname, '../../src/app/globals.css'), 'utf8')
  const root = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')))

  it.each(Object.entries(SHORT_TO_FULL_PARTY))('%s matches its light --party-* value', (short, full) => {
    const match = root.match(new RegExp(`--party-${short.toLowerCase()}:\\s*(#[0-9A-Fa-f]{6});`))
    expect(match).not.toBeNull()
    expect(partyHexStatic(full).toUpperCase()).toBe(match![1].toUpperCase())
  })
})

// Party colors are bar fills and dots, so each needs 3:1 against the surface
// it sits on (WCAG 1.4.11): white cards in light mode. In dark mode they are
// also written as text, so MON-197 holds them to 4.5:1 on --dp-card-bg.
describe('party colors contrast', () => {
  const css = readFileSync(join(__dirname, '../../src/app/globals.css'), 'utf8')
  // The selector's own rule, not its first mention (`.dark` also appears in
  // comments and nested selectors).
  const block = (selector: RegExp) => {
    const start = css.search(selector)
    return css.slice(start, css.indexOf('\n}', start))
  }
  const vars = (text: string) =>
    Object.fromEntries([...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+):\s*(#[0-9A-Fa-f]{6});/g)].map(m => [m[1], m[2]]))
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map(i => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }
  const light = vars(block(/:root\s*\{/))
  const dark = { ...light, ...vars(block(/\.dark\s*\{/)) }

  it.each(Object.keys(SHORT_TO_FULL_PARTY))('%s reaches 3:1 on white and 4.5:1 on the dark card', short => {
    const name = `--party-${short.toLowerCase()}`
    expect(contrast(light[name], light['--dp-card-bg'])).toBeGreaterThanOrEqual(3)
    expect(contrast(dark[name], dark['--dp-card-bg'])).toBeGreaterThanOrEqual(4.5)
  })
})
