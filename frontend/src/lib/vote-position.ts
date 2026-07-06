const RED = '#C9302A'

export const POS = {
  pour:       { label: 'Pour',       color: '#1F8A5B', bg: '#EAF5EF' },
  contre:     { label: 'Contre',     color: RED,        bg: '#FBE9E7' },
  abstention: { label: 'Abstention', color: '#6B7280',  bg: '#F0F1F3' },
  nonVotant:  { label: 'Non votant', color: '#9CA3AF',  bg: '#F5F6F7' },
} as const

export type VotePositionKey = keyof typeof POS

export function positionStyle(position: string) {
  return POS[position as VotePositionKey] ?? POS.nonVotant
}
