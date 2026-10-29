import Link from 'next/link'
import { ShareButton } from '@/components/ShareButton'
import { ReportErrorButton } from '@/components/ReportErrorButton'
import { csvUrl } from '@/lib/api'
import { anScrutinUrl } from '@/lib/an'
import { groupSlug } from '@/lib/groups'
import { Eyebrow, ResultBadge, SplitBar, cardClass } from '@/components/phone/kit'

// The vote page's phone pieces (canvas "Vote"). The body sections the two
// layouts share (hemicycle, deputy lookup, dissidents, related votes) stay in
// VoteDetailClient; these replace only what does not fit a phone: the hero
// with its side result card, and the six-column group table.

function longDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function VoteHeroMobile({
  voteId,
  voteTitle,
  headline,
  summary,
  result,
  votedAt,
  theme,
  votesFor,
  votesAgainst,
  abstentions,
  pourPct,
  contrePct,
  abstPct,
  majorityRequired,
  dossierUrl,
}: {
  voteId: string
  voteTitle: string
  headline: string
  summary: string | null
  result: string
  votedAt: string
  theme: string | null
  votesFor: number
  votesAgainst: number
  abstentions: number
  pourPct: number
  contrePct: number
  abstPct: number
  majorityRequired: number | null
  dossierUrl: string | null
}) {
  const adopted = result === 'adopté'
  const scrutinUrl = anScrutinUrl(voteId)
  return (
    <div className="flex flex-col gap-4 px-4 pb-2 pt-4 md:hidden">
      <Link href="/votes" className="flex items-center gap-1 self-start text-sm font-semibold text-[color:var(--dp-red)]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Scrutins
      </Link>

      <div className="flex flex-col gap-3 px-1">
        <Eyebrow>
          <span suppressHydrationWarning>Scrutin n°{voteId} · {longDate(votedAt)}</span>
        </Eyebrow>
        <h1 className="font-newsreader text-[30px] font-medium leading-[1.12] text-[color:var(--dp-text)]">{headline}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <ResultBadge result={result} />
          {theme && (
            <span className="rounded-md bg-[color:var(--dp-badge-info-bg)] px-2 py-0.5 text-xs font-semibold text-[color:var(--dp-badge-info-text)]">
              {theme}
            </span>
          )}
        </div>
      </div>

      <div className={`${cardClass} flex flex-col gap-3.5 p-4`}>
        <dl className="grid grid-cols-3 text-center">
          <div className="flex flex-col-reverse">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--dp-badge-pos-text)]">Pour</dt>
            <dd className="font-mono text-xs text-[color:var(--dp-text-muted)]">{votesFor.toLocaleString('fr-FR')} voix</dd>
            <dd className="font-newsreader text-[30px] font-semibold leading-tight">{pourPct}&nbsp;%</dd>
          </div>
          <div className="flex flex-col-reverse border-x border-[color:var(--dp-track-bg)]">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--dp-red)]">Contre</dt>
            <dd className="font-mono text-xs text-[color:var(--dp-text-muted)]">{votesAgainst.toLocaleString('fr-FR')} voix</dd>
            <dd className="font-newsreader text-[30px] font-semibold leading-tight">{contrePct}&nbsp;%</dd>
          </div>
          <div className="flex flex-col-reverse">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--dp-text-secondary)]">Abst.</dt>
            <dd className="font-mono text-xs text-[color:var(--dp-text-muted)]">{abstentions.toLocaleString('fr-FR')} voix</dd>
            <dd className="font-newsreader text-[30px] font-semibold leading-tight">{abstPct}&nbsp;%</dd>
          </div>
        </dl>
        <SplitBar pour={votesFor} contre={votesAgainst} abstention={abstentions} />
        <p className="text-[13px] leading-relaxed text-[color:var(--dp-text-secondary)]">
          En part des votants (pour, contre et abstention).
          {majorityRequired != null && <> Majorité requise : {majorityRequired.toLocaleString('fr-FR')} voix.</>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {scrutinUrl && (
            <a
              href={scrutinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="dp-dark flex h-11 flex-1 items-center justify-center rounded-xl bg-navy px-4 text-sm font-semibold text-white dark:bg-[color:var(--dp-active-bg)]"
            >
              Texte officiel
            </a>
          )}
          <a
            href={csvUrl.votePositions(voteId)}
            download
            aria-label="Télécharger les positions en CSV"
            className="flex h-11 items-center rounded-xl border border-[color:var(--dp-border)] px-3.5 text-sm font-semibold text-[color:var(--dp-text)]"
          >
            CSV
          </a>
          <ShareButton
            url={`/votes/${voteId}`}
            title={`${adopted ? 'Adopté' : 'Rejeté'} - ${headline}`}
            text="Suivez ce scrutin sur MonÉlu"
            ariaLabel="Partager ce vote"
          />
        </div>
      </div>

      {(summary || dossierUrl) && (
        <div className="flex flex-col gap-2 px-1 text-sm leading-relaxed text-[color:var(--dp-text-secondary)]">
          {summary && (
            <p>
              <span className="font-semibold">Titre officiel :</span> {voteTitle}
            </p>
          )}
          {dossierUrl && (
            <a href={dossierUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-[color:var(--dp-red)]">
              Voir le dossier officiel →
            </a>
          )}
        </div>
      )}
      <div className="flex justify-center">
        <ReportErrorButton entityType="vote" entityId={voteId} entityLabel={voteTitle} pageUrl={`/votes/${voteId}`} />
      </div>
    </div>
  )
}

export interface GroupBreakdown {
  name: string
  color: string
  pour: number
  contre: number
  abst: number
  nonVotant: number
  position: 'Pour' | 'Contre' | 'Partagé'
  forPct: number
  agtPct: number
  abstPct: number
  participants: number
  members: number | null
  participationPct: number | null
}

/** Each group's split as a card: name, majority, bar and counts. */
export function GroupBreakdownMobile({ groups }: { groups: GroupBreakdown[] }) {
  return (
    <ul className="flex flex-col gap-2 md:hidden">
      {groups.map(g => {
        const href = groupSlug(g.name)
        const tone =
          g.position === 'Pour'
            ? 'bg-[color:var(--dp-badge-pos-bg)] text-[color:var(--dp-badge-pos-text)]'
            : g.position === 'Contre'
              ? 'bg-[color:var(--dp-badge-neg-bg)] text-[color:var(--dp-badge-neg-text)]'
              : 'bg-[color:var(--dp-badge-neutral-bg)] text-[color:var(--dp-badge-neutral-text)]'
        return (
          <li key={g.name} className={`${cardClass} flex flex-col gap-2.5 p-3.5`}>
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: g.color }} />
              {href ? (
                <Link href={`/groupes/${href}`} className="min-w-0 flex-1 truncate text-[15px] font-bold">
                  {g.name}
                </Link>
              ) : (
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{g.name}</span>
              )}
              <span className={`flex-none rounded-md px-2 py-0.5 text-xs font-bold ${tone}`}>{g.position}</span>
            </div>
            <SplitBar pour={g.pour} contre={g.contre} abstention={g.abst} height={8} />
            <p className="text-[13px] text-[color:var(--dp-text-secondary)]">
              {g.forPct} % pour ({g.pour}) · {g.agtPct} % contre ({g.contre}) · {g.abstPct} % abst. ({g.abst})
              {g.nonVotant > 0 ? ` · ${g.nonVotant} non-votant${g.nonVotant > 1 ? 's' : ''}` : ''}
            </p>
            {g.participationPct != null && (
              <p className="text-[13px] text-[color:var(--dp-text-secondary)]">
                Participation : <span className="font-semibold text-[color:var(--dp-text)]">{g.participationPct} %</span> ({g.participants} sur {g.members} membres)
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
