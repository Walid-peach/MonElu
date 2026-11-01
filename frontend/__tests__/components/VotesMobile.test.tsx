import { fireEvent, render, screen, within } from '@testing-library/react'

import { VotesMobile } from '@/app/votes/VotesMobile'
import type { Vote } from '@/lib/api'

const vote: Vote = {
  vote_id: '1234',
  vote_title: "L'ensemble du projet de loi de finances",
  result: 'rejeté',
  voted_at: '2026-10-20T00:00:00Z',
  votes_for: 200,
  votes_against: 300,
  abstentions: 20,
  total_voters: 520,
  summary_plain: 'Le budget 2027',
  theme: 'Économie & Budget',
}

function renderView(extra: Partial<Parameters<typeof VotesMobile>[0]> = {}) {
  const handlers = { onFilter: jest.fn(), onInput: jest.fn(), onSearch: jest.fn(), onPage: jest.fn() }
  const view = render(
    <VotesMobile
      votes={[vote]}
      total={1200}
      result=""
      theme=""
      themes={['Économie & Budget', 'Santé & Social']}
      inputVal=""
      page={1}
      totalPages={24}
      loadingPhase="none"
      {...handlers}
      {...extra}
    />
  )
  return { ...handlers, ...view }
}

describe('VotesMobile', () => {
  it('is the phone layout only, with its own h1', () => {
    const { container } = renderView()
    expect((container.firstChild as HTMLElement).className).toMatch(/\bmd:hidden\b/)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chaque vote, en clair.')
  })

  it('shows each vote as a card with its result', () => {
    renderView()
    const card = screen.getByRole('link', { name: /Le budget 2027/ })
    expect(card).toHaveAttribute('href', '/votes/1234')
    expect(within(card).getByText('Rejeté')).toBeInTheDocument()
    expect(within(card).getByText('Scrutin n°1234')).toBeInTheDocument()
    expect(within(card).getByText('Économie')).toBeInTheDocument()
  })

  it('hands filters, search and paging back to the shared logic', () => {
    const { onFilter, onInput, onSearch, onPage } = renderView()
    fireEvent.click(screen.getByRole('button', { name: 'Rejetés' }))
    expect(onFilter).toHaveBeenCalledWith('rejeté', '')
    fireEvent.click(screen.getByRole('button', { name: 'Santé' }))
    expect(onFilter).toHaveBeenCalledWith('', 'Santé & Social')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'budget' } })
    expect(onInput).toHaveBeenCalledWith('budget')
    fireEvent.submit(screen.getByRole('search'))
    expect(onSearch).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Plus récents/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Plus anciens/ }))
    expect(onPage).toHaveBeenCalledWith(2)
  })

  it('says when the list is loading or empty', () => {
    const { rerender } = renderView({ loadingPhase: 'inline' })
    expect(screen.getByRole('status')).toHaveTextContent('Chargement des scrutins')
    rerender(
      <VotesMobile votes={[]} total={0} result="" theme="" themes={[]} onFilter={jest.fn()} inputVal="" onInput={jest.fn()}
        onSearch={jest.fn()} page={1} totalPages={0} onPage={jest.fn()} loadingPhase="none" />
    )
    expect(screen.getByText('Aucun scrutin trouvé.')).toBeInTheDocument()
  })
})
