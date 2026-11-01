import Link from 'next/link'
import type { VoteParticipation } from '@/lib/api'

// The turnout card on a vote page (#627). The API computes every figure; this
// only formats them. The rate leads, as a percentage, with the median for the
// same kind of scrutin marked on the bar, because a raw turnout means little on
// its own: an ordinary amendment vote routinely draws a fifth of the chamber,
// a solemn vote nearly all of it.

const TYPE_LABELS: Record<string, { median: string; hint: string }> = {
  spo: {
    median: 'médiane des scrutins ordinaires',
    hint: 'La plupart des scrutins ordinaires se tiennent devant une petite partie de l’hémicycle : cette participation se lit par rapport aux autres scrutins ordinaires.',
  },
  sps: {
    median: 'médiane des votes solennels',
    hint: 'Les votes solennels sont annoncés à l’avance et réunissent presque tous les députés.',
  },
  moc: {
    median: 'médiane des motions de censure',
    hint: 'Sur une motion de censure, seuls les députés qui la soutiennent votent : les autres ne prennent pas part au scrutin.',
  },
}

const COMPARISON_BADGES: Record<string, { label: string; className: string }> = {
  below: {
    label: 'Nettement sous l’habitude',
    className: 'bg-[color:var(--dp-badge-abst-bg)] text-[color:var(--dp-badge-abst-text)]',
  },
  usual: {
    label: 'Dans l’habitude',
    className: 'bg-[color:var(--dp-badge-info-bg)] text-[color:var(--dp-badge-info-text)]',
  },
  above: {
    label: 'Nettement au-dessus de l’habitude',
    className: 'bg-[color:var(--dp-badge-pos-bg)] text-[color:var(--dp-badge-pos-text)]',
  },
}

/** A 0-1 rate as a whole percentage; a non-zero rate under 1 % reads "< 1". */
export function percent(rate: number): string {
  if (rate > 0 && rate < 0.005) return '< 1'
  return String(Math.round(rate * 100))
}

export function VoteParticipationCard({
  participation,
  voteType,
}: {
  participation: VoteParticipation
  voteType: string | null
}) {
  const { participants, non_voting, seats, rate, typical_rate, comparison } = participation
  const type = voteType ? TYPE_LABELS[voteType] : undefined
  const badge = comparison ? COMPARISON_BADGES[comparison] : undefined
  const ratePct = Math.min(100, rate * 100)
  const typicalPct = typical_rate != null ? Math.min(100, typical_rate * 100) : null
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] p-5 shadow-[0_1px_3px_var(--dp-shadow-sm)] md:p-7">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-newsreader text-[52px] font-semibold leading-none tracking-tight text-[color:var(--dp-text)]">
          {percent(rate)}&nbsp;%
        </span>
        <span className="text-[15px] text-[color:var(--dp-text)]">
          des {seats.toLocaleString('fr-FR')} députés ont pris part au vote
        </span>
        {badge && (
          <span className={`ml-auto rounded-full px-3 py-1 text-xs font-bold ${badge.className}`}>{badge.label}</span>
        )}
      </div>
      <p className="text-sm text-[color:var(--dp-text-secondary)]">
        {participants.toLocaleString('fr-FR')} député{participants > 1 ? 's' : ''}
        {non_voting > 0 ? `, dont ${non_voting} non-votant${non_voting > 1 ? 's' : ''}` : ''}.
      </p>

      <div className="flex flex-col gap-2">
        <div
          role="img"
          aria-label={
            typicalPct != null
              ? `${percent(rate)} % de participation, ${type?.median ?? 'médiane'} : ${percent(typical_rate!)} %`
              : `${percent(rate)} % de participation`
          }
          className="relative h-3 rounded-full bg-[color:var(--dp-track-bg)]"
        >
          <div className="absolute inset-y-0 left-0 rounded-full bg-[color:var(--dp-active-bg)] dark:bg-[color:var(--dp-text)]" style={{ width: `${ratePct}%` }} />
          {typicalPct != null && (
            <div className="absolute -top-1.5 h-6 w-0.5 bg-[color:var(--dp-red)]" style={{ left: `calc(${typicalPct}% - 1px)` }} />
          )}
        </div>
        {typicalPct != null && (
          <div className="flex justify-end font-mono text-xs text-[color:var(--dp-red)]">
            {type?.median ?? 'médiane'} : {percent(typical_rate!)}&nbsp;%
          </div>
        )}
      </div>

      {type && <p className="text-sm leading-relaxed text-[color:var(--dp-text-secondary)]">{type.hint}</p>}

      <details className="border-t border-[color:var(--dp-border-subtle)] pt-3 text-[13px] leading-relaxed text-[color:var(--dp-text-secondary)]">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-[color:var(--dp-text)]">
          Ce que ce chiffre mesure
        </summary>
        <ul className="mt-1 flex list-disc flex-col gap-1.5 pl-5">
          <li>
            <strong className="font-semibold text-[color:var(--dp-text)]">Des votes, pas des présences.</strong>{' '}
            Un député peut être dans l’hémicycle sans voter, ou voter par délégation sans y être : chacun peut porter la délégation d’un seul collègue.
          </li>
          <li>Les non-votants comptent : ils étaient en séance, sans prendre position.</li>
          <li>Le total est rapporté aux {seats} sièges de l’Assemblée, sièges vacants compris.</li>
        </ul>
        <Link href="/methodologie#participation" className="mt-2 inline-block font-semibold text-[color:var(--dp-red)]">
          Méthodologie →
        </Link>
      </details>
    </div>
  )
}
