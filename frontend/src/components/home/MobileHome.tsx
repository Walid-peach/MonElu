'use client'
import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import type { AssemblyStats, LeadVoteSummary } from './LiveAssemblyPulse'
import type { DeputyInfo } from '@/app/page'
import { DeputyAvatar } from '@/components/DeputyAvatar'
import { isStandalone } from '@/lib/installState'
import { recordInstallEvent } from '@/lib/installEvents'
import { openMobileMenu } from '@/lib/mobileMenu'

type Props = {
  stats: AssemblyStats
  leadVote: LeadVoteSummary
  deputyInfo: DeputyInfo | null
}

export type HemicycleDot = { x: number; y: number; kind: 'pour' | 'contre' | 'abstention' }

const NUMBER = new Intl.NumberFormat('fr-FR')
const noopSubscribe = () => () => {}

/**
 * A stylised hemicycle for the phone hero: seven rows of dots, filled left to
 * right in the proportions of the lead vote (pour, then abstention, then
 * contre). It illustrates a real split; the exact counts are in the legend.
 */
export function heroHemicycleDots(votesFor: number, votesAgainst: number, abstentions: number): HemicycleDot[] {
  const cx = 150
  const cy = 150
  const raw: Array<{ x: number; y: number; angle: number }> = []
  for (let r = 64; r <= 148; r += 14) {
    const n = Math.round((Math.PI * r) / 12)
    for (let i = 0; i <= n; i++) {
      const angle = Math.PI - (Math.PI * i) / n
      raw.push({ x: Math.round(cx + r * Math.cos(angle)), y: Math.round(cy - r * Math.sin(angle)), angle })
    }
  }
  // Left to right across the whole chamber, as seats are read.
  raw.sort((a, b) => b.angle - a.angle)
  const total = votesFor + votesAgainst + abstentions
  const forShare = total > 0 ? votesFor / total : 0.5
  const abstShare = total > 0 ? abstentions / total : 0
  return raw.map(({ x, y }, i) => {
    const f = i / raw.length
    const kind = f < forShare ? 'pour' : f < forShare + abstShare ? 'abstention' : 'contre'
    return { x, y, kind }
  })
}

const DOT_FILL: Record<HemicycleDot['kind'], string> = {
  pour: 'var(--dp-solid-bg)',
  contre: '#C9302C',
  abstention: '#B9B4AA',
}

const eyebrow = 'font-mono text-[11px] uppercase tracking-[0.12em]'

/** Hidden inside the installed web app, which has nothing left to install. */
function InstallButton() {
  const standalone = useSyncExternalStore(noopSubscribe, isStandalone, () => false)
  if (standalone) return null
  return (
    <Link
      href="/application"
      onClick={() => recordInstallEvent('install_section_tap')}
      className="flex h-14 items-center justify-center gap-2.5 rounded-2xl bg-red-civic text-[17px] font-bold text-white shadow-[0_6px_18px_rgba(201,48,44,0.28)] active:scale-[0.99]"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="6" y="2" width="12" height="20" rx="3" />
        <path d="M11 18h2" />
      </svg>
      Installer l&apos;application
    </Link>
  )
}

function FeatureCard({
  index,
  href,
  title,
  text,
  children,
}: {
  index: string
  href: string
  title: string
  text: string
  children: React.ReactNode
}) {
  return (
    <Link href={href} className="group flex flex-col gap-3.5">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[13px] text-[color:var(--dp-red)]" aria-hidden="true">
          {index}
        </span>
        <h3 className="font-newsreader text-[23px] font-medium leading-tight text-[color:var(--dp-text)]">{title}</h3>
        <span aria-hidden="true" className="ml-auto text-[color:var(--dp-text)] transition-transform group-active:translate-x-0.5">
          →
        </span>
      </div>
      <p className="text-[15px] leading-relaxed text-[color:var(--dp-text-secondary)]">{text}</p>
      <div aria-hidden="true" className="flex flex-col gap-3 rounded-2xl bg-gray-off dark:bg-[color:var(--dp-page-bg)] p-3.5">
        {children}
      </div>
    </Link>
  )
}

function SplitBar({ votesFor, votesAgainst, abstentions }: { votesFor: number; votesAgainst: number; abstentions: number }) {
  return (
    <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
      <span className="bg-[color:var(--dp-solid-bg)]" style={{ flex: Math.max(votesFor, 0) }} />
      <span className="bg-red-civic" style={{ flex: Math.max(votesAgainst, 0) }} />
      <span className="bg-[#B9B4AA]" style={{ flex: Math.max(abstentions, 0) }} />
    </div>
  )
}

