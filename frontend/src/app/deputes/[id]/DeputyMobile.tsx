import Link from 'next/link'
import type { Alignment, Deputy, DeputyStats, DeputyVotesResponse, DissidentVotesResponse, Scorecard } from '@/lib/api'
import { csvUrl } from '@/lib/api'
import { formatDate, partyHex } from '@/lib/utils'
import { DeputyAvatar } from '@/components/DeputyAvatar'
import { FollowDeputyButton } from '@/components/FollowDeputyButton'
import { ShareButton } from '@/components/ShareButton'
import { ReportErrorButton } from '@/components/ReportErrorButton'
import { Card, PhoneSection, PositionChip, ResultBadge, SplitBar, cardClass } from '@/components/phone/kit'

const NUMBER = new Intl.NumberFormat('fr-FR')

/**
 * A deputy's page below `md` (canvas "Député · profil"): who they are, the
 * mandate's tally, solemn-vote participation against the average, how often
 * they vote with their group, and their recent votes. Same data the desktop
 * layout of `page.tsx` already fetched; desktop is unchanged.
 */
export function DeputyMobile({
  deputy,
  scorecard,
  stats,
  recentVotes,
  alignment,
  dissidentVotes,
  departmentLabel,
  departmentCode,
  groupHref,
}: {
  deputy: Deputy
  scorecard: Scorecard | null
  stats: DeputyStats | null
  recentVotes: DeputyVotesResponse | null
  alignment: Alignment | null
  dissidentVotes: DissidentVotesResponse | null
  departmentLabel: string | null
  departmentCode: string | null
  groupHref: string | null
}) {
  const id = deputy.deputy_id
  const solennel = scorecard?.solennel_participation_rate != null ? Math.round(scorecard.solennel_participation_rate * 100) : null
  const avgSolennel = stats?.avg_solennel_participation_rate != null ? Math.round(stats.avg_solennel_participation_rate * 100) : null
  const alignmentPct = alignment ? Math.round(alignment.party_alignment_rate * 100) : null
  const nonVotant = scorecard ? scorecard.total_votes - scorecard.present_votes : 0
  const color = deputy.party ? partyHex(deputy.party) : 'var(--dp-text-muted)'

  return (
    <div className="bg-[color:var(--dp-page-bg)] pb-8 text-[color:var(--dp-text)] md:hidden">
      <section className="flex flex-col gap-3.5 border-b border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] px-5 pb-5 pt-4">
        <Link href="/deputes" className="text-[13px] text-[color:var(--dp-text-secondary)]">← Députés</Link>
        <div className="flex items-center gap-3.5">
          <span className="flex-none rounded-full p-[3px]" style={{ background: color }}>
            <DeputyAvatar name={deputy.full_name} photoUrl={deputy.photo_url} size="xl" decorative />
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="font-newsreader text-[28px] font-medium leading-[1.1]">{deputy.full_name}</h1>
            {deputy.party && (
              groupHref ? (
                <Link href={`/groupes/${groupHref}`} className="flex items-center gap-1.5 self-start rounded-full bg-[color:var(--dp-page-bg)] px-2.5 py-1 text-xs font-semibold">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: color }} />
                  {deputy.party}
                </Link>
              ) : (
                <span className="text-xs font-semibold">{deputy.party}</span>
              )
            )}
          </div>
        </div>
        <p className="text-sm leading-normal text-[color:var(--dp-text-secondary)]">
          {departmentCode ? (
            <Link href={`/departements/${departmentCode}`} className="font-medium text-[color:var(--dp-text)] underline underline-offset-2">
              {departmentLabel ?? deputy.department}
            </Link>
          ) : (
            departmentLabel ?? deputy.department ?? '—'
          )}
          {deputy.mandate_start && <> · député depuis le {formatDate(deputy.mandate_start)}</>}
          {deputy.mandate_end && <> · mandat terminé le {formatDate(deputy.mandate_end)}</>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <FollowDeputyButton deputyId={id} />
          <ShareButton
            url={`/deputes/${id}`}
            title={`${deputy.full_name} - MonÉlu`}
            text={`Bilan de mandat et votes de ${deputy.full_name}`}
            ariaLabel="Partager ce député"
          />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-semibold">
          <Link href={`/deputes/comparer?a=${id}`} className="flex min-h-10 items-center underline underline-offset-2">Comparer</Link>
          <a href={csvUrl.deputyVotes(id)} download className="flex min-h-10 items-center underline underline-offset-2">Historique (CSV)</a>
          <Link href={`/deputes/${id}/dossier`} target="_blank" className="flex min-h-10 items-center underline underline-offset-2">Dossier imprimable</Link>
        </div>
      </section>

      <nav aria-label="Sections" className="flex gap-2 overflow-x-auto border-b border-[color:var(--dp-border)] px-4 py-3 [scrollbar-width:none]">
        {scorecard && <a href="#bilan-mobile" className="flex h-9 flex-none items-center rounded-full border border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] px-3.5 text-[13px] font-semibold">Bilan</a>}
        {alignment && <a href="#groupe-mobile" className="flex h-9 flex-none items-center rounded-full border border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] px-3.5 text-[13px] font-semibold">Avec son groupe</a>}
        {recentVotes && recentVotes.items.length > 0 && <a href="#votes-mobile" className="flex h-9 flex-none items-center rounded-full border border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] px-3.5 text-[13px] font-semibold">Votes</a>}
      </nav>

      {scorecard && (
        <PhoneSection id="bilan-mobile" eyebrow="Bilan de mandat">
          <Card className="flex flex-col gap-3.5">
            <h2 className="font-newsreader text-[22px] font-medium">{NUMBER.format(scorecard.total_votes)} scrutins sur ce mandat</h2>
            <SplitBar pour={scorecard.votes_for} contre={scorecard.votes_against} abstention={scorecard.abstentions} height={12} />
            <dl className="grid grid-cols-2 gap-2">
              {[
                ['Pour', scorecard.votes_for, 'var(--dp-green)'],
                ['Contre', scorecard.votes_against, 'var(--dp-red)'],
                ['Abstention', scorecard.abstentions, 'var(--dp-abstention)'],
                ['Non-votant', nonVotant, 'var(--dp-track-bg)'],
              ].map(([label, value, dot]) => (
                <div key={label as string} className="flex flex-col rounded-xl bg-[color:var(--dp-page-bg)] p-2.5">
                  <dt className="order-last flex items-center gap-1.5 text-xs text-[color:var(--dp-text-secondary)]">
                    <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: dot as string }} />
                    {label}
                  </dt>
                  <dd className="order-first font-serif text-[22px]">{NUMBER.format(value as number)}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs leading-normal text-[color:var(--dp-text-secondary)]">
              Non-votant : présent en séance sans exprimer de vote, à ne pas confondre avec l&apos;abstention.
            </p>
          </Card>
          {solennel !== null && (
            <Card className="flex flex-col gap-2.5">
              <span className="text-[15px] font-bold leading-snug">Participation aux scrutins solennels</span>
              <div className="flex items-baseline gap-2.5">
                <span className="font-serif text-[44px] leading-none">{solennel} %</span>
                {avgSolennel !== null && (
                  <span className={`text-[13px] font-semibold ${solennel >= avgSolennel ? 'text-[color:var(--dp-badge-pos-text)]' : 'text-[color:var(--dp-red)]'}`}>
                    {solennel >= avgSolennel ? 'au-dessus de la moyenne' : 'sous la moyenne'}
                  </span>
                )}
              </div>
              <div aria-hidden="true" className="relative h-2.5 rounded-full bg-[color:var(--dp-track-bg)]">
                <span className="absolute inset-y-0 left-0 rounded-full bg-[color:var(--dp-text)]" style={{ width: `${solennel}%` }} />
                {avgSolennel !== null && <span className="absolute -top-1 h-[18px] w-0.5 bg-[color:var(--dp-red)]" style={{ left: `${avgSolennel}%` }} />}
              </div>
              {avgSolennel !== null && <span className="text-xs text-[color:var(--dp-text-secondary)]">Moyenne des députés : {avgSolennel} %</span>}
              <p className="text-xs leading-normal text-[color:var(--dp-text-secondary)]">
                Les scrutins solennels portent sur l&apos;ensemble d&apos;un texte, quand tous les groupes sont attendus : la mesure la plus proche d&apos;une présence aux votes qui comptent.
              </p>
            </Card>
          )}
        </PhoneSection>
      )}

      {alignment && alignmentPct !== null && (
        <PhoneSection id="groupe-mobile" eyebrow="Alignement avec son groupe">
          <Card className="flex flex-col gap-3">
            <h2 className="font-newsreader text-[22px] font-medium">Vote comme son groupe {alignmentPct} % du temps</h2>
            <div aria-hidden="true" className="h-2.5 rounded-full bg-[color:var(--dp-track-bg)]">
              <div className="h-full rounded-full bg-[color:var(--dp-text)]" style={{ width: `${alignmentPct}%` }} />
            </div>
            <p className="text-[13px] text-[color:var(--dp-text-secondary)]">
              {NUMBER.format(alignment.dissident_votes)} vote{alignment.dissident_votes !== 1 ? 's' : ''} contre la ligne du groupe, sur {NUMBER.format(alignment.total_votes)}.
            </p>
            {dissidentVotes && dissidentVotes.items.length > 0 && (
              <ul className="flex flex-col">
                {dissidentVotes.items.slice(0, 5).map(v => (
                  <li key={v.vote_id} className="border-t border-[color:var(--dp-border)]">
                    <Link href={`/votes/${v.vote_id}`} className="flex flex-col gap-1.5 py-2.5">
                      <span className="text-sm leading-snug">{v.vote_title}</span>
                      <span className="flex flex-wrap gap-1.5">
                        <PositionChip position={v.position} prefix="Lui" />
                        <PositionChip position={v.majority_position} prefix="Groupe" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </PhoneSection>
      )}

      {recentVotes && recentVotes.items.length > 0 && (
        <PhoneSection id="votes-mobile" eyebrow="Votes marquants">
          <div className={`${cardClass} px-4 py-1.5`}>
            <ul>
              {recentVotes.items.map(v => (
                <li key={v.vote_id} className="border-b border-[color:var(--dp-border)] last:border-b-0">
                  <Link href={`/votes/${v.vote_id}`} className="grid grid-cols-[64px_minmax(0,1fr)] gap-2.5 py-3">
                    <span className="pt-0.5 font-mono text-[11px] text-[color:var(--dp-text-secondary)]">{v.voted_at ? formatDate(v.voted_at) : ''}</span>
                    <span className="flex flex-col gap-1.5">
                      <span className="text-sm leading-snug">{v.summary_plain || v.vote_title}</span>
                      <span className="flex flex-wrap gap-1.5">
                        <PositionChip position={v.position} />
                        {v.result && <ResultBadge result={v.result} />}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {recentVotes.total > recentVotes.items.length && (
              <p className="py-3 text-center text-[13px] text-[color:var(--dp-text-secondary)]">
                {NUMBER.format(recentVotes.total)} votes au total sur ce mandat
              </p>
            )}
          </div>
        </PhoneSection>
      )}

      <Link href={`/quiz?deputy=${id}`} className="dp-dark mx-4 mt-6 flex items-center gap-3 rounded-[20px] bg-navy p-4 text-white">
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[color:var(--dp-accent)]">Le quiz</span>
          <span className="text-base font-bold">Votez-vous comme {deputy.full_name} ?</span>
        </span>
        <span aria-hidden="true">→</span>
      </Link>
      <div className="flex justify-center px-4 pt-4">
        <ReportErrorButton entityType="deputy" entityId={id} entityLabel={deputy.full_name} pageUrl={`/deputes/${id}`} />
      </div>
    </div>
  )
}
