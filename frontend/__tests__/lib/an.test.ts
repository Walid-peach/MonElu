import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { anDeputyUrl, anDossierUrl, anScrutinUrl } from '@/lib/an'

describe('anDeputyUrl', () => {
  it('builds the official profile URL from an acteur uid', () => {
    expect(anDeputyUrl('PA842137')).toBe(
      'https://www.assemblee-nationale.fr/dyn/deputes/PA842137'
    )
  })

  it('returns null rather than a guessed URL for anything else', () => {
    expect(anDeputyUrl(null)).toBeNull()
    expect(anDeputyUrl(undefined)).toBeNull()
    expect(anDeputyUrl('')).toBeNull()
    expect(anDeputyUrl('842137')).toBeNull()
    expect(anDeputyUrl('PA842137/../../admin')).toBeNull()
    expect(anDeputyUrl("{'uid': 'PA842137'}")).toBeNull()
  })
})

describe('anDossierUrl', () => {
  it('builds the official dossier URL from a dossier ref', () => {
    expect(anDossierUrl('DLR5L17N53980')).toBe(
      'https://www.assemblee-nationale.fr/dyn/17/dossiers/DLR5L17N53980'
    )
  })

  it('returns null for missing or corrupted refs (ADR-035)', () => {
    expect(anDossierUrl(null)).toBeNull()
    expect(anDossierUrl(undefined)).toBeNull()
    expect(anDossierUrl('')).toBeNull()
    expect(anDossierUrl("{'@xsi:type': 'DossierRef'}")).toBeNull()
  })
})

describe('anScrutinUrl', () => {
  it('builds the official scrutin URL from the legislature and number in the uid (#617)', () => {
    expect(anScrutinUrl('VTANR5L17V9025')).toBe(
      'https://www.assemblee-nationale.fr/dyn/17/scrutins/9025'
    )
    expect(anScrutinUrl('VTANR5L16V1')).toBe(
      'https://www.assemblee-nationale.fr/dyn/16/scrutins/1'
    )
  })

  it('returns null rather than a guessed URL for anything else', () => {
    expect(anScrutinUrl(null)).toBeNull()
    expect(anScrutinUrl(undefined)).toBeNull()
    expect(anScrutinUrl('')).toBeNull()
    expect(anScrutinUrl('9025')).toBeNull()
    expect(anScrutinUrl('VTANR5L17V9025/../admin')).toBeNull()
  })
})

describe('links to the AN site', () => {
  // The bare domain has no DNS record, so a link to it never loads (#619).
  it('always name www.assemblee-nationale.fr', () => {
    const files = (readdirSync(join(process.cwd(), 'src'), { recursive: true }) as string[])
      .filter(f => /\.(ts|tsx)$/.test(f))
    const offenders = files.filter(f =>
      /https?:\/\/assemblee-nationale\.fr/.test(readFileSync(join(process.cwd(), 'src', f), 'utf8'))
    )
    expect(offenders).toEqual([])
  })
})
