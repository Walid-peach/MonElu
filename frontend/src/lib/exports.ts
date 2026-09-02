/**
 * The CSV exports MonÉlu publishes, described once (MON-262).
 *
 * Consumed twice: `/donnees` renders each entry as a card a human reads, and
 * `buildDataCatalogJsonLd()` in `@/lib/seo` turns the same entries into
 * `Dataset` blocks a crawler reads. Keeping one array behind both is what makes
 * the structured data a description of the page rather than a parallel copy of
 * it that drifts the first time a column is added to an export.
 *
 * `pattern` is the API path. The two per-entity exports carry `{…}`
 * placeholders and therefore have no single download URL - `href` is null for
 * those, and the markup describes them with an `EntryPoint` url template
 * instead of a `contentUrl` that would not resolve.
 */
import { csvUrl } from '@/lib/api'

export type CsvExport = {
  /** Stable fragment id for the `Dataset` node. Not a page anchor. */
  id: string
  name: string
  /** Direct download URL, or null when the export takes a path parameter. */
  href: string | null
  /** API path, e.g. `/deputies/{deputy_id}/votes.csv`. */
  pattern: string
  /** One sentence on what a row is. Doubles as `Dataset.description`. */
  what: string
  /** Header row, in file order. Doubles as `Dataset.variableMeasured`. */
  columns: string
  keywords: string[]
}

export const CSV_EXPORTS: CsvExport[] = [
  {
    id: 'scorecards',
    name: 'Scorecard de tous les députés',
    href: csvUrl.scorecard(),
    pattern: '/deputies/scorecard.csv',
    what: "Une ligne par député : groupe, département, votes exprimés, taux de présence aux scrutins, participation aux scrutins solennels et aux jours de vote.",
    columns:
      'deputy_id, full_name, party, party_short, department, total_votes, present_votes, presence_rate, votes_for, votes_against, abstentions, votes_for_pct, abstention_pct, eligible_solennels, solennels_cast, solennel_participation_rate, eligible_voting_days, voting_days_present, voting_days_rate',
    keywords: ['députés', 'assiduité', 'présence', 'Assemblée nationale', 'open data'],
  },
  {
    id: 'votes-depute',
    name: "Historique de vote d'un député",
    href: null,
    pattern: '/deputies/{deputy_id}/votes.csv',
    what: "Tous les scrutins auxquels un député pouvait participer, avec sa position sur chacun. Le bouton « CSV » de chaque fiche député pointe vers cet export.",
    columns: 'deputy_id, vote_id, voted_at, vote_title, theme, result, position',
    keywords: ['députés', 'scrutins', 'positions de vote', 'Assemblée nationale', 'open data'],
  },
  {
    id: 'positions-scrutin',
    name: "Positions complètes d'un scrutin",
    href: null,
    pattern: '/votes/{vote_id}/positions.csv',
    what: "La position des 577 députés sur un scrutin donné. Le bouton « CSV » de chaque page de vote pointe vers cet export.",
    columns: 'vote_id, deputy_id, full_name, party, party_short, department, position',
    keywords: ['scrutins', 'positions de vote', 'députés', 'Assemblée nationale', 'open data'],
  },
]
