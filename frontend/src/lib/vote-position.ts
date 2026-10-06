// MON-159: these reference the shared --dp-* CSS variables (globals.css) so
// vote-position badges pick up dark mode automatically on every page that
// already uses that system, rather than staying pastel-on-dark as flagged
// throughout MON-103's dark-mode sub-issues (MON-155/162/163/165/166).
// `color` is text: pour/contre use the badge text tokens, which reach 4.5:1
// on their tint, not --dp-green/--dp-red, which are for bars and seats.
export const POS = {
  pour:       { label: 'Pour',       color: 'var(--dp-badge-pos-text)', bg: 'var(--dp-badge-pos-bg)' },
  contre:     { label: 'Contre',     color: 'var(--dp-badge-neg-text)', bg: 'var(--dp-badge-neg-bg)' },
  abstention: { label: 'Abstention', color: 'var(--dp-text-secondary)', bg: 'var(--dp-track-bg)' },
  nonVotant:  { label: 'Non votant', color: 'var(--dp-text-muted)',     bg: 'var(--dp-track-bg)' },
} as const

export type VotePositionKey = keyof typeof POS

export function positionStyle(position: string) {
  return POS[position as VotePositionKey] ?? POS.nonVotant
}
