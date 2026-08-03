import type { CSSProperties, ReactNode } from 'react'

/**
 * A single decorative skeleton shape (a placeholder for an image, a line of
 * text, a badge, etc.). Always aria-hidden — the loading state itself is
 * announced once by the surrounding ContentSkeleton, not by every block.
 */
export function SkeletonBlock({
  className = '',
  style,
}: {
  className?: string
  style?: CSSProperties
}) {
  return <div aria-hidden="true" className={`dp-skeleton-block ${className}`} style={style} />
}

/**
 * Wraps a set of SkeletonBlock shapes that reproduce a predictable final
 * layout (MON-207: /deputes and /votes cards). The wrapper carries the
 * aria-busy/status semantics for assistive tech; the shapes inside stay
 * decorative and are hidden from screen readers.
 */
export function ContentSkeleton({
  children,
  label = 'Chargement du contenu…',
  className = '',
}: {
  children: ReactNode
  label?: string
  className?: string
}) {
  return (
    <div className={className} role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  )
}
