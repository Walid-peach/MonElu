import { fireEvent, render, screen } from '@testing-library/react'

import { AgendaMobile } from '@/app/agenda/AgendaMobile'
import type { AgendaDay, AgendaItem } from '@/lib/api'

function item(uid: string, objet: string, start: string): AgendaItem {
  return {
    point_uid: uid, sitting_start: start, sitting_end: null, objet, point_type: 'Discussion',
    summary_plain: null, theme: null, dossier_id: null, dossier_url: null, vote_id: null, result: null,
  }
}

const days: AgendaDay[] = [
  { sitting_date: '2026-10-27', items: [item('a', 'Projet de loi de finances pour 2027', '2026-10-27T13:00:00Z')] },
  {
    sitting_date: '2026-10-28',
    items: Array.from({ length: 6 }, (_, i) => item(`b${i}`, `Proposition de loi numéro ${i}`, '2026-10-28T13:00:00Z')),
  },
]

describe('AgendaMobile', () => {
  it('is the phone layout only, with its own h1', () => {
    const { container } = render(<AgendaMobile days={days} empty={null} />)
    expect((container.firstChild as HTMLElement).className).toMatch(/\bmd:hidden\b/)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Cette semaine dans l'hémicycle")
  })

  it('shows every point of the chosen day', () => {
    render(<AgendaMobile days={days} empty={null} />)
    expect(screen.getByText('Projet de loi de finances pour 2027')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /MER 28/ }))
    expect(screen.getByRole('button', { name: /MER 28/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText(/^Proposition de loi numéro \d$/)).toHaveLength(6)
  })

  it('falls back to the empty state', () => {
    render(<AgendaMobile days={[]} empty={<p>Aucune séance</p>} />)
    expect(screen.getByText('Aucune séance')).toBeInTheDocument()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })
})
