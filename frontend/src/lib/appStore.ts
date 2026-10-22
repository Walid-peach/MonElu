// The iPhone app on the App Store (#597, epic #593).
//
// NEXT_PUBLIC_IOS_APP_STORE_ID is inlined at build time, so the badge and
// Safari's Smart App Banner appear only after it is set on Vercel and the
// site is redeployed. While it is unset, iPhone visitors keep the "arrive
// bientôt" message, so this code can ship before the release.
//
// The badge is Apple's own artwork, used unmodified (App Store marketing
// guidelines): the French black "Télécharger dans l'App Store" SVG from
// Apple's Marketing Tools, committed at APP_STORE_BADGE_SRC under public/.
// scripts/app-store-badge-guard.mjs fails the build when the ID is set and
// that file is missing, so the badge can never render as a broken image.

export const APP_STORE_BADGE_SRC = '/badges/app-store-fr-black.svg'

/** The numeric App Store ID, or null when unset or malformed. */
export function parseAppStoreId(raw: string | undefined): string | null {
  const value = raw?.trim()
  return value && /^\d+$/.test(value) ? value : null
}

/** The configured App Store ID. Next inlines the variable here at build time. */
export function iosAppStoreId(): string | null {
  return parseAppStoreId(process.env.NEXT_PUBLIC_IOS_APP_STORE_ID)
}

export function appStoreUrl(id: string): string {
  return `https://apps.apple.com/app/id${id}`
}

/**
 * Safari's Smart App Banner, for the root layout's metadata: native,
 * Safari-only, ignored by every other browser, and "Ouvrir" for people who
 * already have the app. Nothing while the ID is unset.
 */
export function smartAppBannerMetadata(): { itunes?: { appId: string } } {
  const id = iosAppStoreId()
  return id ? { itunes: { appId: id } } : {}
}
