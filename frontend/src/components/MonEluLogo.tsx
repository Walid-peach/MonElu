import Image from 'next/image'

type Variant = 'light' | 'dark' | 'theme'

interface MonEluLogoProps {
  size?: number
  variant?: Variant
  hideWordmark?: boolean
}

// The approved MÉ artwork is shared with the native app and PWA icons.
// Keep its cream tile in both themes; only the accompanying wordmark changes.
export function MonEluLogo({ size = 40, variant = 'light', hideWordmark = false }: MonEluLogoProps) {
  return (
    <div className="flex shrink-0 items-center" style={{ gap: Math.round(size * 0.25) }}>
      <Image
        src="/brand/monelu-mark.webp"
        width={size}
        height={size}
        alt={hideWordmark ? 'MonÉlu' : ''}
        unoptimized
        className="shrink-0"
        style={{ borderRadius: Math.round(size * 0.22) }}
      />
      {!hideWordmark && (
        <span
          className="font-serif leading-none select-none whitespace-nowrap"
          style={{ fontSize: Math.round(size * 0.65), color: variant === 'theme' ? 'var(--dp-logo-ink)' : variant === 'dark' ? '#FFFFFF' : '#0D1F3C' }}
        >
          Mon<span style={{ color: variant === 'theme' ? 'var(--dp-red)' : variant === 'dark' ? '#EF7773' : '#C9302C' }}>Élu</span>
        </span>
      )}
    </div>
  )
}
