'use client'

import Image from 'next/image'
import Link from 'next/link'
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'framer-motion'
import { useRef, useState } from 'react'
import { HeroSearch } from '@/components/HeroSearch'
import { LiveAssemblyPulse, type AssemblyStats, type LeadVoteSummary } from './LiveAssemblyPulse'
import { SceneImageLayer } from './SceneImageLayer'
import { ScrollProgressSteps } from './ScrollProgressSteps'
import { TrustRow } from './TrustRow'
import { VoteDotsVisualization } from './VoteDotsVisualization'

type AssemblyScrollExperienceProps = {
  stats: AssemblyStats
  leadVote: LeadVoteSummary
}

const POPULAR_SEARCHES = [
  { label: 'Paris 15e', href: '/deputes?search=Paris' },
  { label: 'Marine Le Pen', href: '/deputes?search=Marine%20Le%20Pen' },
  { label: 'Retraites', href: '/votes?theme=Retraites' },
  { label: 'Budget', href: '/votes?theme=Budget' },
  { label: 'Éducation', href: '/votes?theme=%C3%89ducation' },
]

const ENTRANCE_COPY = [
  {
    eyebrow: "L'Assemblée s'anime",
    title: "L'Assemblée vote chaque semaine.",
    body: 'Les scrutins techniques deviennent le signal de départ: une décision, puis des centaines de positions individuelles.',
  },
  {
    eyebrow: '577 sièges, 577 trajectoires',
    title: 'Chaque siège représente un député.',
    body: 'Derrière chaque vote, MonÉlu suit qui s’exprime, qui s’oppose, qui s’abstient et qui ne vote pas.',
  },
]

function SearchAndChips() {
  return (
    <>
      <HeroSearch
        id="home-hero-search"
        placeholder="Votre commune, code postal ou député..."
        buttonLabel="Comprendre mon député"
      />
      <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-white/58">Populaire</span>
        {POPULAR_SEARCHES.map(chip => (
          <Link
            key={chip.label}
            href={chip.href}
            className="border border-white/18 bg-white/10 px-3 py-1.5 font-medium text-white/90 backdrop-blur-sm transition-colors hover:border-white/40 hover:bg-white/20"
          >
            {chip.label}
          </Link>
        ))}
      </div>
    </>
  )
}

function HeroCopy({ stats }: { stats: AssemblyStats }) {
  const reduceMotion = useReducedMotion()

  return (
    <div className="max-w-2xl">
      <motion.p
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="inline-flex items-center border-l-2 border-red-civic pl-3 text-xs font-semibold uppercase tracking-wide text-red-light"
      >
        Données officielles de l&apos;Assemblée Nationale
      </motion.p>
      <motion.h1
        initial={reduceMotion ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.75, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        className="mt-6 max-w-[12ch] font-serif text-5xl font-normal leading-[0.94] tracking-tight text-white md:text-7xl lg:text-[5.25rem]"
      >
        La vie politique française, enfin lisible.
      </motion.h1>
      <motion.p
        initial={reduceMotion ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.68, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="mt-6 max-w-xl text-lg leading-8 text-white/76 md:text-xl"
      >
        Tous les votes. Tous les députés. Des explications claires. Des sources
        officielles.
      </motion.p>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, delay: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="mt-8 max-w-xl"
      >
        <SearchAndChips />
      </motion.div>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.52, ease: [0.22, 1, 0.36, 1] }}
        className="mt-8 hidden max-w-2xl md:block"
      >
        <TrustRow lastUpdated={stats.lastUpdated} />
      </motion.div>
    </div>
  )
}

