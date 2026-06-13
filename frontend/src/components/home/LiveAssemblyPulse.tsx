'use client'

import Link from 'next/link'
import { animate, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'

export type AssemblyStats = {
  deputies: number
  votes: number
  positions: number
  lastUpdated: string
}

export type LeadVoteSummary = {
  title: string
  result: string
  votesFor: number
  votesAgainst: number
  abstentions: number
  href?: string
}

function formatCount(value: number, compact = false) {
  if (compact && value >= 1000) return `${Math.round(value / 1000)}k`
  return value.toLocaleString('fr-FR')
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
      duration: 1.25,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: latest => setDisplay(formatCount(Math.round(latest), compact)),
    })

    return () => controls.stop()
  }, [compact, reduceMotion, value])

  return <span className={className}>{display}</span>
}

type LiveAssemblyPulseProps = {
  stats: AssemblyStats
  leadVote: LeadVoteSummary
  compact?: boolean
}

export function LiveAssemblyPulse({
  stats,
  leadVote,
  compact = false,
}: LiveAssemblyPulseProps) {
  const reduceMotion = useReducedMotion()
  const total = Math.max(leadVote.votesFor + leadVote.votesAgainst + leadVote.abstentions, 1)
  const forPct = Math.round((leadVote.votesFor / total) * 100)
  const againstPct = Math.round((leadVote.votesAgainst / total) * 100)
  const abstentionPct = Math.max(0, 100 - forPct - againstPct)
  const resultIsAdopted = leadVote.result.toLowerCase().includes('adopt')
  const resultBadgeClass = resultIsAdopted
    ? compact
      ? 'border border-emerald-600/20 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700'
      : 'border border-emerald-400/30 bg-emerald-400/12 px-2 py-0.5 text-xs font-semibold text-emerald-100'
    : compact
      ? 'border border-red-civic/20 bg-red-civic/10 px-2 py-0.5 text-xs font-semibold text-red-civic'
      : 'border border-red-300/30 bg-red-civic/15 px-2 py-0.5 text-xs font-semibold text-red-100'

  const statItems = [
    { value: stats.deputies, label: 'députés suivis', compact: false },
    { value: stats.votes, label: 'votes analysés', compact: false },
    { value: stats.positions, label: 'positions individuelles', compact: true },
  ]

  return (
    <motion.aside
      initial={reduceMotion ? false : { opacity: 0, x: compact ? 0 : 34 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.72, delay: compact ? 0.12 : 0.42, ease: [0.22, 1, 0.36, 1] }}
      className={
        compact
          ? 'border border-navy/10 bg-white/95 p-4 text-navy shadow-2xl shadow-navy/10 backdrop-blur-md'
          : 'border border-white/16 bg-navy/84 p-5 text-white shadow-2xl shadow-black/35 backdrop-blur-xl'
      }
      aria-label="Statistiques en direct de l'Assemblée"
    >
      <div className="flex items-start justify-between gap-4 border-b border-current/10 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase opacity-55">L&apos;Assemblée en direct</p>
          <p className="mt-1 text-sm font-semibold opacity-70">{stats.lastUpdated}</p>
        </div>
        <motion.span
          aria-hidden="true"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.72 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, delay: 0.75, ease: [0.22, 1, 0.36, 1] }}
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
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase opacity-55">Dernier scrutin important</p>
          <span
            className={resultBadgeClass}
          >
            {leadVote.result}
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 md:line-clamp-3">
          {leadVote.title}
        </p>
        <div className="mt-4 h-2 overflow-hidden bg-current/12" aria-hidden="true">
          <motion.div
            className="flex h-full origin-left"
            initial={reduceMotion ? false : { scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="bg-emerald-500" style={{ width: `${forPct}%` }} />
            <div className="bg-red-civic" style={{ width: `${againstPct}%` }} />
            <div className="bg-amber-400" style={{ width: `${abstentionPct}%` }} />
          </motion.div>
        </div>
        <div className="mt-2 grid grid-cols-3 text-xs opacity-65">
          <span>{leadVote.votesFor} pour</span>
          <span className="text-center">{leadVote.votesAgainst} contre</span>
          <span className="text-right">{leadVote.abstentions} abst.</span>
        </div>
        <Link
          href={leadVote.href ?? '/votes'}
          className="mt-4 inline-flex text-sm font-semibold opacity-74 transition-opacity hover:opacity-100"
        >
          Voir le détail du vote →
        </Link>
      </div>
    </motion.aside>
  )
}
