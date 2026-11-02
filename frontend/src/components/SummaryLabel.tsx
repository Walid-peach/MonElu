import Link from 'next/link'
import { SUMMARY_METHOD_PATH, summaryDisclosure, summaryTag } from '@/lib/summaryLabel'

/** The short label for a list row, whose link leads to the full disclosure (#634). */
export function SummaryTag({ basis }: { basis?: string | null }) {
  return (
    <span
      style={{
        display: 'inline-block',
        marginRight: 6,
        padding: '1px 6px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.5,
        whiteSpace: 'nowrap',
        verticalAlign: 'baseline',
        color: 'var(--dp-text-secondary)',
        border: '1px solid var(--dp-border)',
      }}
    >
      {summaryTag(basis)}
    </span>
  )
}

/** The full label beside a summary, linked to the method and to the official text (#634). */
export function SummaryDisclosure({
  basis,
  officialUrl,
}: {
  basis?: string | null
  officialUrl: string | null
}) {
  return (
    <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.5, color: 'var(--dp-text-muted)' }}>
      {summaryDisclosure(basis)}{' '}
      <Link href={SUMMARY_METHOD_PATH} style={{ color: 'inherit', textDecoration: 'underline' }}>
        Méthode
      </Link>
      {officialUrl && (
        <>
          {' · '}
          <a
            href={officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'inherit', textDecoration: 'underline' }}
          >
            Scrutin officiel
          </a>
        </>
      )}
    </p>
  )
}
