import { render, screen, within } from '@testing-library/react'

import { GROUP_MEMBERS_SHOWN, GroupMobile } from '@/app/groupes/[slug]/GroupMobile'
import type { GroupDetail, GroupMember } from '@/lib/api'

function member(i: number): GroupMember {
  return {
    deputy_id: `PA${i}`, full_name: `Député ${i}`, party: 'Les Démocrates', party_short: 'DEM',
    department: 'Paris', circonscription: '1', photo_url: null, presence_rate: 0.4, dissident_rate: 0.02,
  }
}

const vote = {
  vote_id: 'V1', voted_at: '2026-10-20', vote_title: 'Le budget 2027', result: 'rejeté',
  pour: 20, contre: 15, abstention: 1, majority_position: 'pour',
}

const data: GroupDetail = {
  slug: 'dem',
  name: 'Les Démocrates',
  member_count: GROUP_MEMBERS_SHOWN + 3,
  members: Array.from({ length: GROUP_MEMBERS_SHOWN + 3 }, (_, i) => member(i)),
  avg_presence_rate: 0.38,
  avg_dissident_rate: 0.04,
  most_dissident_members: [{ ...member(99), full_name: 'Paul Frondeur', dissident_rate: 0.15 }],
  divided_votes: [vote],
  recent_scrutins: [],
}

describe('GroupMobile', () => {
  it('is the phone layout only, with presence and cohesion', () => {
    const { container } = render(<GroupMobile data={data} nationalPresenceRate={0.3} />)
    expect((container.firstChild as HTMLElement).className).toMatch(/\bmd:hidden\b/)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Les Démocrates')
    expect(screen.getByText('96 %')).toBeInTheDocument()
    expect(screen.getByText('Présence moyenne (France : 30 %)')).toBeInTheDocument()
  })

  it('shows the divided votes with the group majority and the frondeurs', () => {
    render(<GroupMobile data={data} nationalPresenceRate={null} />)
    const v = screen.getByRole('link', { name: /Le budget 2027/ })
    expect(within(v).getByText('Groupe · Pour')).toBeInTheDocument()
    expect(within(v).getByText('Rejeté')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Paul Frondeur/ })).toHaveTextContent('15 %')
    expect(screen.queryByText('Comment le groupe a voté')).not.toBeInTheDocument()
  })

  it('folds members beyond the first ones behind a disclosure', () => {
    render(<GroupMobile data={data} nationalPresenceRate={null} />)
    expect(screen.getByText('Voir les 3 autres').tagName).toBe('SUMMARY')
    expect(screen.getAllByRole('link', { name: /Député \d+/ })).toHaveLength(GROUP_MEMBERS_SHOWN + 3)
  })
})
