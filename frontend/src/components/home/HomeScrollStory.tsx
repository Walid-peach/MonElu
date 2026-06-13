'use client'

import Image from 'next/image'
import Link from 'next/link'
import {
  animate,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { HeroSearch } from '@/components/HeroSearch'

type StatInput = {
  deputies: number
  votes: number
  positions: number
  lastUpdated: string
}

type LeadVoteInput = {
  title: string
  votesFor: number
  votesAgainst: number
  abstentions: number
  href?: string
}

type HomeScrollStoryProps = {
  stats: StatInput
  leadVote: LeadVoteInput
}

type VoteStatus = 'for' | 'against' | 'abstention' | 'nonVoting'

type VoteDot = {
  id: number
  status: VoteStatus
  x: number
  y: number
}

const POPULAR_SEARCHES = [
  { label: 'Paris 15e', href: '/deputes?search=Paris' },
  { label: 'Marine Le Pen', href: '/deputes?search=Marine%20Le%20Pen' },
  { label: 'Retraites', href: '/votes?theme=Retraites' },
  { label: 'Budget', href: '/votes?theme=Budget' },
  { label: 'Éducation', href: '/votes?theme=%C3%89ducation' },
]

const TRUST_ITEMS = [
  'Données officielles',
  "Mise à jour aujourd'hui",
  'Sources vérifiables',
  'Neutre & indépendant',
]

const VOTE_COUNTS: Record<VoteStatus, number> = {
  for: 289,
  against: 223,
  abstention: 58,
  nonVoting: 27,
}

const VOTE_TOTAL = Object.values(VOTE_COUNTS).reduce((sum, count) => sum + count, 0)

const STATUS_STYLE: Record<VoteStatus, { label: string; className: string }> = {
  for: { label: 'Pour', className: 'bg-emerald-500 shadow-emerald-900/10' },
  against: { label: 'Contre', className: 'bg-red-civic shadow-red-civic/15' },
  abstention: { label: 'Abstention', className: 'bg-amber-400 shadow-amber-900/10' },
  nonVoting: { label: 'Non votant', className: 'bg-gray-mid shadow-navy/10' },
}

const STORY_STEPS = [
  {
    eyebrow: "L'Assemblée s'anime",
    title: "L'Assemblée vote chaque semaine.",
    body: 'Des scrutins techniques, parfois longs, deviennent le signal de départ.',
  },
  {
    eyebrow: '577 sièges, 577 trajectoires',
    title: 'Chaque siège représente un député.',
    body: 'Chaque parlementaire laisse une trace: pour, contre, abstention ou non-votant.',
  },
  {
    eyebrow: 'De la séance à la donnée',
    title: 'MonÉlu transforme le bruit politique en lecture claire.',
    body: 'La chambre disparaît progressivement pour révéler les positions individuelles.',
  },
]

function formatCount(value: number, compact = false) {
  if (compact && value >= 1000) return `${Math.round(value / 1000)}k`
  return value.toLocaleString('fr-FR')
}

function statusForIndex(index: number): VoteStatus {
  const mixed = (index * 97) % VOTE_TOTAL
  if (mixed < VOTE_COUNTS.for) return 'for'
  if (mixed < VOTE_COUNTS.for + VOTE_COUNTS.against) return 'against'
  if (mixed < VOTE_COUNTS.for + VOTE_COUNTS.against + VOTE_COUNTS.abstention) {
    return 'abstention'
  }
  return 'nonVoting'
}

function buildVoteDots(total = VOTE_TOTAL) {
  const rows = [33, 47, 61, 75, 89, 113, 179]
  const dots: VoteDot[] = []
  let index = 0

  rows.forEach((count, rowIndex) => {
    const radius = 24 + rowIndex * 5.4
    const startAngle = 205
    const endAngle = 335

    for (let i = 0; i < count && index < total; i += 1) {
      const angle = startAngle + (endAngle - startAngle) * (i / Math.max(count - 1, 1))
      const radians = (angle * Math.PI) / 180
      dots.push({
        id: index,
        status: statusForIndex(index),
        x: Number((50 + Math.cos(radians) * radius).toFixed(2)),
        y: Number((82 + Math.sin(radians) * radius).toFixed(2)),
      })
      index += 1
    }
  })

  return dots
}

function CountUpNumber({
  value,
  compact = false,
  className,
}: {
  value: number
  compact?: boolean
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const [display, setDisplay] = useState(formatCount(value, compact))

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(formatCount(value, compact))
      return
    }

    const controls = animate(0, value, {
      duration: 1.2,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: latest => setDisplay(formatCount(Math.round(latest), compact)),
    })

    return () => controls.stop()
  }, [compact, reduceMotion, value])

  return <span className={className}>{display}</span>
}

