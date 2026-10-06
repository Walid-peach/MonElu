/**
 * The `apple-app-site-association` file (ADR-041, #439): the domain's
 * statement that the MonÉlu iPhone app may open these URLs itself, which is
 * what turns a shared `/votes/...` link into the app instead of Safari.
 *
 * It names the app by `<Team ID>.<bundle id>`, both unknown until the Apple
 * Developer account and the app record exist, so it is built from environment
 * variables and does not exist at all while either is unset or malformed.
 */

/** Apple Team IDs are ten upper-case letters or digits. */
const TEAM_ID = /^[A-Z0-9]{10}$/
/** Reverse-DNS bundle id, e.g. `fr.monelu.app`. */
const BUNDLE_ID = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/

/**
 * The pages the app opens. Exclusions come first because Apple applies the
 * first component that matches: the `.md` twins (MON-271) and the two list
 * tools under `/deputes` stay on the web.
 */
export const APP_LINK_COMPONENTS: Array<{ '/': string; exclude?: true }> = [
  { '/': '/deputes/*.md', exclude: true },
  { '/': '/votes/*.md', exclude: true },
  { '/': '/deputes/comparer', exclude: true },
  { '/': '/deputes/tableau', exclude: true },
  { '/': '/deputes/*' },
  { '/': '/votes/*' },
  { '/': '/groupes/*' },
  { '/': '/themes/*' },
  { '/': '/quiz/s/*' },
]

export type AppleAppSiteAssociation = {
  applinks: { details: Array<{ appIDs: string[]; components: typeof APP_LINK_COMPONENTS }> }
}

export function buildAppleAppSiteAssociation(
  teamId: string | undefined,
  bundleId: string | undefined
): AppleAppSiteAssociation | null {
  const team = teamId?.trim() ?? ''
  const bundle = bundleId?.trim() ?? ''
  if (!TEAM_ID.test(team) || !BUNDLE_ID.test(bundle)) return null
  return {
    applinks: {
      details: [{ appIDs: [`${team}.${bundle}`], components: APP_LINK_COMPONENTS }],
    },
  }
}
