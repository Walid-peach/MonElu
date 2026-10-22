// Build-time guard for the App Store badge (#597), run from next.config.mjs.
//
// Setting NEXT_PUBLIC_IOS_APP_STORE_ID turns the badge on for iPhone visitors.
// The badge must be Apple's own artwork, which is committed by hand, so a
// build that has the ID but not the file, or a malformed ID, stops here
// instead of shipping a broken image or a dead App Store link.

import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Keep in sync with APP_STORE_BADGE_SRC in src/lib/appStore.ts.
export const APP_STORE_BADGE_FILE = 'badges/app-store-fr-black.svg'

export function assertAppStoreBadge(env, publicDir) {
  const raw = env.NEXT_PUBLIC_IOS_APP_STORE_ID?.trim()
  if (!raw) return
  if (!/^\d+$/.test(raw)) {
    throw new Error(
      `NEXT_PUBLIC_IOS_APP_STORE_ID must be the numeric App Store ID (the digits after "id" in the App Store URL), got "${raw}".`,
    )
  }
  if (!existsSync(join(publicDir, APP_STORE_BADGE_FILE))) {
    throw new Error(
      `NEXT_PUBLIC_IOS_APP_STORE_ID is set but public/${APP_STORE_BADGE_FILE} is missing. ` +
        "Add Apple's official French black \"Télécharger dans l'App Store\" SVG from Apple's Marketing Tools " +
        '(https://toolbox.marketingtools.apple.com/app-store/) at that path before setting the variable.',
    )
  }
}
