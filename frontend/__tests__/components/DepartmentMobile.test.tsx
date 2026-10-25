import { render, screen, within } from '@testing-library/react'

import { DepartmentMobile } from '@/app/departements/[code]/DepartmentMobile'
import type { DepartmentDetail } from '@/lib/api'

const data: DepartmentDetail = {
  code: '69',
  name: 'Rhône',
  deputy_count: 2,
  avg_presence_rate: 0.41,
  party_distribution: [
    { party: 'Rassemblement National', count: 1 },
    { party: 'Les Démocrates', count: 1 },
  ],
  most_dissident: {
    deputy_id: 'PA2', full_name: 'Paul Frondeur', party: 'Les Démocrates', party_short: 'DEM', department: 'Rhône',
    circonscription: '3', photo_url: null, presence_rate: 0.5, solennel_participation_rate: 0.6,
    party_alignment_rate: 0.8, dissident_rate: 0.12,
  },
  deputies: [
    {
      deputy_id: 'PA1', full_name: 'Marie Exemple', party: 'Rassemblement National', party_short: 'RN', department: 'Rhône',
      circonscription: '1', photo_url: null, presence_rate: 0.4, solennel_participation_rate: 0.82,
      party_alignment_rate: 0.95, dissident_rate: 0.05,
    },
    {
      deputy_id: 'PA2', full_name: 'Paul Frondeur', party: 'Les Démocrates', party_short: 'DEM', department: 'Rhône',
      circonscription: '3', photo_url: null, presence_rate: 0.5, solennel_participation_rate: null,
      party_alignment_rate: 0.8, dissident_rate: 0.12,
    },
  ],
  split_votes: [
    { vote_id: 'V1', voted_at: '2026-10-20', vote_title: 'Le budget 2027', result: 'adopté', pour: 1, contre: 1, abstention: 0 },
  ],
}

describe('DepartmentMobile', () => {
  it('is the phone layout only, named after the department', () => {
    const { container } = render(<DepartmentMobile data={data} nationalPresenceRate={0.3} />)
    expect((container.firstChild as HTMLElement).className).toMatch(/\bmd:hidden\b/)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Rhône')
    expect(screen.getByText('Département · 69')).toBeInTheDocument()
    expect(screen.getByText('Présence moyenne (France : 30 %)')).toBeInTheDocument()
  })

  it('lists deputies by circonscription with their solemn participation', () => {
    render(<DepartmentMobile data={data} nationalPresenceRate={null} />)
    const marie = screen.getByRole('link', { name: /Marie Exemple/ })
    expect(marie).toHaveAttribute('href', '/deputes/PA1')
    expect(within(marie).getByText('82 %')).toBeInTheDocument()
    expect(within(marie).getByText(', 1ère circonscription')).toBeInTheDocument()
  })

  it('links each group and the votes that split the department', () => {
    render(<DepartmentMobile data={data} nationalPresenceRate={null} />)
    expect(screen.getByRole('link', { name: 'RN' })).toHaveAttribute('href', '/groupes/rassemblement-national')
    const vote = screen.getByRole('link', { name: /Le budget 2027/ })
    expect(vote).toHaveAttribute('href', '/votes/V1')
    expect(within(vote).getByText('Adopté')).toBeInTheDocument()
  })
})
