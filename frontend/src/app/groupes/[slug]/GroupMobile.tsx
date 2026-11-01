import Link from 'next/link'
import type { GroupDetail, GroupMember, GroupVoteBreakdown } from '@/lib/api'
import { partyHex, formatDate } from '@/lib/utils'
import { DeputyAvatar } from '@/components/DeputyAvatar'
import { PhonePageHeader, PhoneSection, PositionChip, ResultBadge, SplitBar, StatTile, cardClass } from '@/components/phone/kit'

/** Members listed before the rest fold behind "Voir les N autres". */
export const GROUP_MEMBERS_SHOWN = 12

function pct(rate: number | null | undefined): number | null {
  return rate == null ? null : Math.round(rate * 100)
}

/**
 * The group page below `md` (canvas "Groupe"): presence and cohesion as two
 * tiles, the votes that divided the group, its frondeurs, then the members.
 * The long member list folds behind a native `<details>`, so the page stays
 * a server component.
 */
export function GroupMobile({
  data,
  nationalPresenceRate,
}: {
  data: GroupDetail
  nationalPresenceRate: number | null
}) {
  const hex = partyHex(data.name)
  const avgPresence = pct(data.avg_presence_rate)
  const nationalPresence = pct(nationalPresenceRate)
  const avgDissident = pct(data.avg_dissident_rate)
  const cohesion = avgDissident === null ? null : 100 - avgDissident
  const shown = data.members.slice(0, GROUP_MEMBERS_SHOWN)
  const rest = data.members.slice(GROUP_MEMBERS_SHOWN)

  return (
    <div className="bg-[color:var(--dp-page-bg)] pb-8 md:hidden">
      <PhonePageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: hex }} />
            Groupe parlementaire
          </span>
        }
        title={data.name}
        lead={`${data.member_count} député${data.member_count !== 1 ? 's' : ''} à l'Assemblée nationale.`}
      />

      {(avgPresence !== null || cohesion !== null) && (
        <div className="grid grid-cols-2 gap-2 px-4">
          {avgPresence !== null && (
            <StatTile
              value={`${avgPresence} %`}
              label={nationalPresence !== null ? `Présence moyenne (France : ${nationalPresence} %)` : 'Présence moyenne'}
            />
          )}
          {cohesion !== null && <StatTile value={`${cohesion} %`} label="Cohésion : vote avec la majorité du groupe" emphasis />}
        </div>
      )}

      {data.divided_votes.length > 0 && (
        <PhoneSection eyebrow="Là où ils se divisent" title="Les votes les plus disputés du groupe">
          <VoteList votes={data.divided_votes} />
        </PhoneSection>
      )}

      {data.most_dissident_members.length > 0 && (
        <PhoneSection eyebrow="Les frondeurs" title="Ceux qui s'écartent le plus du groupe">
          <ul className={`${cardClass} divide-y divide-[color:var(--dp-border-subtle)] overflow-hidden`}>
            {data.most_dissident_members.map(m => (
              <li key={m.deputy_id}>
                <Link href={`/deputes/${m.deputy_id}`} className="flex items-center gap-3 px-4 py-3">
                  <DeputyAvatar name={m.full_name} photoUrl={m.photo_url} size="sm" decorative />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{m.full_name}</span>
                  <span className="flex flex-none flex-col items-end">
                    <span className="font-mono text-[15px] font-bold">{pct(m.dissident_rate)} %</span>
                    <span className="text-[11px] text-[color:var(--dp-text-secondary)]">contre le groupe</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </PhoneSection>
      )}

      {data.recent_scrutins.length > 0 && (
        <PhoneSection eyebrow="Votes récents" title="Comment le groupe a voté">
          <VoteList votes={data.recent_scrutins} />
        </PhoneSection>
      )}

      <PhoneSection eyebrow="Membres" title={`Les ${data.member_count} député${data.member_count !== 1 ? 's' : ''}`}>
        <MemberList members={shown} />
        {rest.length > 0 && (
          <details className="group">
            <summary className="flex h-[50px] cursor-pointer list-none items-center justify-center rounded-[14px] border-[1.5px] border-[color:var(--dp-text)] text-[15px] font-medium text-[color:var(--dp-text)] group-open:hidden">
              Voir les {rest.length} autres
            </summary>
            <MemberList members={rest} />
          </details>
        )}
      </PhoneSection>

      <div className="px-5 pt-6">
        <Link href="/deputes" className="text-sm font-semibold text-[color:var(--dp-text)] underline underline-offset-2">
          ← Tous les députés
        </Link>
      </div>
    </div>
  )
}

function MemberList({ members }: { members: GroupMember[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {members.map(m => {
        const presence = pct(m.presence_rate)
        return (
          <li key={m.deputy_id}>
            <Link href={`/deputes/${m.deputy_id}`} className={`${cardClass} flex items-center gap-3 p-3`}>
              <DeputyAvatar name={m.full_name} photoUrl={m.photo_url} size="sm" decorative />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-bold">{m.full_name}</span>
                <span className="truncate text-[13px] text-[color:var(--dp-text-secondary)]">{m.department ?? '—'}</span>
              </span>
              {presence !== null && (
                <span className="flex flex-none flex-col items-end">
                  <span className="font-mono text-[15px] font-bold">{presence} %</span>
                  <span className="text-[11px] text-[color:var(--dp-text-secondary)]">présence</span>
                </span>
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function VoteList({ votes }: { votes: GroupVoteBreakdown[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {votes.map(v => (
        <li key={v.vote_id}>
          <Link href={`/votes/${v.vote_id}`} className={`${cardClass} flex flex-col gap-2.5 p-4`}>
            <span className="text-[15px] font-semibold leading-snug">{v.vote_title}</span>
            <SplitBar pour={v.pour} contre={v.contre} abstention={v.abstention} height={8} />
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-[color:var(--dp-text-secondary)]">
              <span>{v.pour} pour · {v.contre} contre{v.abstention > 0 ? ` · ${v.abstention} abst.` : ''}</span>
              {v.voted_at && <span>{formatDate(v.voted_at)}</span>}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <PositionChip position={v.majority_position} prefix="Groupe" />
              {v.result && <ResultBadge result={v.result} />}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
