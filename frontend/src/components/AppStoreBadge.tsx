import { APP_STORE_BADGE_SRC, appStoreUrl } from '@/lib/appStore'

const BADGE_HEIGHT = 40 // Apple's minimum on-screen height

/**
 * Apple's "Télécharger dans l'App Store" badge (#597), unmodified, at Apple's
 * minimum height, with clear space of a quarter of its height above and below
 * (the container already keeps neighbours off its sides).
 */
export function AppStoreBadge({ id }: { id: string }) {
  return (
    <a
      href={appStoreUrl(id)}
      style={{ display: 'inline-block', lineHeight: 0, margin: `${BADGE_HEIGHT / 4}px 0` }}
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
