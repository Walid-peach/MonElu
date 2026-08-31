/**
 * URLs on the Assemblée nationale's own site (MON-267).
 *
 * Single definition of the two official URLs MonÉlu constructs from ids it
 * already stores. Both are consumed twice - once as a link a reader clicks,
 * once as an entity-reconciliation signal in JSON-LD (`Person.sameAs`,
 * `Event.about`) - and a drift between those two would publish a URL the site
 * itself does not use.
 *
 * Both guard on shape and return null rather than a guessed URL: a stored id
 * that does not look like an AN reference silently produces no link instead of
 * a broken one.
 */

/** AN acteur uid, e.g. `PA842137`. */
const ACTEUR_UID = /^PA\d{1,9}$/

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
