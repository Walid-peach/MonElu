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


export function groupVotesByParty(
  positions: Array<{ party: string; position: string }>
): Record<string, Record<string, number>> {
  const map: Record<string, Record<string, number>> = {}
  for (const p of positions) {
    const party = p.party || 'Non inscrit'
    if (!map[party]) map[party] = { pour: 0, contre: 0, abstention: 0, nonVotant: 0 }
    map[party][p.position] = (map[party][p.position] || 0) + 1
  }
  return map
}

export function partyHex(party: string | null): string {
  if (!party) return '#9CA3AF'
  const map: Record<string, string> = {
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
  const color = map[party]
  if (!color && process.env.NODE_ENV === 'development') {
    console.warn(`partyHex: unknown party "${party}", using fallback. Add it to the map in lib/utils.ts.`)
  }
  return color ?? '#6B7280'
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
