import { fireEvent, render, screen, within } from '@testing-library/react'

import { MobileAgenda, MOBILE_AGENDA_ITEMS, dayTab } from '@/components/home/MobileAgenda'
import { MobileSummary } from '@/components/home/MobileSummary'
import { Footer } from '@/components/Footer'
import type { AgendaItem, AgendaResponse } from '@/lib/api'
import { GROUP_ENTRIES } from '@/lib/groups'
import { THEME_ENTRIES } from '@/lib/themes'

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
}))

function item(overrides: Partial<AgendaItem>): AgendaItem {
  return {
    point_uid: Math.random().toString(36),
    sitting_start: '2026-10-26T14:00:00Z',
    sitting_end: null,
    objet: 'Projet de loi de finances',
    point_type: 'Discussion',
    summary_plain: null,
    theme: null,
    dossier_id: null,
    dossier_url: null,
    vote_id: null,
    result: null,
    ...overrides,
  }
}

function agenda(days: Array<{ sitting_date: string; items: AgendaItem[] }>): AgendaResponse {
  return { from_date: '2026-10-25', to_date: '2026-11-01', days }
}

describe('dayTab', () => {
  it('reads the calendar date the API grouped by', () => {
    expect(dayTab('2026-10-26')).toEqual({ weekday: 'LUN', day: '26' })
  })
})

describe('MobileAgenda', () => {
  it('renders nothing when nothing is scheduled', () => {
    const { container } = render(<MobileAgenda agenda={agenda([{ sitting_date: '2026-10-26', items: [] }])} />)
    expect(container).toBeEmptyDOMElement()
    const { container: none } = render(<MobileAgenda agenda={null} />)
    expect(none).toBeEmptyDOMElement()
  })

  it('shows one day at a time and switches on a tab', () => {
    render(
      <MobileAgenda
        agenda={agenda([
          { sitting_date: '2026-10-26', items: [item({ summary_plain: 'Le budget de la Sécurité sociale' })] },
          { sitting_date: '2026-10-27', items: [item({ summary_plain: 'La réforme du logement' })] },
        ])}
      />
    )
    expect(screen.getByText('Le budget de la Sécurité sociale')).toBeInTheDocument()
    expect(screen.queryByText('La réforme du logement')).not.toBeInTheDocument()

    const tuesday = screen.getByRole('tab', { name: /MAR/ })
    fireEvent.click(tuesday)
    expect(tuesday).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('La réforme du logement')).toBeInTheDocument()
    expect(screen.queryByText('Le budget de la Sécurité sociale')).not.toBeInTheDocument()
  })

  it('caps a busy day and points to the full agenda', () => {
    const items = Array.from({ length: MOBILE_AGENDA_ITEMS + 3 }, (_, i) => item({ summary_plain: `Point ${i}` }))
    render(<MobileAgenda agenda={agenda([{ sitting_date: '2026-10-26', items }])} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(MOBILE_AGENDA_ITEMS)
    expect(screen.getByRole('link', { name: /Et 3 autres points/ })).toHaveAttribute('href', '/agenda')
  })

  it('links a voted point to its scrutin with its result', () => {
    render(
      <MobileAgenda
        agenda={agenda([
          { sitting_date: '2026-10-26', items: [item({ summary_plain: 'Le budget', vote_id: 'VTANR5L17V9', result: 'adopté' })] },
        ])}
      />
    )
    const card = screen.getByRole('link', { name: /Le budget/ })
    expect(card).toHaveAttribute('href', '/votes/VTANR5L17V9')
    expect(within(card).getByText('Voté · Adopté')).toBeInTheDocument()
  })
})

describe('MobileSummary', () => {
  const stats = { deputies: 577, votes: 6193, positions: 932000, lastUpdated: 'Mis à jour : 24 octobre' }

  // MON-270: the homepage links every group and theme page; the phone version must too.
  it('links every group and every theme page', () => {
    render(<MobileSummary stats={stats} />)
    for (const { slug } of GROUP_ENTRIES) {
      expect(document.querySelector(`a[href="/groupes/${slug}"]`)).not.toBeNull()
    }
    for (const { slug } of THEME_ENTRIES) {
      expect(document.querySelector(`a[href="/themes/${slug}"]`)).not.toBeNull()
    }
  })

  it('shows the real figures and keeps the presentation in the HTML', () => {
    render(<MobileSummary stats={stats} />)
    expect(screen.getByText('6 193')).toBeInTheDocument()
    // A closed <details> still holds its text, so a crawler reads it.
    expect(screen.getByText(/ne note pas les députés/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Méthodologie' })).toHaveAttribute('href', '/methodologie')
  })
})

describe('Footer on phones', () => {
  it('keeps the accessibility status wording and the licence link', () => {
    render(<Footer />)
    const phone = screen.getAllByRole('contentinfo')[0]
    expect(phone.className).toContain('md:hidden')
    expect(within(phone).getByRole('link', { name: 'Accessibilité : non conforme' })).toHaveAttribute('href', '/accessibilite')
    expect(within(phone).getByRole('link', { name: 'Licence Ouverte 2.0' })).toHaveAttribute('href', '/licence-donnees')
  })
})
