import type { ReactNode } from 'react'

// Shared information architecture for the top nav (desktop dropdowns) and the
// mobile menu drawer, so both surfaces stay in sync.

interface NavEntryBase {
  label: string
  description: string
  icon: ReactNode
}

/** A route within the site. */
export type NavLinkEntry = NavEntryBase & { kind: 'link'; href: string }
/** An absolute URL, opened in a new tab. */
export type NavExternalEntry = NavEntryBase & { kind: 'external'; href: string }
/** Runs something instead of navigating. */
export type NavActionEntry = NavEntryBase & { kind: 'action'; action: 'search' }

// A discriminated union, not optional `href`/`external`/`action` fields on one
// shape — the previous shape let an entry compile with none of the three set
// and only fail at render, force-unwrapping `href` with `!`.
export type NavEntry = NavLinkEntry | NavExternalEntry | NavActionEntry

export interface NavSection {
  /** Column heading. Omitted for single-section menus, which need no label. */
  title?: string
  entries: NavEntry[]
  /** Lay the entries out as a 2-column grid instead of a single column. */
  grid?: boolean
}

export const API_DOCS_URL = 'https://monelu-production.up.railway.app/docs'

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

const SearchIcon = (
  <svg {...iconProps}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
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

const InfoIcon = (
  <svg {...iconProps}><circle cx="12" cy="12" r="9" /><line x1="12" y1="11" x2="12" y2="17" /><circle cx="12" cy="7.5" r="0.8" fill="currentColor" stroke="none" /></svg>
)

/** The "Explorer" mega-menu — the parliament itself, plus the ways into it. */
export const exploreSections: NavSection[] = [
  {
    title: 'Parlement',
    entries: [
      { kind: 'link', href: '/deputes', label: 'Députés', description: 'Annuaire des 577 élus', icon: DeputyIcon },
      { kind: 'link', href: '/deputes/comparer', label: 'Comparer', description: 'Deux élus, vote par vote', icon: CompareIcon },
      { kind: 'link', href: '/votes', label: 'Votes', description: 'Chaque scrutin, décrypté et sourcé', icon: VoteIcon },
    ],
  },
  {
    title: 'Outils',
    entries: [
      { kind: 'action', action: 'search', label: 'Rechercher', description: 'Un député, un vote, une question — ⌘K', icon: SearchIcon },
      { kind: 'external', href: API_DOCS_URL, label: 'API Explorer', description: 'Interroger les données en direct', icon: CodeIcon },
    ],
  },
]

/** The "À propos" menu — the project and everything around the data, 2×2. */
export const aboutSections: NavSection[] = [
  {
    grid: true,
    entries: [
      { kind: 'link', href: '/a-propos', label: 'À propos', description: 'Pourquoi MonÉlu existe', icon: InfoIcon },
      { kind: 'link', href: '/donnees', label: 'Données', description: 'Sources officielles, mises à jour en continu', icon: DataIcon },
      { kind: 'link', href: '/developpeurs', label: 'Développeurs', description: 'API publique et documentation', icon: CodeIcon },
      { kind: 'link', href: '/methodologie', label: 'Méthodologie', description: 'Comment les scores sont calculés', icon: MethodIcon },
    ],
  },
]

/** Top-level links shown flat between the two dropdown triggers. */
export const topLinks = [
  { href: '/quiz', label: 'Quiz' },
  { href: '/chat', label: 'Chat IA' },
]

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/')
}

/** External links and actions never count as the active entry. */
export function isEntryActive(entry: NavEntry, pathname: string): boolean {
  return entry.kind === 'link' && isActivePath(pathname, entry.href)
}

/** Internal hrefs a menu covers — drives the active state of its trigger. */
export function sectionHrefs(sections: NavSection[]): string[] {
  return sections.flatMap(s =>
    s.entries.filter((e): e is NavLinkEntry => e.kind === 'link').map(e => e.href)
  )
}
