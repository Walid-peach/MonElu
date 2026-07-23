// Slug <-> canonical party label map for /groupes/[slug], mirroring
// api/groups_data.py (ADR-026, MON-150). The 12 labels are the same set
// partyShort() in lib/utils.ts already keys off — this file only adds the
// slug, which has no backend column and is derived from the label alone.
const GROUP_SLUGS: Record<string, string> = {
  'rassemblement-national': 'Rassemblement National',
  'ensemble-pour-la-republique': 'Ensemble pour la République',
  'lfi-nfp': 'La France insoumise - Nouveau Front Populaire',
  'socialistes-et-apparentes': 'Socialistes et apparentés',
  'droite-republicaine': 'Droite Républicaine',
  'ecologiste-et-social': 'Écologiste et Social',
  'les-democrates': 'Les Démocrates',
  'horizons-independants': 'Horizons & Indépendants',
  liot: 'Libertés, Indépendants, Outre-mer et Territoires',
  'union-des-droites': 'Union des droites pour la République',
  'gauche-democrate-republicaine': 'Gauche Démocrate et Républicaine',
  'non-inscrits': 'Non inscrit',
}

/** The 12 canonical labels, in the same order as GROUP_SLUGS — used by the quiz's self-perception picker (MON-182). */
export const CANONICAL_GROUP_LABELS: string[] = Object.values(GROUP_SLUGS)

const NAME_TO_SLUG = new Map(
  Object.entries(GROUP_SLUGS).map(([slug, name]) => [name, slug])
)

/** All (slug, name) pairs for the 12 canonical groups, for sitemap generation. */
export const GROUP_ENTRIES: Array<{ slug: string; name: string }> = Object.entries(
  GROUP_SLUGS
).map(([slug, name]) => ({ slug, name }))

/** Canonical slug for a group name, or null when the party isn't one of the 12 groups (e.g. NULL). */
export function groupSlug(party: string | null | undefined): string | null {
  if (!party) return null
  return NAME_TO_SLUG.get(party.trim()) ?? null
}

/** Canonical party label for a slug (any casing/whitespace), or null if unknown. */
export function groupName(slug: string): string | null {
  return GROUP_SLUGS[slug.trim().toLowerCase()] ?? null
}
