import { fireEvent, render, screen } from '@testing-library/react'

import { DeputiesMobile, MOBILE_PAGE_SIZE } from '@/app/deputes/DeputiesMobile'
import type { Deputy } from '@/lib/api'

function deputy(i: number, overrides: Partial<Deputy> = {}): Deputy {
  return {
    deputy_id: `PA${i}`,
    full_name: `Député ${i}`,
    first_name: 'Prénom',
    last_name: `${i}`,
    party: i % 2 ? 'Rassemblement National' : 'Les Démocrates',
    department: 'Paris',
    photo_url: null,
    mandate_start: null,
    mandate_end: null,
    ...overrides,
  }
}

function renderView(items: Deputy[], extra: Partial<Parameters<typeof DeputiesMobile>[0]> = {}) {
  const onSearch = jest.fn()
  const onSort = jest.fn()
  render(
    <DeputiesMobile
      total={items.length}
      search=""
      onSearch={onSearch}
      sort="nom"
      onSort={onSort}
      filtered={items}
      groups={[
        { party: 'Rassemblement National', count: items.filter(d => d.party === 'Rassemblement National').length },
        { party: 'Les Démocrates', count: items.filter(d => d.party === 'Les Démocrates').length },
      ]}
      postalNotFound={false}
      departmentLink={null}
      {...extra}
    />
  )
  return { onSearch, onSort }
}

describe('DeputiesMobile', () => {
  it('is the phone layout only, with its own h1', () => {
    const { container } = render(
      <DeputiesMobile total={0} search="" onSearch={jest.fn()} sort="nom" onSort={jest.fn()} filtered={[]} groups={[]} postalNotFound={false} departmentLink={null} />
    )
    expect((container.firstChild as HTMLElement).className).toMatch(/\bmd:hidden\b/)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chaque député, vote par vote.')
  })

  it('pages the list with "Afficher plus"', () => {
    const items = Array.from({ length: MOBILE_PAGE_SIZE + 5 }, (_, i) => deputy(i))
    renderView(items)
    expect(screen.getAllByRole('link', { name: /Député \d+/ })).toHaveLength(MOBILE_PAGE_SIZE)
    fireEvent.click(screen.getByRole('button', { name: /Afficher plus \(5 restants\)/ }))
    expect(screen.getAllByRole('link', { name: /Député \d+/ })).toHaveLength(MOBILE_PAGE_SIZE + 5)
  })

  it('filters by group with the chips', () => {
    const items = Array.from({ length: 6 }, (_, i) => deputy(i))
    renderView(items)
    fireEvent.click(screen.getByRole('button', { name: /^RN · 3$/ }))
    expect(screen.getAllByRole('link', { name: /Député \d+/ })).toHaveLength(3)
    expect(screen.getByRole('button', { name: /^RN · 3$/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('hands search and sort back to the shared logic', () => {
    const { onSearch, onSort } = renderView([deputy(1)])
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Paris' } })
    expect(onSearch).toHaveBeenCalledWith('Paris')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'parti' } })
    expect(onSort).toHaveBeenCalledWith('parti')
  })

  it('links each deputy and marks former ones', () => {
    renderView([deputy(1, { mandate_end: '2025-01-01' })])
    expect(screen.getByRole('link', { name: /Député 1/ })).toHaveAttribute('href', '/deputes/PA1')
    expect(screen.getByText('Ancien')).toBeInTheDocument()
  })
})
