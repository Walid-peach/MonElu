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

  it('lists every day of the week, with every point', () => {
    render(<AgendaMobile days={days} empty={null} />)
    expect(screen.getByText('Projet de loi de finances pour 2027')).toBeInTheDocument()
    expect(screen.getAllByText(/^Proposition de loi numéro \d$/)).toHaveLength(6)
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2)
  })

  it('jumps to a day instead of hiding the others', () => {
    const scrollIntoView = jest.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView
    jest.spyOn(window.HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    render(<AgendaMobile days={days} empty={null} />)
    fireEvent.click(screen.getByRole('button', { name: /MER 28/ }))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0]).toHaveAttribute('data-agenda-day', '2026-10-28')
    expect(screen.getByText('Projet de loi de finances pour 2027')).toBeInTheDocument()
  })

  it('falls back to the empty state', () => {
    render(<AgendaMobile days={[]} empty={<p>Aucune séance</p>} />)
    expect(screen.getByText('Aucune séance')).toBeInTheDocument()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })
})
