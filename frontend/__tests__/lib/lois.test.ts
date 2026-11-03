import type { LoiActe } from '@/lib/api'
import { collapsedVotesLabel, hasHeadlineScrutin, parcoursSections, stageTitle, statusLabel } from '@/lib/lois'

function acte(o: Partial<LoiActe> & Pick<LoiActe, 'acte_uid' | 'depth' | 'ordinal' | 'code_acte'>): LoiActe {
  return {
    parent_uid: null, libelle: o.code_acte, date_acte: null, statut_label: null,
    scrutins: [], amendement_count: 0, article_count: 0, ...o,
  }
}

const parcours: LoiActe[] = [
  acte({ acte_uid: 'AN1', depth: 0, ordinal: 1, code_acte: 'AN1' }),
  acte({ acte_uid: 'dep', depth: 1, ordinal: 2, code_acte: 'AN1-DEPOT', parent_uid: 'AN1', date_acte: '2025-03-11' }),
  acte({ acte_uid: 'com', depth: 1, ordinal: 3, code_acte: 'AN1-COM', parent_uid: 'AN1' }),
  acte({ acte_uid: 'r1', depth: 2, ordinal: 4, code_acte: 'AN1-COM-FOND-REUNION', parent_uid: 'com', libelle: 'Réunion', date_acte: '2025-04-01' }),
  acte({ acte_uid: 'r2', depth: 2, ordinal: 5, code_acte: 'AN1-COM-FOND-REUNION', parent_uid: 'com', libelle: 'Réunion', date_acte: '2025-04-02' }),
  acte({ acte_uid: 's1', depth: 2, ordinal: 6, code_acte: 'AN1-DEBATS-SEANCE', parent_uid: 'com', libelle: 'Séance', date_acte: '2025-05-01', amendement_count: 3 }),
  acte({ acte_uid: 's2', depth: 2, ordinal: 7, code_acte: 'AN1-DEBATS-SEANCE', parent_uid: 'com', libelle: 'Séance', date_acte: '2025-05-02', amendement_count: 2 }),
  acte({ acte_uid: 'SN1', depth: 0, ordinal: 8, code_acte: 'SN1' }),
  acte({ acte_uid: 'dec', depth: 1, ordinal: 9, code_acte: 'SN1-DEBATS-DEC', parent_uid: 'SN1', date_acte: '2026-01-28', statut_label: 'rejetée' }),
]

describe('parcoursSections (#370)', () => {
  const sections = parcoursSections(parcours)

  it('splits the flat array into its top-level stages, in ordinal order', () => {
    expect(sections.map(s => s.stage?.acte_uid)).toEqual(['AN1', 'SN1'])
    expect(sections[0].rows.map(r => r.acte.acte_uid)).toEqual(['dep', 'com', 'r1', 's1', 's2'])
  })

  it('keeps an undated node as a group heading', () => {
    expect(sections[0].rows[1]).toMatchObject({ kind: 'group' })
  })

  it('folds identical steps with no vote, and never one that carries votes', () => {
    expect(sections[0].rows[2]).toMatchObject({ kind: 'acte', repeats: [{ acte_uid: 'r2' }] })
    expect(sections[0].rows.filter(r => r.acte.code_acte === 'AN1-DEBATS-SEANCE')).toHaveLength(2)
  })

  it('opens a section for actes listed before any stage', () => {
    expect(parcoursSections([parcours[1]])[0].stage).toBeNull()
  })
})

describe('labels', () => {
  it('counts collapsed votes in words', () => {
    expect(collapsedVotesLabel(395, 0)).toBe('395 amendements votés')
    expect(collapsedVotesLabel(1, 0)).toBe('1 amendement voté')
    expect(collapsedVotesLabel(62, 13)).toBe('62 amendements et 13 articles votés')
    expect(collapsedVotesLabel(0, 0)).toBeNull()
  })

  it('names statuses and stages, and shows an unknown status as sent', () => {
    expect(statusLabel('en_navette')).toBe('En navette parlementaire')
    expect(statusLabel('nouveau')).toBe('nouveau')
    expect(stageTitle('SN2')).toBe('Sénat · 2e lecture')
    expect(stageTitle('XYZ')).toBeNull()
  })

  it('knows when a bill has no headline scrutin yet', () => {
    expect(hasHeadlineScrutin({ parcours, unattached_scrutins: [] })).toBe(false)
  })
})
