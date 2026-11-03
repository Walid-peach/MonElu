import { render, screen } from '@testing-library/react'
import type { LoiDetail, LoiScrutin } from '@/lib/api'

const loisGet = jest.fn()

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api')
  return { ...actual, api: { lois: { get: (...args: unknown[]) => loisGet(...args) } } }
})
jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

import LoiPage from '@/app/lois/[dossier_id]/page'
import { ApiError } from '@/lib/api'

const LONG_LABEL =
  "adopté, dans les conditions prévues à l'article 45, alinéa 3, de la Constitution, par l'Assemblée nationale"

function scrutin(o: Partial<LoiScrutin> = {}): LoiScrutin {
  return {
    vote_id: 'VTANR5L17V1', voted_at: '2026-06-30T00:00:00Z',
    vote_title: "l'ensemble de la proposition de loi relative au droit à l'aide à mourir (nouvelle lecture).",
    scrutin_kind: 'ensemble', result: 'adopté', votes_for: 299, votes_against: 226, abstentions: 30,
    summary_plain: null, ...o,
  }
}

function loi(o: Partial<LoiDetail> = {}): LoiDetail {
  return {
    dossier_uid: 'DLR5L17N51670', titre: 'Fin de vie', procedure_label: 'Proposition de loi ordinaire',
    initiateur: null, status: 'promulguee', status_label: LONG_LABEL, current_stage: 'PROM',
    parcours_start: '2025-03-11', parcours_end: '2026-08-18',
    an_dossier_url: 'https://www.assemblee-nationale.fr/dyn/17/dossiers/DLR5L17N51670',
    scrutin_coverage_start: '2026-03-26', parcours_predates_coverage: true, first_scrutin_at: '2026-06-22',
    amendement_count: 395, article_count: 0,
    parcours: [
      { acte_uid: 'AN1', parent_uid: null, depth: 0, ordinal: 1, code_acte: 'AN1', libelle: '1ère lecture', date_acte: null, scrutins: [], amendement_count: 0, article_count: 0 },
      { acte_uid: 'dep', parent_uid: 'AN1', depth: 1, ordinal: 2, code_acte: 'AN1-DEPOT', libelle: "1er dépôt d'une initiative.", date_acte: '2025-03-11', scrutins: [], amendement_count: 0, article_count: 0 },
      { acte_uid: 'seance', parent_uid: 'AN1', depth: 1, ordinal: 3, code_acte: 'AN1-DEBATS-SEANCE', libelle: 'Discussion en séance publique', date_acte: '2026-06-26', scrutins: [], amendement_count: 395, article_count: 0 },
      { acte_uid: 'dec', parent_uid: 'AN1', depth: 1, ordinal: 4, code_acte: 'AN1-DEBATS-DEC', libelle: 'Décision', date_acte: '2026-06-30', statut_label: 'adoptée', scrutins: [scrutin()], amendement_count: 0, article_count: 0 },
    ],
    unattached_scrutins: [], unattached_collapsed_count: 0, ...o,
  }
}

async function renderPage(data: LoiDetail) {
  loisGet.mockResolvedValue(data)
  render(await LoiPage({ params: Promise.resolve({ dossier_id: data.dossier_uid }) }))
}

describe('/lois/[dossier_id] (#370)', () => {
  it('starts the story at the deposit and says why early stages carry no vote', async () => {
    await renderPage(loi())
    expect(screen.getByText("1er dépôt d'une initiative.")).toBeInTheDocument()
    expect(screen.getByText(/ne relie ses scrutins aux textes que depuis le 26 mars 2026/)).toBeInTheDocument()
  })

  it('shows the status badge and the raw label side by side', async () => {
    await renderPage(loi())
    expect(screen.getByText('Promulguée')).toBeInTheDocument()
    expect(screen.getByText(new RegExp(LONG_LABEL.slice(0, 40)))).toHaveClass('break-words')
  })

  it('counts amendment votes instead of listing them', async () => {
    await renderPage(loi())
    expect(screen.getByRole('button', { name: 'Voir les 395 amendements votés' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/l'amendement n°/)).not.toBeInTheDocument()
  })

  it('shows the official title alone when a scrutin has no summary', async () => {
    await renderPage(loi())
    expect(screen.getByText(/l'ensemble de la proposition de loi relative au droit/)).toBeInTheDocument()
    expect(screen.queryByText('Résumé IA')).not.toBeInTheDocument()
  })

  it('labels a summary when there is one', async () => {
    const data = loi()
    data.parcours[3].scrutins = [scrutin({ summary_plain: 'Créer une aide à mourir.', summary_basis: 'official_text' })]
    await renderPage(data)
    expect(screen.getByText('Résumé IA')).toBeInTheDocument()
  })

  it('says plainly when no headline scrutin exists yet', async () => {
    const data = loi({ parcours_predates_coverage: false })
    data.parcours[3].scrutins = []
    await renderPage(data)
    expect(screen.getByText(/Aucun vote sur l'ensemble du texte/)).toBeInTheDocument()
  })

  it('is a 404 for an unknown or unpublished bill', async () => {
    loisGet.mockRejectedValue(new ApiError(404, 'missing'))
    await expect(LoiPage({ params: Promise.resolve({ dossier_id: 'DLR5L17N0' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
