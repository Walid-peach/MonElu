import { departmentCode, departmentLabel, departmentName } from '@/lib/departments'

describe('departmentLabel', () => {
  it('returns null for null, undefined, and empty input', () => {
    expect(departmentLabel(null)).toBeNull()
    expect(departmentLabel(undefined)).toBeNull()
    expect(departmentLabel('')).toBeNull()
    expect(departmentLabel('  ')).toBeNull()
  })

  it('maps a bare metropolitan code to "Name (code)"', () => {
    expect(departmentLabel('69')).toBe('Rhône (69)')
    expect(departmentLabel('01')).toBe('Ain (01)')
    expect(departmentLabel('95')).toBe("Val-d'Oise (95)")
  })

  it('maps Corsica codes', () => {
    expect(departmentLabel('2A')).toBe('Corse-du-Sud (2A)')
    expect(departmentLabel('2b')).toBe('Haute-Corse (2B)')
  })

  it('maps overseas codes missing from the backend map', () => {
    expect(departmentLabel('975')).toBe('Saint-Pierre-et-Miquelon (975)')
    expect(departmentLabel('977')).toBe('Saint-Barthélemy et Saint-Martin (977)')
    expect(departmentLabel('986')).toBe('Wallis-et-Futuna (986)')
    expect(departmentLabel('987')).toBe('Polynésie française (987)')
    expect(departmentLabel('988')).toBe('Nouvelle-Calédonie (988)')
  })

  it('handles the zero-padded citizens-abroad code without a code suffix', () => {
    expect(departmentLabel('099')).toBe('Français établis hors de France')
    expect(departmentLabel('99')).toBe('Français établis hors de France')
  })

  it('appends the code to an already-mapped full name', () => {
    expect(departmentLabel('Rhône')).toBe('Rhône (69)')
    expect(departmentLabel('La Réunion')).toBe('La Réunion (974)')
  })

  it('passes unknown values through unchanged', () => {
    expect(departmentLabel('Français établis hors de France')).toBe(
      'Français établis hors de France'
    )
    expect(departmentLabel('998')).toBe('998')
    expect(departmentLabel('Atlantide')).toBe('Atlantide')
  })
})

describe('departmentCode', () => {
  it('returns null for null, undefined, and empty input', () => {
    expect(departmentCode(null)).toBeNull()
    expect(departmentCode(undefined)).toBeNull()
    expect(departmentCode('')).toBeNull()
  })

  it('canonicalizes raw codes', () => {
    expect(departmentCode('69')).toBe('69')
    expect(departmentCode('2a')).toBe('2A')
    expect(departmentCode('099')).toBe('99')
    expect(departmentCode('971')).toBe('971')
  })

  it('maps full names to their code', () => {
    expect(departmentCode('Gironde')).toBe('33')
    expect(departmentCode('La Réunion')).toBe('974')
    expect(departmentCode('Français établis hors de France')).toBe('99')
  })

  it('returns null for unknown values', () => {
    expect(departmentCode('998')).toBeNull()
    expect(departmentCode('Atlantide')).toBeNull()
  })
})

describe('departmentName', () => {
  it('maps a canonical code to its full name', () => {
    expect(departmentName('33')).toBe('Gironde')
    expect(departmentName('2A')).toBe('Corse-du-Sud')
  })

  it('returns null for unknown codes', () => {
    expect(departmentName('998')).toBeNull()
  })
})
