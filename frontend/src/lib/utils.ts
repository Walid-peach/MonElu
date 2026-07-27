export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric'
  })
}

export function formatPct(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

export function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

export function partyShort(party: string | null): string {
  if (!party) return '?'
  const map: Record<string, string> = {
    'Rassemblement National': 'RN',
    'Ensemble pour la République': 'EPR',
    'La France insoumise - Nouveau Front Populaire': 'LFI',
    'Socialistes et apparentés': 'SOC',
    'Droite Républicaine': 'DR',
    'Écologiste et Social': 'ECS',
    'Les Démocrates': 'DEM',
    'Horizons & Indépendants': 'HOR',
    'Libertés, Indépendants, Outre-mer et Territoires': 'LIOT',
    'Union des droites pour la République': 'UDR',
    'Gauche Démocrate et Républicaine': 'GDR',
    'Non inscrit': 'NI',
  }
  return map[party] || party.slice(0, 3).toUpperCase()
}


// Deputies ingested before update_party.py has resolved their group still
// carry the raw AN organe ID in party_short (e.g. "PO838901") — treat that
// as unresolved rather than rendering it as a group name (MON-119).
const RAW_ORGANE_ID = /^PO\d+$/

export function normalizePartyShort(partyShortValue: string | null): string | null {
  if (!partyShortValue || RAW_ORGANE_ID.test(partyShortValue)) return null
  return partyShortValue
}

export function groupVotesByParty(
  positions: Array<{ party_short: string | null; position: string }>
): Record<string, Record<string, number>> {
  const map: Record<string, Record<string, number>> = {}
  for (const p of positions) {
    const party = normalizePartyShort(p.party_short) || 'Non inscrit'
    if (!map[party]) map[party] = { pour: 0, contre: 0, abstention: 0, nonVotant: 0 }
    map[party][p.position] = (map[party][p.position] || 0) + 1
  }
  return map
}

// Raw brand hex, keyed the same as PARTY_HEX below. Needed anywhere CSS
// custom properties can't be resolved — namely next/og's ImageResponse
// (satori), which renders outside the DOM/CSS cascade and has no access to
// globals.css. Use partyHexStatic() there; everywhere else (regular
// browser-rendered React) use partyHex(), which is dark-mode aware.
const PARTY_HEX_STATIC: Record<string, string> = {
  'Rassemblement National':                           '#003189',
  'Ensemble pour la République':                      '#C79A2E',
  'La France insoumise - Nouveau Front Populaire':    '#C9302A',
  'Socialistes et apparentés':                        '#E07A2E',
  'Droite Républicaine':                              '#0066CC',
  'Écologiste et Social':                             '#1F8A5B',
  'Les Démocrates':                                   '#F97316',
  'Horizons & Indépendants':                          '#0D9488',
  'Libertés, Indépendants, Outre-mer et Territoires': '#7C3AED',
  'Union des droites pour la République':             '#DC2626',
  'Gauche Démocrate et Républicaine':                 '#B45309',
}

// MON-197: values are CSS var() references, not raw hex — the vars are
// defined in globals.css with light/dark-mode-adjusted pairs so party colors
// keep sufficient contrast against --dp-card-bg in both themes. A raw hex
// here (as before MON-197) can't respond to the dark theme.
const PARTY_HEX: Record<string, string> = {
  'Rassemblement National':                           'var(--party-rn)',
  'Ensemble pour la République':                      'var(--party-epr)',
  'La France insoumise - Nouveau Front Populaire':    'var(--party-lfi)',
  'Socialistes et apparentés':                        'var(--party-soc)',
  'Droite Républicaine':                              'var(--party-dr)',
  'Écologiste et Social':                             'var(--party-ecs)',
  'Les Démocrates':                                   'var(--party-dem)',
  'Horizons & Indépendants':                          'var(--party-hor)',
  'Libertés, Indépendants, Outre-mer et Territoires': 'var(--party-liot)',
  'Union des droites pour la République':             'var(--party-udr)',
  'Gauche Démocrate et Républicaine':                 'var(--party-gdr)',
}

// party_short values (e.g. "EPR") resolve through this table before the
// PARTY_HEX lookup, so partyHex() works whether it's given a full party
// name (deputy profile pages) or a short code (vote group breakdown).
export const SHORT_TO_FULL_PARTY: Record<string, string> = {
  RN: 'Rassemblement National',
  EPR: 'Ensemble pour la République',
  LFI: 'La France insoumise - Nouveau Front Populaire',
  SOC: 'Socialistes et apparentés',
  DR: 'Droite Républicaine',
  ECS: 'Écologiste et Social',
  DEM: 'Les Démocrates',
  HOR: 'Horizons & Indépendants',
  LIOT: 'Libertés, Indépendants, Outre-mer et Territoires',
  UDR: 'Union des droites pour la République',
  GDR: 'Gauche Démocrate et Républicaine',
}

export function partyHex(party: string | null): string {
  if (!party) return 'var(--dp-text-muted)'
  const fullName = SHORT_TO_FULL_PARTY[party] ?? party
  const color = PARTY_HEX[fullName]
  if (!color && process.env.NODE_ENV === 'development') {
    console.warn(`partyHex: unknown party "${party}", using fallback. Add it to the map in lib/utils.ts.`)
  }
  return color ?? 'var(--dp-text-secondary)'
}

// For next/og ImageResponse (satori) contexts only — see PARTY_HEX_STATIC.
export function partyHexStatic(party: string | null): string {
  if (!party) return '#9CA3AF'
  const fullName = SHORT_TO_FULL_PARTY[party] ?? party
  return PARTY_HEX_STATIC[fullName] ?? '#6B7280'
}

export function themeColors(theme: string | null): { c: string; bg: string } {
  const map: Record<string, { c: string; bg: string }> = {
    'Énergie & Environnement': { c: '#2A5DB0', bg: '#E8EFFE' },
    'Économie & Budget':       { c: '#B45309', bg: '#FEF3C7' },
    'Santé & Social':          { c: '#7C3AED', bg: '#EDE9FE' },
    'Justice & Sécurité':      { c: '#0D7490', bg: '#E0F7FA' },
    'Agriculture':             { c: '#1F8A5B', bg: '#ECFDF5' },
    'Transport & Logement':    { c: '#B45309', bg: '#FFF7ED' },
    'Institutions':            { c: '#374151', bg: '#F2F3F5' },
    'International':           { c: '#374151', bg: '#F2F3F5' },
    'Éducation & Culture':     { c: '#7C3AED', bg: '#EDE9FE' },
    'Autre':                   { c: '#6B7280', bg: '#F3F4F6' },
  }
  return map[theme ?? ''] ?? { c: '#6B7280', bg: '#F3F4F6' }
}

export function partyColor(party: string | null): string {
  if (!party) return 'bg-gray-100 text-gray-600'
  const map: Record<string, string> = {
    'Rassemblement National': 'bg-blue-950 text-blue-100',
    'Ensemble pour la République': 'bg-amber-100 text-amber-900',
    'La France insoumise - Nouveau Front Populaire': 'bg-red-100 text-red-900',
    'Socialistes et apparentés': 'bg-rose-100 text-rose-900',
    'Droite Républicaine': 'bg-sky-100 text-sky-900',
    'Écologiste et Social': 'bg-green-100 text-green-900',
    'Les Démocrates': 'bg-orange-100 text-orange-900',
    'Horizons & Indépendants': 'bg-teal-100 text-teal-900',
  }
  return map[party] || 'bg-gray-100 text-gray-700'
}
