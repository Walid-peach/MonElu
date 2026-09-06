import {
  addDays,
  agendaHeadline,
  agendaItemHref,
  formatSittingDay,
  formatSittingTime,
  isSubstantive,
  parisToday,
  showsPointType,
} from '@/lib/agenda'
import type { AgendaItem } from '@/lib/api'

function item(overrides: Partial<AgendaItem> = {}): AgendaItem {
  return {
    point_uid: 'PT1',
    sitting_start: '2026-09-02T13:00:00+00:00',
    sitting_end: null,
    objet: 'Suite de la discussion du projet de loi de financement de la sécurité sociale',
    point_type: 'Discussion générale',
    summary_plain: null,
    theme: null,
    dossier_id: 'DLR5L17N52985',
    dossier_url: 'https://www.assemblee-nationale.fr/dyn/17/dossiers/DLR5L17N52985',
    vote_id: null,
    result: null,
    ...overrides,
  }
}

describe('parisToday', () => {
  // The server renders in UTC; the sitting calendar is a Paris calendar. At
  // 23:30 UTC in summer it is already tomorrow in Paris, and "cette semaine"
  // must roll over with Paris, not with the host.
  it('uses the Paris calendar day, not the host one', () => {
    expect(parisToday(new Date('2026-09-02T23:30:00Z'))).toBe('2026-09-03')
    expect(parisToday(new Date('2026-09-02T12:00:00Z'))).toBe('2026-09-02')
  })
})

describe('addDays', () => {
  it('walks plain calendar dates across a month boundary', () => {
    expect(addDays('2026-08-30', 7)).toBe('2026-09-06')
  })

  // Plain-date arithmetic, so the DST switch does not eat or add a day.
  it('is unaffected by the DST change', () => {
    expect(addDays('2026-10-24', 7)).toBe('2026-10-31')
  })
})

describe('formatSittingDay', () => {
  it('renders a sitting_date as a French long date', () => {
    expect(formatSittingDay('2026-09-02')).toBe('Mercredi 2 septembre 2026')
  })

  it('drops the year for the compact homepage teaser', () => {
    // Only the weekday: French does not capitalize month names.
    expect(formatSittingDay('2026-09-02', { withYear: false })).toBe('Mercredi 2 septembre')
  })
})

describe('formatSittingTime', () => {
  it('renders the Paris wall-clock time', () => {
    expect(formatSittingTime('2026-09-02T13:00:00+00:00')).toBe('15h00')
  })

  it('returns null rather than "Invalid Date" for missing or broken input', () => {
    expect(formatSittingTime(null)).toBeNull()
    expect(formatSittingTime('pas une date')).toBeNull()
  })
})

describe('agendaHeadline', () => {
  // MON-211 has not shipped, and even once it has, `summary_plain` stays NULL
  // for stub objets — so the official wording has to be the lead, never an
  // empty slot above it.
  it('falls back to the official objet when there is no one-liner', () => {
    const { lead, official } = agendaHeadline(item())
    expect(lead).toContain('projet de loi de financement')
    expect(official).toBeNull()
  })

  it('leads with the one-liner and keeps the objet underneath', () => {
    const { lead, official } = agendaHeadline(item({ summary_plain: 'Le budget de la Sécu.' }))
    expect(lead).toBe('Le budget de la Sécu.')
    expect(official).toContain('Suite de la discussion')
  })

  it('never renders an empty headline', () => {
    expect(agendaHeadline(item({ objet: null, summary_plain: '  ' })).lead.length).toBeGreaterThan(0)
  })
})

describe('agendaItemHref', () => {
  it('prefers the MonÉlu vote page once a scrutin exists', () => {
    expect(agendaItemHref(item({ vote_id: 'VTANR5L17V1234' }))).toBe('/votes/VTANR5L17V1234')
  })

  it('falls back to the official AN dossier', () => {
    expect(agendaItemHref(item())).toContain('assemblee-nationale.fr')
  })

  it('returns null when the item has neither', () => {
    expect(agendaItemHref(item({ dossier_url: null }))).toBeNull()
  })
})

describe('showsPointType', () => {
  // `agenda_items.objet` is often a bare stub equal to the point type, and a
  // row printing "Discussion" as both badge and headline says nothing twice.
  it('hides a point type that only repeats the headline', () => {
    expect(showsPointType('Discussion', 'Discussion')).toBe(false)
    expect(showsPointType('  discussion ', 'Discussion')).toBe(false)
  })

  it('keeps a point type that adds something', () => {
    expect(showsPointType('Vote solennel', 'Projet de loi relatif à la protection des enfants')).toBe(true)
  })

  it('hides a missing point type', () => {
    expect(showsPointType(null, 'Discussion')).toBe(false)
    expect(showsPointType('   ', 'Discussion')).toBe(false)
  })
})

describe('isSubstantive', () => {
  it('rejects a stub objet that only repeats the point type', () => {
    expect(isSubstantive(item({ objet: 'Discussion', point_type: 'Discussion' }))).toBe(false)
  })

  it('accepts an item carrying a one-liner, stub objet or not', () => {
    expect(
      isSubstantive(item({ objet: 'Discussion', point_type: 'Discussion', summary_plain: 'Le budget.' }))
    ).toBe(true)
  })

  it('accepts a real objet', () => {
    expect(isSubstantive(item({ point_type: 'Vote solennel' }))).toBe(true)
    expect(isSubstantive(item({ point_type: null }))).toBe(true)
  })

  it('rejects an item with nothing to say', () => {
    expect(isSubstantive(item({ objet: null, summary_plain: null }))).toBe(false)
  })
})
