import Link from 'next/link'
import type { DepartmentDetail } from '@/lib/api'
import { partyHex, partyShort, formatDate } from '@/lib/utils'
import { groupSlug } from '@/lib/groups'
import { DeputyAvatar } from '@/components/DeputyAvatar'
import { PhonePageHeader, PhoneSection, ResultBadge, SplitBar, StatTile, cardClass } from '@/components/phone/kit'

function circoNumber(circonscription: string | null): number | null {
  if (!circonscription) return null
  const n = parseInt(circonscription, 10)
  return Number.isNaN(n) ? null : n
}

function pct(rate: number | null | undefined): number | null {
  return rate == null ? null : Math.round(rate * 100)
}

/**
 * The department page below `md` (canvas "Département"): the seats as one
 * bar of group colours, the deputies by circonscription, and the votes that
 * split them. The `#circo-N` ids stay on the desktop cards in `page.tsx` (an id
 * must be unique); these cards carry `data-circo-anchor` instead, which
 * `CircoAnchorScroll` scrolls to when the id's own card is hidden.
 */
export function DepartmentMobile({
  data,
  nationalPresenceRate,
}: {
  data: DepartmentDetail
  nationalPresenceRate: number | null
}) {
  const avgPresence = pct(data.avg_presence_rate)
  const nationalPresence = pct(nationalPresenceRate)
  const dissident = data.most_dissident
  const dissidentPct = pct(dissident?.dissident_rate)

  return (
    <div className="bg-[color:var(--dp-page-bg)] pb-8 md:hidden">
      <PhonePageHeader
        eyebrow={data.code === '99' ? 'Français de l’étranger' : `Département · ${data.code}`}
        title={data.name}
        lead={`${data.deputy_count} député${data.deputy_count !== 1 ? 's' : ''} à l'Assemblée nationale.`}
      />

      <div className="flex flex-col gap-3 px-4">
        {data.party_distribution.length > 0 && (
          <div className={`${cardClass} flex flex-col gap-3 p-4`}>
            <p className="text-sm font-bold">Répartition par groupe</p>
            <div aria-hidden="true" className="flex h-3 gap-0.5 overflow-hidden rounded-full">
              {data.party_distribution.map(g => (
                <span key={g.party ?? 'NI'} style={{ flex: g.count, background: partyHex(g.party) }} />
              ))}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
              {data.party_distribution.map(g => {
                const slug = groupSlug(g.party)
                const label = partyShort(g.party) || 'Non inscrit'
                return (
                  <li key={g.party ?? 'NI'} className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: partyHex(g.party) }} />
                    {slug ? (
                      <Link href={`/groupes/${slug}`} className="font-semibold underline-offset-2 hover:underline">
                        {label}
                      </Link>
                    ) : (
                      <span className="font-semibold">{label}</span>
                    )}
                    <span className="text-[color:var(--dp-text-secondary)]">{g.count}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {(avgPresence !== null || (dissident && dissidentPct !== null)) && (
          <div className="grid grid-cols-2 gap-2">
            {avgPresence !== null && (
              <StatTile
                value={`${avgPresence} %`}
                label={nationalPresence !== null ? `Présence moyenne (France : ${nationalPresence} %)` : 'Présence moyenne'}
              />
            )}
            {dissident && dissidentPct !== null && (
              <Link
                href={`/deputes/${dissident.deputy_id}`}
                className="flex flex-col gap-0.5 rounded-[14px] border border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] p-3 text-[color:var(--dp-text)]"
              >
                <span className="text-[15px] font-bold leading-tight">{dissident.full_name}</span>
                <span className="text-xs text-[color:var(--dp-text-secondary)]">
                  Le plus dissident : contre son groupe dans {dissidentPct} % des scrutins
                </span>
              </Link>
            )}
          </div>
        )}
      </div>

      <PhoneSection eyebrow="Vos élus" title={`Député${data.deputy_count !== 1 ? 's' : ''} par circonscription`}>
        <ul className="flex flex-col gap-2">
          {data.deputies.map(d => {
            const n = circoNumber(d.circonscription)
            const solemn = pct(d.solennel_participation_rate)
            return (
              <li key={d.deputy_id} data-circo-anchor={n !== null ? `circo-${n}` : undefined} className="scroll-mt-24">
                <Link href={`/deputes/${d.deputy_id}`} className={`${cardClass} flex items-center gap-3 p-3`}>
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[color:var(--dp-track-bg)] font-mono text-sm font-bold"
                  >
                    {n ?? '·'}
                  </span>
                  <DeputyAvatar name={d.full_name} photoUrl={d.photo_url} size="sm" decorative />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-bold">{d.full_name}</span>
                    <span className="flex items-center gap-1.5 truncate text-[13px] text-[color:var(--dp-text-secondary)]">
                      <span aria-hidden="true" className="h-2 w-2 flex-none rounded-full" style={{ background: partyHex(d.party) }} />
                      {partyShort(d.party) || 'NI'}
                      {n !== null && <span className="sr-only">, {n === 1 ? '1ère' : `${n}e`} circonscription</span>}
                    </span>
                  </span>
                  {solemn !== null && (
                    <span className="flex flex-none flex-col items-end">
                      <span className="font-mono text-[15px] font-bold">{solemn} %</span>
                      <span className="text-[11px] text-[color:var(--dp-text-secondary)]">solennels</span>
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </PhoneSection>

      {data.split_votes.length > 0 && (
        <PhoneSection eyebrow="Là où ils se divisent" title="Quand vos députés n'étaient pas d'accord">
          <ul className="flex flex-col gap-2">
            {data.split_votes.map(v => (
              <li key={v.vote_id}>
                <Link href={`/votes/${v.vote_id}`} className={`${cardClass} flex flex-col gap-2.5 p-4`}>
                  <span className="text-[15px] font-semibold leading-snug">{v.vote_title}</span>
                  <SplitBar pour={v.pour} contre={v.contre} abstention={v.abstention} height={8} />
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[color:var(--dp-text-secondary)]">
                    <span>{v.pour} pour · {v.contre} contre{v.abstention > 0 ? ` · ${v.abstention} abst.` : ''}</span>
                    {v.voted_at && <span>{formatDate(v.voted_at)}</span>}
                    {v.result && <ResultBadge result={v.result} />}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </PhoneSection>
      )}

      <div className="px-5 pt-6">
        <Link href="/deputes" className="text-sm font-semibold text-[color:var(--dp-text)] underline underline-offset-2">
          ← Tous les députés
        </Link>
      </div>
    </div>
  )
}