function DesktopAssemblyScrollExperience({ stats, leadVote }: AssemblyScrollExperienceProps) {
  const containerRef = useRef<HTMLElement | null>(null)
  const [activeStep, setActiveStep] = useState(0)
  const [entranceCopyIndex, setEntranceCopyIndex] = useState(0)

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  })

  const exteriorOpacity = useTransform(scrollYProgress, [0, 0.28], [1, 0])
  const exteriorScale = useTransform(scrollYProgress, [0, 0.28], [1, 1.15])
  const exteriorFilter = useTransform(scrollYProgress, [0, 0.28], ['blur(0px)', 'blur(4px)'])
  const heroContentOpacity = useTransform(scrollYProgress, [0, 0.18], [1, 0])
  const heroContentY = useTransform(scrollYProgress, [0, 0.18], [0, -40])
  const liveCardOpacity = useTransform(scrollYProgress, [0, 0.18], [1, 0])
  const liveCardX = useTransform(scrollYProgress, [0, 0.18], [0, 40])

  const entranceOpacity = useTransform(scrollYProgress, [0.16, 0.34, 0.64, 0.74], [0, 1, 1, 0])
  const entranceScale = useTransform(scrollYProgress, [0.16, 0.74], [1.08, 1.12])
  const entranceFilter = useTransform(scrollYProgress, [0.62, 0.74], ['blur(0px)', 'blur(3px)'])
  const storyContentOpacity = useTransform(scrollYProgress, [0.28, 0.4, 0.64, 0.72], [0, 1, 1, 0])
  const storyContentY = useTransform(scrollYProgress, [0.28, 0.4], [26, 0])

  const hemicycleOpacity = useTransform(scrollYProgress, [0.58, 0.82], [0, 1])
  const hemicycleScale = useTransform(scrollYProgress, [0.58, 1], [1.08, 1])
  const hemicycleContentOpacity = useTransform(scrollYProgress, [0.72, 0.9], [0, 1])
  const hemicycleContentY = useTransform(scrollYProgress, [0.72, 0.9], [28, 0])

  useMotionValueEvent(scrollYProgress, 'change', latest => {
    const nextStep = latest < 0.28 ? 0 : latest < 0.72 ? 1 : 2
    const nextEntranceCopy = latest < 0.46 ? 0 : 1
    setActiveStep(current => (current === nextStep ? current : nextStep))
    setEntranceCopyIndex(current => (current === nextEntranceCopy ? current : nextEntranceCopy))
  })

  const entranceCopy = ENTRANCE_COPY[entranceCopyIndex]

  return (
    <section ref={containerRef} className="relative hidden h-[330vh] bg-navy text-white md:block">
      <div className="sticky top-16 h-[calc(100svh-4rem)] overflow-hidden">
        <SceneImageLayer
          src="/exterior-morning.jpg"
          alt="Vue extérieure de l'Assemblée Nationale"
          priority
          opacity={exteriorOpacity}
          scale={exteriorScale}
          filter={exteriorFilter}
          objectPosition="center center"
        >
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(9,21,44,0.92)_0%,rgba(9,21,44,0.74)_38%,rgba(9,21,44,0.24)_64%,rgba(9,21,44,0.76)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,21,44,0.42)_0%,rgba(9,21,44,0.08)_38%,rgba(9,21,44,0.88)_100%)]" />
        </SceneImageLayer>

        <SceneImageLayer
          src="/entrance.jpg"
          alt="Entrée principale de l'Assemblée Nationale"
          opacity={entranceOpacity}
          scale={entranceScale}
          filter={entranceFilter}
          objectPosition="center center"
        >
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,17,35,0.82)_0%,rgba(7,17,35,0.34)_46%,rgba(7,17,35,0.34)_54%,rgba(7,17,35,0.84)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,17,35,0.38)_0%,rgba(7,17,35,0.06)_44%,rgba(7,17,35,0.82)_100%)]" />
        </SceneImageLayer>

        <SceneImageLayer
          src="/hemicycle.jpg"
          alt="Vue intérieure de l'hémicycle de l'Assemblée Nationale"
          opacity={hemicycleOpacity}
          scale={hemicycleScale}
          objectPosition="center center"
        >
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,17,35,0.9)_0%,rgba(7,17,35,0.56)_38%,rgba(7,17,35,0.14)_70%,rgba(7,17,35,0.76)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,17,35,0.28)_0%,rgba(7,17,35,0.04)_45%,rgba(7,17,35,0.82)_100%)]" />
        </SceneImageLayer>

        {activeStep === 0 && (
          <motion.div
            style={{ opacity: heroContentOpacity, y: heroContentY }}
            className="absolute inset-0 z-20"
          >
            <div className="mx-auto grid h-full max-w-7xl items-center gap-12 px-8 lg:grid-cols-[1.08fr_0.92fr] lg:px-12">
              <HeroCopy stats={stats} />
              <motion.div style={{ opacity: liveCardOpacity, x: liveCardX }} className="justify-self-end">
                <LiveAssemblyPulse stats={stats} leadVote={leadVote} />
              </motion.div>
            </div>
          </motion.div>
        )}

        {activeStep === 1 && (
          <motion.div
            style={{ opacity: storyContentOpacity, y: storyContentY }}
            className="absolute inset-0 z-20"
          >
            <div className="mx-auto flex h-full max-w-7xl items-center px-8 lg:px-12">
              <motion.div
                key={entranceCopy.title}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
                className="max-w-xl"
              >
                <p className="border-l-2 border-red-civic pl-3 text-xs font-semibold uppercase tracking-wide text-red-light">
                  {entranceCopy.eyebrow}
                </p>
                <h2 className="mt-5 font-serif text-5xl leading-[1.02] tracking-tight text-white">
                  {entranceCopy.title}
                </h2>
                <p className="mt-5 max-w-md text-lg leading-8 text-white/72">{entranceCopy.body}</p>
                <p className="mt-10 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                  Continuez à défiler
                </p>
              </motion.div>
            </div>
          </motion.div>
        )}

        {activeStep === 2 && (
          <motion.div
            style={{ opacity: hemicycleContentOpacity, y: hemicycleContentY }}
            className="absolute inset-0 z-20"
          >
            <div className="mx-auto grid h-full max-w-7xl items-end gap-8 px-8 pb-24 lg:grid-cols-[0.92fr_0.64fr] lg:px-12">
              <div className="max-w-2xl">
                <p className="border-l-2 border-red-civic pl-3 text-xs font-semibold uppercase tracking-wide text-red-light">
                  Dans l&apos;hémicycle
                </p>
                <h2 className="mt-5 font-serif text-5xl leading-[1.02] tracking-tight text-white">
                  Chaque scrutin contient des centaines de positions.
                </h2>
                <p className="mt-5 max-w-lg text-lg leading-8 text-white/74">
                  MonÉlu transforme ces données brutes en informations claires.
                </p>
              </div>

              <div className="border border-white/16 bg-navy/76 p-5 text-white shadow-2xl shadow-black/25 backdrop-blur-xl">
                <p className="text-xs font-semibold uppercase text-white/52">Lecture du vote</p>
                <p className="mt-3 font-serif text-3xl">Un scrutin, 597 positions.</p>
                <p className="mt-3 text-sm leading-6 text-white/68">
                  Pour, contre, abstention, non-votant — en clair.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        <ScrollProgressSteps activeStep={activeStep} />
      </div>
    </section>
  )
}

