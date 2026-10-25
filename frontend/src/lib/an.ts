/**
 * URLs on the Assemblée nationale's own site (MON-267).
 *
 * Single definition of the official URLs MonÉlu constructs from ids it
 * already stores. The deputy and dossier URLs are consumed twice - once as a
 * link a reader clicks, once as an entity-reconciliation signal in JSON-LD
 * (`Person.sameAs`, `Event.about`) - and a drift between those two would
 * publish a URL the site itself does not use.
 *
 * All guard on shape and return null rather than a guessed URL: a stored id
 * that does not look like an AN reference silently produces no link instead of
 * a broken one.
 */

/** AN acteur uid, e.g. `PA842137`. */
const ACTEUR_UID = /^PA\d{1,9}$/

/** AN scrutin uid, e.g. `VTANR5L17V9025`: legislature 17, scrutin n° 9025. */
const SCRUTIN_UID = /^VTANR5L(\d{1,3})V(\d{1,9})$/

/** AN dossier ref, e.g. `DLR5L17N53980`. */
const DOSSIER_REF = /^[A-Za-z0-9-]+$/

/**
 * Official profile page of a deputy on assemblee-nationale.fr.
 *
 * Guarded the way `portraitId()` guards: rows ingested before the uid shape was
 * settled, or any future upstream change, yield null.
 */
export function anDeputyUrl(deputyId: string | null | undefined): string | null {
  if (!deputyId || !ACTEUR_UID.test(deputyId)) return null
  return `https://www.assemblee-nationale.fr/dyn/deputes/${deputyId}`
}

/**
 * Official dossier législatif page.
 *
 * Some legacy rows still carry a stringified-dict `dossier_id` from a past
 * ingestion bug (MON-89, ADR-035), which is why the shape check is not
 * optional here.
 */
export function anDossierUrl(dossierId: string | null | undefined): string | null {
  if (!dossierId || !DOSSIER_REF.test(dossierId)) return null
  return `https://www.assemblee-nationale.fr/dyn/17/dossiers/${dossierId}`
}

/**
 * Official page of one scrutin.
 *
 * The AN serves it at `/dyn/<legislature>/scrutins/<number>`; the full uid in
 * that path is a 404 (#617). `api/an_links.py` builds the same URL for the API.
 */
export function anScrutinUrl(voteId: string | null | undefined): string | null {
  const match = voteId ? SCRUTIN_UID.exec(voteId) : null
  if (!match) return null
  return `https://www.assemblee-nationale.fr/dyn/${match[1]}/scrutins/${match[2]}`
}