function TrustRow({ lastUpdated }: { lastUpdated: string }) {
  return (
    <div className="grid gap-px overflow-hidden border border-white/12 bg-white/12 text-xs font-semibold uppercase text-white/60 sm:grid-cols-2 lg:grid-cols-4">
      {TRUST_ITEMS.map((item, index) => (
        <div key={item} className="bg-navy/40 px-3 py-2.5 backdrop-blur-sm">
          <span>{index === 1 ? lastUpdated : item}</span>
        </div>
      ))}
    </div>
  )
}

function LiveAssemblyPulse({
  stats,
  leadVote,
  compact = false,
}: {
  stats: StatInput
  leadVote: LeadVoteInput
  compact?: boolean
}) {
  const reduceMotion = useReducedMotion()
  const total = Math.max(leadVote.votesFor + leadVote.votesAgainst + leadVote.abstentions, 1)
  const forPct = Math.round((leadVote.votesFor / total) * 100)
  const againstPct = Math.round((leadVote.votesAgainst / total) * 100)
  const abstentionPct = Math.max(0, 100 - forPct - againstPct)

  const statItems = [
    { value: stats.deputies, label: 'députés suivis', compact: false },
    { value: stats.votes, label: 'votes analysés', compact: false },
    { value: stats.positions, label: 'positions individuelles', compact: true },
  ]

  return (
    <motion.aside
      initial={reduceMotion ? false : { opacity: 0, x: compact ? 0 : 34 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.7, delay: compact ? 0.18 : 0.42, ease: [0.22, 1, 0.36, 1] }}
      className={
        compact
          ? 'border border-navy/10 bg-white/90 p-4 text-navy shadow-2xl shadow-navy/12 backdrop-blur-md'
          : 'border border-white/14 bg-navy/88 p-5 text-white shadow-2xl shadow-black/40 backdrop-blur-xl'
      }
    >
      <div className="flex items-start justify-between gap-4 border-b border-current/10 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase opacity-55">L&apos;Assemblée en direct</p>
          <p className="mt-1 text-lg font-semibold">Lecture du dernier signal.</p>
        </div>
        <motion.span
          aria-hidden="true"
          animate={reduceMotion ? undefined : { scale: [1, 1.3, 1], opacity: [1, 0.72, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          className="mt-1 h-2.5 w-2.5 rounded-full bg-red-civic shadow-[0_0_0_5px_rgba(201,48,44,0.22),0_0_12px_rgba(201,48,44,0.35)]"
        />
      </div>

      <div className="grid grid-cols-3 gap-3 border-b border-current/10 py-4">
        {statItems.map(item => (
          <div key={item.label}>
            <p className="font-serif text-3xl leading-none md:text-4xl">
              <CountUpNumber value={item.value} compact={item.compact} />
            </p>
            <p className="mt-2 text-[10px] font-semibold uppercase opacity-55 md:text-xs">
              {item.label}
            </p>
          </div>
        ))}
      </div>

      <div className="pt-4">
        <p className="text-xs font-semibold uppercase opacity-55">Dernier scrutin important</p>
        <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 md:line-clamp-3">
          {leadVote.title}
        </p>
        <div className="mt-4 h-2 overflow-hidden bg-current/12" aria-hidden="true">
          <motion.div
            className="flex h-full origin-left"
            initial={reduceMotion ? false : { scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="bg-emerald-500" style={{ width: `${forPct}%` }} />
            <div className="bg-red-civic" style={{ width: `${againstPct}%` }} />
            <div className="bg-amber-400" style={{ width: `${abstentionPct}%` }} />
          </motion.div>
        </div>
        <div className="mt-2 grid grid-cols-3 text-xs opacity-60">
          <span>{leadVote.votesFor} pour</span>
          <span className="text-center">{leadVote.votesAgainst} contre</span>
          <span className="text-right">{leadVote.abstentions} abst.</span>
        </div>
        {leadVote.href && (
          <Link
            href={leadVote.href}
            className="mt-4 inline-flex text-sm font-semibold opacity-70 transition-opacity hover:opacity-100"
          >
            Voir le scrutin →
          </Link>
        )}
      </div>
    </motion.aside>
  )
}

function AssemblyChamberVisual({
  scale,
  x,
  imageOpacity,
  dotOpacity,
  showCaption = true,
  className = '',
}: {
  scale?: MotionValue<number>
  x?: MotionValue<number>
  imageOpacity?: MotionValue<number>
  dotOpacity?: MotionValue<number>
  showCaption?: boolean
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const previewDots = useMemo(() => buildVoteDots(210), [])

  return (
    <motion.div
      className={`relative isolate overflow-hidden border border-white/12 bg-navy shadow-2xl shadow-navy/30 ${className}`}
      style={reduceMotion ? undefined : { scale, x }}
    >
      <motion.div className="absolute inset-0" style={reduceMotion ? undefined : { opacity: imageOpacity }}>
        <Image
          src="/assemblee_nationale.jpg"
          alt="Façade de l'Assemblée Nationale, utilisée comme métaphore de la chambre parlementaire"
          fill
          priority
          sizes="(min-width: 1024px) 48vw, (min-width: 768px) 52vw, 100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(13,31,60,0.08),rgba(13,31,60,0.88))]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_52%_36%,rgba(255,255,255,0.36),transparent_34%)]" />
      </motion.div>

      <motion.div
        className="absolute inset-0 bg-navy/70"
        style={reduceMotion ? { opacity: 0.35 } : { opacity: dotOpacity }}
      />
      <motion.div
        aria-hidden="true"
        className="absolute inset-x-[8%] bottom-[12%] top-[26%]"
        style={reduceMotion ? { opacity: 0.45 } : { opacity: dotOpacity }}
      >
        {previewDots.map((dot, index) => (
          <motion.span
            key={dot.id}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.4 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: '-120px' }}
            transition={{ duration: 0.35, delay: Math.min(index * 0.003, 0.55) }}
            className={`absolute h-1.5 w-1.5 rounded-full shadow-sm ${STATUS_STYLE[dot.status].className}`}
            style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
          />
        ))}
      </motion.div>

      {showCaption && (
        <div className="absolute inset-x-6 bottom-6 flex items-end justify-between gap-4 text-white">
          <div>
            <p className="text-xs font-semibold uppercase text-white/48">Assemblée Nationale</p>
            <p className="mt-1 max-w-sm text-sm leading-6 text-white/72">
              Le lieu reste visible pendant que la donnée devient lisible.
            </p>
          </div>
          <div className="hidden border border-white/14 bg-white/8 px-3 py-2 text-xs text-white/65 sm:block">
            Scroll
          </div>
        </div>
      )}
    </motion.div>
  )
}

function HomeHero({ stats, leadVote }: HomeScrollStoryProps) {
  const reduceMotion = useReducedMotion()

  return (
    <section className="relative isolate overflow-hidden bg-navy text-white">
      {/* Full-bleed assembly image — the dark act opens here and runs through the scroll story */}
      <div className="absolute inset-0">
        <Image
          src="/assemblee_nationale.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        {/* Left-weighted scrim for headline legibility, image stays readable on the right */}
        <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(9,21,44,0.97)_0%,rgba(9,21,44,0.9)_34%,rgba(11,26,52,0.56)_64%,rgba(11,26,52,0.74)_100%)]" />
        {/* Vertical grounding — fades to deep navy at the base so it melts into the scroll story */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,21,44,0.5)_0%,transparent_22%,transparent_55%,rgba(13,31,60,0.86)_82%,#0D1F3C_100%)]" />
        {/* Soft spotlight on the dome */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_74%_28%,rgba(255,255,255,0.16),transparent_42%)]" />
      </div>

      <div className="relative z-10 mx-auto grid min-h-[calc(100svh-4rem)] max-w-7xl items-center gap-10 px-4 py-12 md:grid-cols-[1.06fr_0.94fr] md:gap-12 md:px-8 lg:px-12">
        <div className="max-w-2xl">
          <motion.p
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex items-center gap-2 border-l-2 border-red-civic pl-3 text-xs font-semibold uppercase tracking-wide text-red-light"
          >
            Plateforme civique
          </motion.p>
          <motion.h1
            initial={reduceMotion ? false : { opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.72, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 max-w-[12ch] font-serif text-5xl font-normal leading-[0.94] tracking-tight text-white md:text-7xl lg:text-[5.25rem]"
          >
            La vie politique française,{' '}
            <span className="text-red-light">enfin lisible.</span>
          </motion.h1>
          <motion.p
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.68, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 max-w-xl text-lg leading-8 text-white/72 md:text-xl"
          >
            Tous les votes. Tous les députés. Des explications claires. Des sources
            officielles.
          </motion.p>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="mt-8 max-w-xl"
          >
            <HeroSearch
              id="home-hero-search"
              placeholder="Votre commune, code postal ou député..."
              buttonLabel="Comprendre mon député"
            />
          </motion.div>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.36, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 flex flex-wrap items-center gap-2 text-sm"
          >
            <span className="text-white/55">Populaire</span>
            {POPULAR_SEARCHES.map(chip => (
              <Link
                key={chip.label}
                href={chip.href}
                className="border border-white/18 bg-white/10 px-3 py-1.5 font-medium text-white/90 backdrop-blur-sm transition-colors hover:border-white/40 hover:bg-white/20"
              >
                {chip.label}
              </Link>
            ))}
          </motion.div>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.44, ease: [0.22, 1, 0.36, 1] }}
            className="mt-8 hidden max-w-2xl md:block"
          >
            <TrustRow lastUpdated={stats.lastUpdated} />
          </motion.div>
        </div>

        <div className="w-full md:max-w-md md:justify-self-end md:self-center">
          <LiveAssemblyPulse stats={stats} leadVote={leadVote} />
        </div>
      </div>

      {/* Scroll cue */}
      <motion.div
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.7 }}
        className="pointer-events-none absolute inset-x-0 bottom-5 z-10 hidden justify-center text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45 md:flex"
      >
        Faites défiler
      </motion.div>
    </section>
  )
}