/**
 * The homepage below `md`: what MonÉlu does, and the way to install it.
 *
 * Rendered inside `AssemblyScrollExperience` on every viewport and hidden from
 * `md` up, so its `<h1>` stays the page's single h1 (MON-270). Every figure in
 * it is the page's real data: the lead vote and the deputy who voted on it.
 */
export function MobileHome({ stats, leadVote, deputyInfo }: Props) {
  const dots = heroHemicycleDots(leadVote.votesFor, leadVote.votesAgainst, leadVote.abstentions)

  return (
    <div className="md:hidden">
      <section className="flex flex-col gap-5 bg-gray-off dark:bg-[color:var(--dp-page-bg)] px-5 pb-10 pt-6 text-[color:var(--dp-text)]">
        {/* The top bar stays hidden until this hero scrolls past, so the hero
            carries the wordmark and ☰ (H1); the installed app has its tab bar. */}
        <div className="-mb-1 flex items-center justify-between installed:hidden">
          <span className="font-serif text-2xl text-[color:var(--dp-text)]">
            Mon<span className="text-[color:var(--dp-red)]">É</span>lu
          </span>
          <button
            type="button"
            onClick={openMobileMenu}
            aria-label="Ouvrir le menu"
            aria-haspopup="dialog"
            aria-controls="menu-mobile"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] text-[color:var(--dp-text)]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h10" />
            </svg>
          </button>
        </div>
        <p className={`${eyebrow} text-[color:var(--dp-text-muted)]`}>Assemblée nationale · 17e législature</p>
        {/* The page's single `<h1>` (MON-270). This section is server-rendered on
            every viewport - the cinematic only ever adds `<h2>`s. */}
        <h1 className="font-serif text-[40px] leading-[1.02] tracking-[-0.01em] text-[color:var(--dp-text)]">
          La vie politique française, <em className="text-[color:var(--dp-red)]">enfin lisible.</em>
        </h1>
        <p className="text-[17px] leading-normal text-[color:var(--dp-text-secondary)]">
          <strong className="font-semibold text-[color:var(--dp-text)]">Chaque vote. Chaque député. En français clair.</strong>{' '}
          MonÉlu montre comment votent les 577 députés, scrutin par scrutin, et explique chaque texte sans jargon.
        </p>

        <div className="flex flex-col gap-2.5">
          <InstallButton />
          <Link
            href="/mon-depute"
            className="flex h-[52px] items-center justify-center gap-2 rounded-2xl border-[1.5px] border-[color:var(--dp-text)] text-base font-medium text-[color:var(--dp-text)]"
          >
            Trouver mon député
            <span aria-hidden="true">→</span>
          </Link>
          <p className="mt-0.5 text-center text-[13px] text-[color:var(--dp-text-muted)]">
            Gratuit · données officielles de l&apos;Assemblée · {stats.lastUpdated}
          </p>
        </div>

        <figure className="flex flex-col items-center gap-3 rounded-[20px] border border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] px-4 pb-4 pt-5">
          <svg viewBox="0 0 300 158" className="w-full max-w-[300px]" aria-hidden="true">
            {dots.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r={4} fill={DOT_FILL[d.kind]} />
            ))}
          </svg>
          <figcaption className="flex w-full flex-col gap-2.5">
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[13px] text-[color:var(--dp-text-secondary)]">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[color:var(--dp-solid-bg)]" />Pour {NUMBER.format(leadVote.votesFor)}</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-civic" />Contre {NUMBER.format(leadVote.votesAgainst)}</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#B9B4AA]" />Abstention {NUMBER.format(leadVote.abstentions)}</span>
            </div>
            {leadVote.href ? (
              <Link href={leadVote.href} className="line-clamp-2 text-center text-[13px] leading-snug text-[color:var(--dp-text)] underline underline-offset-2">
                <span className="font-semibold">{leadVote.result}</span> · {leadVote.title}
              </Link>
            ) : (
              <p className="text-center text-[13px] text-[color:var(--dp-text-secondary)]">
                <span className="font-semibold text-[color:var(--dp-text)]">{leadVote.result}</span> · {leadVote.title}
              </p>
            )}
          </figcaption>
        </figure>

      </section>

      <section aria-labelledby="ce-que-fait-monelu" className="flex flex-col gap-8 border-t border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] px-5 py-10">
        <div className="flex flex-col gap-2.5">
          <p className={`${eyebrow} text-[color:var(--dp-red)]`}>Ce que fait MonÉlu</p>
          <h2 id="ce-que-fait-monelu" className="font-newsreader text-[32px] font-medium leading-[1.1] text-[color:var(--dp-text)]">
            Quatre gestes pour suivre ceux qui votent en votre nom.
          </h2>
        </div>

        <FeatureCard
          index="01"
          href="/mon-depute"
          title="Suivre votre député"
          text="Ses votes, sa présence, ses désaccords avec son groupe. Tout ce qu'il fait à l'Assemblée, sur une page."
        >
          {deputyInfo ? (
            <>
              {/* A real deputy, but not the visitor's own: say so (PR #609 review). */}
              <span className={`${eyebrow} text-[color:var(--dp-text-muted)]`}>Exemple</span>
              <div className="flex items-center gap-2.5">
                <DeputyAvatar name={deputyInfo.name} photoUrl={deputyInfo.photoUrl} decorative />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-bold text-[color:var(--dp-text)]">{deputyInfo.name}</span>
                  <span className="truncate text-xs text-[color:var(--dp-text-secondary)]">
                    {deputyInfo.party} · {deputyInfo.department}
                  </span>
                </div>
                <span className="rounded-full bg-[color:var(--dp-solid-bg)] px-3 py-1.5 text-[13px] text-[color:var(--dp-solid-text)]">Suivre</span>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="rounded-md bg-[color:var(--dp-solid-bg)] px-2 py-1 font-medium text-[color:var(--dp-solid-text)]">Pour {NUMBER.format(deputyInfo.votesFor)}</span>
                <span className="rounded-md bg-red-civic px-2 py-1 font-medium text-white">Contre {NUMBER.format(deputyInfo.votesAgainst)}</span>
                <span className="rounded-md bg-[#EDECEA] dark:bg-[color:var(--dp-track-bg)] px-2 py-1 font-medium text-[color:var(--dp-text)]">Abst. {NUMBER.format(deputyInfo.abstentions)}</span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2.5">
              <span className="h-10 w-10 rounded-full bg-[#E0DED9] dark:bg-[color:var(--dp-border)]" />
              <span className="h-2.5 flex-1 rounded-full bg-[#E0DED9] dark:bg-[color:var(--dp-border)]" />
            </div>
          )}
        </FeatureCard>

        <FeatureCard
          index="02"
          href="/votes"
          title="Comprendre chaque vote"
          text="Chaque scrutin résumé en quelques lignes, le résultat, et qui a voté quoi dans l'hémicycle."
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[11px] text-[color:var(--dp-text-muted)]">{leadVote.votedAt || 'SCRUTIN'}</span>
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                leadVote.result === 'Adopté'
                  ? 'bg-[color:var(--dp-badge-info-bg)] text-[color:var(--dp-badge-info-text)]'
                  : 'bg-[color:var(--dp-badge-neg-bg)] text-[color:var(--dp-badge-neg-text)]'
              }`}
            >
              {leadVote.result}
            </span>
          </div>
          <span className="line-clamp-3 font-newsreader text-[17px] leading-snug text-[color:var(--dp-text)]">{leadVote.title}</span>
          <SplitBar votesFor={leadVote.votesFor} votesAgainst={leadVote.votesAgainst} abstentions={leadVote.abstentions} />
        </FeatureCard>

        <FeatureCard
          index="03"
          href="/chat?mode=verify"
          title="Vérifier ce qu'on entend"
          text="Collez une phrase entendue à la télé ou lue en ligne : MonÉlu la confronte aux votes réels et cite ses sources."
        >
          <div className="rounded-[14px] rounded-bl-[4px] border border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] p-3 font-newsreader text-base italic text-[color:var(--dp-text)]">
            « Mon député n&apos;a pas voté ce texte. »
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <span className="rounded-full border border-[color:var(--dp-border)] px-2.5 py-1 text-[color:var(--dp-text-secondary)]">Vrai</span>
            <span className="rounded-full border border-[color:var(--dp-border)] px-2.5 py-1 text-[color:var(--dp-text-secondary)]">Faux</span>
            <span className="rounded-full bg-red-civic px-2.5 py-1 font-bold text-white">Trompeur</span>
            <span className="rounded-full border border-[color:var(--dp-border)] px-2.5 py-1 text-[color:var(--dp-text-secondary)]">Invérifiable</span>
          </div>
        </FeatureCard>

        <FeatureCard
          index="04"
          href="/quiz"
          title="Trouver qui vote comme vous"
          text="Répondez aux questions que les députés ont votées, une par thème, et voyez de qui vous êtes le plus proche."
        >
          <div className="flex gap-1">
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} className={`h-1 flex-1 rounded-full ${i < 3 ? 'bg-[color:var(--dp-solid-bg)]' : 'bg-[#E0DED9] dark:bg-[color:var(--dp-border)]'}`} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <span className="flex h-11 items-center justify-center rounded-xl bg-[color:var(--dp-solid-bg)] text-[15px] font-medium text-[color:var(--dp-solid-text)]">Pour</span>
            <span className="flex h-11 items-center justify-center rounded-xl bg-red-civic text-[15px] font-medium text-white">Contre</span>
          </div>
        </FeatureCard>
      </section>
    </div>
  )
}
