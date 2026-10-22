'use client'
import { APP_STORE_BADGE_SRC, appStoreUrl } from '@/lib/appStore'
import { recordInstallEvent } from '@/lib/installEvents'

const BADGE_HEIGHT = 40 // Apple's minimum on-screen height

/**
 * Apple's "Télécharger dans l'App Store" badge (#597), unmodified, at Apple's
 * minimum height, with clear space of a quarter of its height on every side.
 */
export function AppStoreBadge({ id }: { id: string }) {
  return (
    <a
      href={appStoreUrl(id)}
      onClick={() => recordInstallEvent('app_store_badge_tap')}
      style={{ display: 'inline-block', lineHeight: 0, margin: BADGE_HEIGHT / 4 }}
    >
      {/* A plain image: next/image refuses SVGs unless dangerouslyAllowSVG is on. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={APP_STORE_BADGE_SRC}
        alt="Télécharger dans l'App Store"
        height={BADGE_HEIGHT}
        style={{ height: BADGE_HEIGHT, width: 'auto' }}
      />
    </a>
  )
}
