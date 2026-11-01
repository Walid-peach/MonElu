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
 * The pages the app opens: exactly the paths `AppRoute(url:)` in the app
 * parses, one segment after the prefix. Exclusions come first because Apple
 * applies the first component that matches, and its `*` also spans `/`, so
 * `/deputes/*` alone would claim `/deputes/<id>/dossier`, which the app
 * cannot show (#623). The `.md` twins (MON-271), the two list tools under
 * `/deputes` and every nested page stay on the web, as do shared quiz results
 * (`/quiz/s/<id>`), which the app has no screen for.
 *
 * `frontend/__tests__/app/apple-app-site-association.test.ts` and the app's
 * `AppRouteTests` both read `app_links.json` in the app's test fixtures, so
 * the two sides cannot drift apart.
 */
export const APP_LINK_COMPONENTS: Array<{ '/': string; exclude?: true }> = [
  { '/': '/deputes/*.md', exclude: true },
  { '/': '/votes/*.md', exclude: true },
  { '/': '/deputes/comparer', exclude: true },
  { '/': '/deputes/tableau', exclude: true },
  { '/': '/deputes/*/*', exclude: true },
  { '/': '/votes/*/*', exclude: true },
  { '/': '/groupes/*/*', exclude: true },
  { '/': '/themes/*/*', exclude: true },
  { '/': '/departements/*/*', exclude: true },
  { '/': '/deputes/*' },
  { '/': '/votes/*' },
  { '/': '/groupes/*' },
  { '/': '/themes/*' },
  { '/': '/departements/*' },
]

/**
 * Whether the app is given `path`, applying the components the way Apple
 * does: the first one whose pattern matches decides, `*` matches any run of
 * characters (`/` included) and `?` exactly one.
 */
export function opensInApp(path: string): boolean {
  for (const component of APP_LINK_COMPONENTS) {
    const pattern = component['/']
      .split('')
      .map((c) => (c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&')))
      .join('')
    if (new RegExp(`^${pattern}$`).test(path)) return !component.exclude
  }
  return false
}

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