function SceneCard({
  src,
  alt,
  eyebrow,
  title,
  body,
}: {
  src: string
  alt: string
  eyebrow: string
  title: string
  body: string
}) {
  return (
    <article className="border border-navy/10 bg-white shadow-xl shadow-navy/6">
      <div className="relative h-[280px] overflow-hidden bg-navy">
        <Image src={src} alt={alt} fill sizes="100vw" className="object-cover object-center" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,21,44,0.12),rgba(9,21,44,0.72))]" />
      </div>
      <div className="p-5">
        <p className="text-xs font-semibold uppercase text-red-civic">{eyebrow}</p>
        <h2 className="mt-3 font-serif text-3xl leading-tight text-navy">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-navy/62">{body}</p>
      </div>
    </article>
  )
}

function MobileAssemblyExperience({ stats, leadVote }: AssemblyScrollExperienceProps) {
  return (
    <section className="bg-gray-off md:hidden">
      <div className="relative isolate overflow-hidden bg-navy px-4 pb-10 pt-14 text-white">
        <Image
          src="/exterior-morning.jpg"
          alt="Vue extérieure de l'Assemblée Nationale"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(9,21,44,0.96)_0%,rgba(9,21,44,0.78)_52%,rgba(9,21,44,0.46)_100%)]" />
        <div className="relative z-10">
          <HeroCopy stats={stats} />
          <div className="mt-6">
            <LiveAssemblyPulse stats={stats} leadVote={leadVote} compact />
          </div>
        </div>
      </div>

      <div className="space-y-5 px-4 py-8">
        <SceneCard
          src="/entrance.jpg"
          alt="Entrée principale de l'Assemblée Nationale"
          eyebrow="L'Assemblée s'anime"
          title="L'Assemblée vote chaque semaine."
          body="La porte d'entrée devient le passage vers les décisions: textes, votes et positions individuelles."
        />
        <SceneCard
          src="/hemicycle.jpg"
          alt="Vue intérieure de l'hémicycle de l'Assemblée Nationale"
          eyebrow="Dans l'hémicycle"
          title="Chaque scrutin contient des centaines de positions."
          body="MonÉlu transforme ces données brutes en informations claires, lisibles et vérifiables."
        />
      </div>
    </section>
  )
}

function ReducedMotionAssemblyExperience({ stats, leadVote }: AssemblyScrollExperienceProps) {
  return (
    <section className="bg-gray-off">
      <div className="relative isolate overflow-hidden bg-navy px-4 py-16 text-white md:px-8 lg:px-12">
        <Image
          src="/exterior-morning.jpg"
          alt="Vue extérieure de l'Assemblée Nationale"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(9,21,44,0.96),rgba(9,21,44,0.64))]" />
        <div className="relative z-10 mx-auto grid max-w-7xl gap-8 md:grid-cols-[1fr_0.76fr] md:items-center">
          <HeroCopy stats={stats} />
          <LiveAssemblyPulse stats={stats} leadVote={leadVote} />
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-8 md:grid-cols-2 md:px-8 lg:px-12">
        <SceneCard
          src="/entrance.jpg"
          alt="Entrée principale de l'Assemblée Nationale"
          eyebrow="L'Assemblée s'anime"
          title="L'Assemblée vote chaque semaine."
          body="Chaque siège représente un député, et chaque scrutin produit une trace vérifiable."
        />
        <SceneCard
          src="/hemicycle.jpg"
          alt="Vue intérieure de l'hémicycle de l'Assemblée Nationale"
          eyebrow="Dans l'hémicycle"
          title="Chaque scrutin contient des centaines de positions."
          body="MonÉlu transforme ces données brutes en informations claires."
        />
      </div>
    </section>
  )
}

export function AssemblyScrollExperience({ stats, leadVote }: AssemblyScrollExperienceProps) {
  const shouldReduceMotion = useReducedMotion()

  if (shouldReduceMotion) {
    return (
      <>
        <ReducedMotionAssemblyExperience stats={stats} leadVote={leadVote} />
        <VoteDotsVisualization />
      </>
    )
  }

  return (
    <>
      <DesktopAssemblyScrollExperience stats={stats} leadVote={leadVote} />
      <MobileAssemblyExperience stats={stats} leadVote={leadVote} />
      <VoteDotsVisualization />
    </>
  )
}
