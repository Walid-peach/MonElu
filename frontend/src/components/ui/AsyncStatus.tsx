'use client'

import { useReducedMotion } from 'framer-motion'

export interface AsyncStatusProps {
  /** Contextual status text, e.g. "Recherche des sources officielles…" */
  status: string
  /** Loading-policy phase (see lib/loadingPolicy) — 'inline' renders a smaller treatment. */
  phase?: 'inline' | 'content'
  /** When set, renders the failure state with this message instead of the status. */
  error?: string | null
  /** Retry affordance shown only in the failure state. */
  onRetry?: () => void
  /** Cancel affordance shown only while the operation is still in progress. */
  onCancel?: () => void
  className?: string
}

/**
 * Contextual progress indicator for operations whose duration or output
 * shape is unpredictable (MON-207: chat, claim verification). Deliberately
 * text-based rather than skeleton-shaped — do not use for generated
 * responses, whose final shape can't be anticipated.
 */
export function AsyncStatus({
  status,
  phase = 'content',
  error = null,
  onRetry,
  onCancel,
  className = '',
}: AsyncStatusProps) {
  const reduceMotion = useReducedMotion()
  const isError = Boolean(error)

  return (
    <div className={className} role="status" aria-busy={!isError}>
      <div className="flex items-center gap-2">
        {!isError && (
          <span
            aria-hidden="true"
            className={`inline-block w-2 h-2 rounded-full bg-[color:var(--dp-accent)] ${
              reduceMotion ? '' : 'animate-pulse'
            }`}
          />
        )}
        <span className={phase === 'inline' ? 'text-xs' : 'text-sm'}>
          {isError ? error : status}
        </span>
      </div>
      {(onCancel || onRetry) && (
        <div className="flex gap-3 mt-2">
          {!isError && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-sm underline underline-offset-2"
            >
              Annuler
            </button>
          )}
          {isError && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="text-sm underline underline-offset-2"
            >
              Réessayer
            </button>
          )}
        </div>
      )}
    </div>
  )
}
