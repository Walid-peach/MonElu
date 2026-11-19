import Link from 'next/link'
import { reportHref, type SnapshotKind } from '@/lib/reportContent'

/**
 * The "Signaler ce contenu" line under a share snapshot (#707, App Review
 * Guideline 1.2). One component for `/chat/s`, `/verifier/v` and `/quiz/s`,
 * so the three pages cannot drift apart. It links to `/contact` (MON-272),
 * never to the address itself, and passes the snapshot so the contact page
 * can name it.
 */
export function ReportContentLink({
  kind,
  id,
  className = '',
}: {
  kind: SnapshotKind
  id: string
  className?: string
}) {
  return (
    <p className={`text-xs text-[color:var(--dp-text-muted)] ${className}`}>
      Page partagée par un visiteur de MonÉlu.{' '}
      <Link
        href={reportHref(kind, id)}
        className="underline hover:text-navy dark:hover:text-[color:var(--dp-text)]"
      >
        Signaler ce contenu
      </Link>
    </p>
  )
}
