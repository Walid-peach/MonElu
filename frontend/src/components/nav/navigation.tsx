import type { ReactNode } from 'react'

// Shared information architecture for the top nav (desktop dropdown) and the
// mobile menu drawer, so both surfaces stay in sync.

export interface NavEntry {
  href: string
  label: string
  description: string
  icon: ReactNode
  external?: boolean
}

export interface NavSection {
  title: string
  entries: NavEntry[]
}

const iconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const DeputyIcon = (
  <svg {...iconProps}><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a8 8 0 0 1 16 0v1" /></svg>
)

const CompareIcon = (
  <svg {...iconProps}><path d="M4 20a8 8 0 0 1 16 0" /><path d="M7 20a5 5 0 0 1 10 0" /><circle cx="12" cy="20" r="1.4" fill="currentColor" stroke="none" /></svg>
)

const VoteIcon = (
  <svg {...iconProps}><path d="M3 12h4l3 8 4-16 3 8h4" /></svg>
)

const DataIcon = (
  <svg {...iconProps}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14a8 3 0 0 0 16 0V5" /><path d="M4 12a8 3 0 0 0 16 0" /></svg>
)

const CodeIcon = (
  <svg {...iconProps}><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
)

const MethodIcon = (
  <svg {...iconProps}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></svg>
)

/** The "Explorer" mega-menu — two columns on desktop, two blocks on mobile. */
export const exploreSections: NavSection[] = [
  {
    title: 'Parlement',
    entries: [
      { href: '/deputes', label: 'Députés', description: 'Annuaire des 577 élus', icon: DeputyIcon },
      { href: '/deputes/comparer', label: 'Comparer', description: 'Deux élus, vote par vote', icon: CompareIcon },
      { href: '/votes', label: 'Votes', description: 'Chaque scrutin, décrypté et sourcé', icon: VoteIcon },
    ],
  },
  {
    title: 'Ressources',
    entries: [
      { href: '/donnees', label: 'Données', description: 'Sources officielles, mises à jour en continu', icon: DataIcon },
      { href: '/developpeurs', label: 'Développeurs', description: 'API publique et documentation', icon: CodeIcon },
      { href: '/methodologie', label: 'Méthodologie', description: 'Comment les scores sont calculés', icon: MethodIcon },
    ],
  },
]

/** Top-level links shown flat next to the "Explorer" trigger. */
export const topLinks = [
  { href: '/quiz', label: 'Quiz' },
  { href: '/chat', label: 'Chat IA' },
  { href: '/a-propos', label: 'À propos' },
]

/** Every href reachable through the "Explorer" trigger — drives its active state. */
export const exploreHrefs = exploreSections.flatMap(s => s.entries.map(e => e.href))

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/')
}
