import { anDeputyUrl, anDossierUrl } from '@/lib/an'

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
