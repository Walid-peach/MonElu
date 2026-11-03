import Link from 'next/link'
import type { LoiScrutin } from '@/lib/api'
import { ResultBadge } from '@/components/phone/kit'
import { SummaryTag } from '@/components/SummaryLabel'
import { formatDate } from '@/lib/utils'

/** One scrutin on a bill page: the official title first, then the labeled summary (#634). */
export function LoiScrutinCard({ scrutin }: { scrutin: LoiScrutin }) {
  return (
    <Link
      href={`/votes/${scrutin.vote_id}`}
      className="flex flex-col gap-1.5 rounded-lg border border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] p-3"
    >
      <span className="text-[14.5px] font-semibold leading-snug text-[color:var(--dp-text)]">
        {scrutin.vote_title ?? `Scrutin n°${scrutin.vote_id}`}
      </span>
      {scrutin.summary_plain && (
        <span className="text-[13.5px] leading-snug text-[color:var(--dp-text-secondary)]">
          <SummaryTag basis={scrutin.summary_basis} />
          {scrutin.summary_plain}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[color:var(--dp-text-secondary)]">
        <ResultBadge result={scrutin.result} />
        {scrutin.votes_for != null && scrutin.votes_against != null && (
          <span>
            {scrutin.votes_for} pour · {scrutin.votes_against} contre
            {scrutin.abstentions ? ` · ${scrutin.abstentions} abstention${scrutin.abstentions > 1 ? 's' : ''}` : ''}
          </span>
        )}
        {scrutin.voted_at && <span>{formatDate(scrutin.voted_at)}</span>}
      </span>
    </Link>
  )
}