function AssemblyScrollStory() {
  const reduceMotion = useReducedMotion()
  const targetRef = useRef<HTMLElement | null>(null)
  const [activeStepIndex, setActiveStepIndex] = useState(0)
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ['start start', 'end end'],
  })

  const chamberScale = useTransform(scrollYProgress, [0, 0.55, 1], [1, 1.08, 1.16])
  const chamberX = useTransform(scrollYProgress, [0, 0.5, 1], [-18, 8, 24])
  const imageOpacity = useTransform(scrollYProgress, [0, 0.55, 0.86, 1], [1, 0.86, 0.32, 0.18])
  const dotOpacity = useTransform(scrollYProgress, [0, 0.58, 0.76, 1], [0, 0, 0.58, 0.94])
  const cardOpacity = useTransform(scrollYProgress, [0, 0.88, 1], [1, 1, 0])

  useMotionValueEvent(scrollYProgress, 'change', latest => {
    const nextStep = latest < 0.33 ? 0 : latest < 0.66 ? 1 : 2
    setActiveStepIndex(current => (current === nextStep ? current : nextStep))
  })

  const activeStep = STORY_STEPS[activeStepIndex]

  return (
    <>
      <section ref={targetRef} className="relative hidden h-[310vh] bg-navy text-white md:block">
        <div className="sticky top-16 flex h-[calc(100svh-4rem)] items-center overflow-hidden">
          <div className="mx-auto grid w-full max-w-7xl grid-cols-[0.82fr_1.18fr] items-center gap-10 px-8 lg:px-12">
            <motion.div
              className="relative flex min-h-[360px] items-center"
              style={reduceMotion ? undefined : { opacity: cardOpacity }}
            >
              <motion.div
                key={activeStep.title}
                initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="border-l-2 border-red-civic pl-3 text-xs font-semibold uppercase text-red-light">
                  {activeStep.eyebrow}
                </p>
                <h2 className="mt-5 max-w-xl font-serif text-4xl leading-[1.06] tracking-tight text-white lg:text-5xl">
                  {activeStep.title}
                </h2>
                <p className="mt-5 max-w-md text-lg leading-8 text-white/62">
                  {activeStep.body}
                </p>
              </motion.div>
            </motion.div>

            <AssemblyChamberVisual
              className="h-[68vh] min-h-[520px]"
              scale={chamberScale}
              x={chamberX}
              imageOpacity={imageOpacity}
              dotOpacity={dotOpacity}
            />
          </div>
        </div>
        {/* Exit gradient — outside sticky so it stays at the physical bottom of the scroll section */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-b from-navy/0 via-navy/60 to-gray-off" />
      </section>

      <section className="bg-navy px-4 py-12 text-white md:hidden">
        <div className="mx-auto max-w-md space-y-4">
          <AssemblyChamberVisual className="h-[300px]" />
          {STORY_STEPS.map(step => (
            <article key={step.title} className="border border-white/12 bg-white/6 p-5">
              <p className="text-xs font-semibold uppercase text-red-light">{step.eyebrow}</p>
              <h2 className="mt-3 font-serif text-3xl leading-tight">{step.title}</h2>
              <p className="mt-3 text-sm leading-6 text-white/62">{step.body}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}

function VoteDotsVisualization({ compact = false }: { compact?: boolean }) {
  const reduceMotion = useReducedMotion()
  const dots = useMemo(() => buildVoteDots(), [])
  const visibleDots = compact ? dots.filter((_, index) => index % 2 === 0) : dots

  return (
    <figure
      className="relative h-[340px] overflow-hidden bg-[#F4F3F0] ring-1 ring-navy/8 shadow-xl shadow-navy/6 md:h-[440px] lg:h-[520px]"
      aria-label="Visualisation schématique d'un scrutin: 289 pour, 223 contre, 58 abstentions et 27 non votants."
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_95%,rgba(13,31,60,0.13),transparent_60%)]" />
      <div aria-hidden="true" className="absolute inset-[7%]">
        {visibleDots.map((dot, index) => (
          <motion.span
            key={dot.id}
            className={`absolute h-2 w-2 rounded-full shadow-sm ${STATUS_STYLE[dot.status].className}`}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.45 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{
              duration: 0.32,
              delay: reduceMotion ? 0 : Math.min(index * 0.0025, 0.7),
              ease: [0.22, 1, 0.36, 1],
            }}
            style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
          />
        ))}
      </div>
      <figcaption className="sr-only">
        Exemple de scrutin: 597 positions individuelles réparties entre pour, contre,
        abstention et non votant.
      </figcaption>
      <div className="absolute inset-x-0 bottom-0 border-t border-navy/8 bg-white/80 px-5 py-4 backdrop-blur-md">
        <p className="text-xs font-semibold uppercase text-navy/44">Complexité convertie</p>
        <p className="mt-1 text-sm leading-6 text-navy/66">
          Une position individuelle devient un point lisible, comparable, sourcé.
        </p>
      </div>
    </figure>
  )
}

function VotePositionsSection() {
  const reduceMotion = useReducedMotion()
  const legendItems: Array<{ status: VoteStatus; value: number }> = [
    { status: 'for', value: VOTE_COUNTS.for },
    { status: 'against', value: VOTE_COUNTS.against },
    { status: 'abstention', value: VOTE_COUNTS.abstention },
    { status: 'nonVoting', value: VOTE_COUNTS.nonVoting },
  ]

  return (
    <section className="relative -mt-20 bg-gray-off px-4 pb-16 pt-24 md:px-8 md:pb-20 md:pt-28 lg:px-12">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.74fr_1.26fr] lg:items-center">
        <div className="lg:pr-4">
          <motion.p
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.48 }}
            className="text-xs font-semibold uppercase text-red-civic"
          >
            Lecture des positions
          </motion.p>
          <motion.h2
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.58, delay: 0.06 }}
            className="mt-3 max-w-3xl font-serif text-4xl leading-tight text-navy md:text-6xl"
          >
            Chaque scrutin contient des centaines de positions.
          </motion.h2>
          <motion.p
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.54, delay: 0.12 }}
            className="mt-4 max-w-2xl text-lg leading-8 text-navy/62"
          >
            MonÉlu transforme ces données brutes en informations claires: qui a voté,
            comment, et ce que cela signifie.
          </motion.p>
        </div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
          className="lg:row-span-2"
        >
          <VoteDotsVisualization />
        </motion.div>

        <motion.aside
          initial={reduceMotion ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="border border-gray-border bg-white p-5 shadow-xl shadow-navy/6 lg:max-w-md"
        >
          <p className="text-xs font-semibold uppercase text-navy/42">Exemple d&apos;un scrutin</p>
          <h3 className="mt-3 font-serif text-3xl text-navy">597 positions</h3>
          <div className="mt-6 space-y-4">
            {legendItems.map(item => (
              <div key={item.status} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span
                    className={`h-3 w-3 rounded-full ${STATUS_STYLE[item.status].className}`}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium text-navy">
                    {STATUS_STYLE[item.status].label}
                  </span>
                </div>
                <CountUpNumber value={item.value} className="font-serif text-2xl text-navy" />
              </div>
            ))}
          </div>
          <div className="mt-6 border-t border-gray-border pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-navy/55">Total</span>
              <CountUpNumber value={VOTE_TOTAL} className="font-serif text-3xl text-navy" />
            </div>
          </div>
        </motion.aside>
      </div>
    </section>
  )
}

export function HomeScrollStory({ stats, leadVote }: HomeScrollStoryProps) {
  return (
    <>
      <HomeHero stats={stats} leadVote={leadVote} />
      <AssemblyScrollStory />
      <VotePositionsSection />
    </>
  )
}
