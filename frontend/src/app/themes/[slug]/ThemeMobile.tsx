import Link from 'next/link'
import type { ThemeDetail, ThemeVoteItem } from '@/lib/api'
import { partyHex, normalizePartyShort, formatDate, themeColors } from '@/lib/utils'
import { THEME_ENTRIES } from '@/lib/themes'
import { PhonePageHeader, PhoneSection, ResultBadge, StatTile, cardClass } from '@/components/phone/kit'

/** Votes listed before the rest fold behind "Voir les N autres". */
export const THEME_VOTES_SHOWN = 10

function pct(rate: number | null | undefined): number | null {
  return rate == null ? null : Math.round(rate * 100)
}

/**
 * The theme page below `md` (canvas "Thème"): the figures, the most disputed
 * vote, each group's share of "pour", then the votes and the other themes.
 */
export function ThemeMobile({ data, canonicalSlug }: { data: ThemeDetail; canonicalSlug: string }) {
  const adoption = pct(data.adoption_rate)
  const shown = data.votes.slice(0, THEME_VOTES_SHOWN)
  const rest = data.votes.slice(THEME_VOTES_SHOWN)
  const divided = data.most_divided_vote

  return (
    <div className="bg-[color:var(--dp-page-bg)] pb-8 md:hidden">
      <PhonePageHeader
        eyebrow="Thème"
        title={data.name}
        lead="Qui vote quoi sur ce thème, groupe par groupe."
      />

      <div className="flex flex-col gap-2 px-4">
        <div className="grid grid-cols-2 gap-2">
          <StatTile value={data.vote_count.toLocaleString('fr-FR')} label="scrutins recensés" />
          {adoption !== null && <StatTile value={`${adoption} %`} label="taux d'adoption" />}
        </div>
        {divided && (
          <Link href={`/votes/${divided.vote_id}`} className="dp-dark flex flex-col gap-1.5 rounded-[20px] bg-navy p-4 text-white">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[color:var(--dp-text-secondary)]">
              Le vote le plus disputé
            </span>
            <span className="text-[15px] font-semibold leading-snug">{divided.vote_title}</span>
            <span className="text-[13px] text-[color:var(--dp-text-secondary)]">
              {divided.votes_for} pour · {divided.votes_against} contre
            </span>
          </Link>
        )}
      </div>

      {data.party_positions.length > 0 && (
        <PhoneSection eyebrow="Positionnement par groupe" title="Qui vote pour sur ce thème ?">
          <ul className={`${cardClass} flex flex-col gap-3.5 p-4`}>
            {data.party_positions.map(p => {
              const label = normalizePartyShort(p.party_short) ?? 'Non inscrit'
              const hex = partyHex(label === 'Non inscrit' ? null : label)
              const pourPct = pct(p.pour_rate)
              return (
                <li key={p.party_short ?? 'Non inscrit'} className="flex flex-col gap-1.5">
                  <span className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="flex items-center gap-2 font-semibold">
                      <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: hex }} />
                      {label}
                    </span>
                    <span className="text-[color:var(--dp-text-secondary)]">
                      {pourPct !== null ? `${pourPct} % pour` : '—'} · {p.expressed} exprimé{p.expressed !== 1 ? 's' : ''}
                    </span>
                  </span>
                  <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-[color:var(--dp-track-bg)]">
                    <span className="block h-full rounded-full" style={{ width: `${pourPct ?? 0}%`, background: hex }} />
                  </span>
                </li>
              )
            })}
          </ul>
        </PhoneSection>
      )}

      <PhoneSection eyebrow="Scrutins" title={`Les votes sur ${data.name}`}>
        <VoteList votes={shown} />
        {rest.length > 0 && (
          <details className="group">
            <summary className="flex h-[50px] cursor-pointer list-none items-center justify-center rounded-[14px] border-[1.5px] border-[color:var(--dp-text)] text-[15px] font-medium text-[color:var(--dp-text)] group-open:hidden">
              Voir les {rest.length} autres
            </summary>
            <VoteList votes={rest} />
          </details>
        )}
      </PhoneSection>

      <PhoneSection eyebrow="Autres thèmes">
        <div className="flex flex-wrap gap-2">
          {THEME_ENTRIES.filter(t => t.slug !== canonicalSlug).map(t => {
            const c = themeColors(t.name)
            return (
              <Link
                key={t.slug}
                href={`/themes/${t.slug}`}
                className="inline-flex min-h-9 items-center rounded-full px-3.5 text-[13px] font-semibold"
                style={{ color: c.c, background: c.bg }}
              >
                {t.name}
              </Link>
            )
          })}
        </div>
      </PhoneSection>
    </div>
  )
}

function VoteList({ votes }: { votes: ThemeVoteItem[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {votes.map(v => (
        <li key={v.vote_id}>
          <Link href={`/votes/${v.vote_id}`} className={`${cardClass} flex flex-col gap-2 p-4`}>
            <span className="text-[15px] font-semibold leading-snug">{v.summary_plain || v.vote_title}</span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[color:var(--dp-text-secondary)]">
              {v.result && <ResultBadge result={v.result} />}
              {v.voted_at && <span>{formatDate(v.voted_at)}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
