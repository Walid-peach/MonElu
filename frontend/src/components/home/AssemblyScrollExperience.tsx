'use client'
// Typography exception: this cinematic scroll component uses inline styles throughout
// because all colors, opacities, and sizes are computed dynamically by the animation engine.
import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { AssemblyStats, LeadVoteSummary } from './LiveAssemblyPulse'
import { LiveAssemblyPulse } from './LiveAssemblyPulse'
import { HeroSearch } from '@/components/HeroSearch'
import { TrustRow } from './TrustRow'
import type { DeputyInfo } from '@/app/page'
import { NAV_HEIGHT_PX } from '@/components/Nav'

type Props = {
  stats: AssemblyStats
  leadVote: LeadVoteSummary
  deputyInfo: DeputyInfo | null
}

// ---- static / reduced-motion fallback ----
function StaticExperience({ stats, leadVote }: Props) {
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
          <div>
            <p className="text-xs font-semibold uppercase text-red-light">
              Données officielles de l&apos;Assemblée Nationale
            </p>
            <h1 className="mt-6 font-serif text-5xl leading-tight text-white md:text-7xl">
              La vie politique française, enfin lisible.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-white/76">
              Tous les votes. Tous les députés. Des explications claires.
            </p>
            <div className="mt-8 max-w-xl">
              <HeroSearch
                id="home-hero-search-static"
                placeholder="Votre commune, code postal ou député..."
                buttonLabel="Comprendre mon député"
              />
            </div>
            <div className="mt-8 hidden md:block">
              <TrustRow lastUpdated={stats.lastUpdated} />
            </div>
          </div>
          <LiveAssemblyPulse stats={stats} leadVote={leadVote} />
        </div>
      </div>
    </section>
  )
}

// ---- mobile fallback (card stack, no cinematic) ----
function MobileExperience({ stats, leadVote }: Props) {
  return (
    <section className="md:hidden">
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
          <p className="text-xs font-semibold uppercase text-red-light">
            Données officielles
          </p>
          <h1 className="mt-5 font-serif text-4xl leading-tight text-white">
            La vie politique française, enfin lisible.
          </h1>
          <p className="mt-4 text-base leading-7 text-white/76">
            Chaque vote. Chaque député. En clair.
          </p>
          <div className="mt-6">
            <HeroSearch
              id="home-hero-search-mobile"
              placeholder="Votre commune ou député..."
              buttonLabel="Comprendre mon député"
            />
          </div>
          <div className="mt-6">
            <LiveAssemblyPulse stats={stats} leadVote={leadVote} compact />
          </div>
        </div>
      </div>
      <div className="space-y-5 px-4 py-8">
        <article className="border border-navy/10 bg-white shadow-xl shadow-navy/6">
          <div className="relative h-[220px] overflow-hidden bg-navy">
            <Image src="/entrance.jpg" alt="Entrée de l'Assemblée Nationale" fill sizes="100vw" className="object-cover" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,21,44,0.12),rgba(9,21,44,0.72))]" />
          </div>
          <div className="p-5">
            <p className="text-xs font-semibold uppercase text-red-civic">L&apos;Assemblée s&apos;anime</p>
            <h2 className="mt-3 font-serif text-2xl leading-tight text-navy">L&apos;Assemblée vote chaque semaine.</h2>
          </div>
        </article>
        <article className="border border-navy/10 bg-white shadow-xl shadow-navy/6">
          <div className="relative h-[220px] overflow-hidden bg-navy">
            <Image src="/hemicycle.jpg" alt="L'hémicycle de l'Assemblée Nationale" fill sizes="100vw" className="object-cover" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,21,44,0.12),rgba(9,21,44,0.72))]" />
          </div>
          <div className="p-5">
            <p className="text-xs font-semibold uppercase text-red-civic">Dans l&apos;hémicycle</p>
            <h2 className="mt-3 font-serif text-2xl leading-tight text-navy">
              Chaque scrutin: {stats.deputies} positions individuelles.
            </h2>
          </div>
        </article>
      </div>
    </section>
  )
}

// ---- cinematic scroll experience (desktop) ----
function CinematicExperience({ stats, leadVote, deputyInfo }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const router = useRouter()

  const submitQuery = (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    router.push(`/chat?q=${encodeURIComponent(trimmed)}`)
  }

  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    const $ = (s: string) => track.querySelector(s) as HTMLElement | null
    const $$ = (s: string) => Array.from(track.querySelectorAll(s)) as HTMLElement[]

    const fit = $('[data-fit]')!
    const camera = $('[data-camera]')!
    const bg = $('[data-bg]') as HTMLImageElement | null
    const blue = $('[data-blue]')!
    const scrim = $('[data-scrim]')!
    const dotsLayer = $('[data-dots]')!
    const fxLayer = $('[data-fx]')!
    const chrome = $('[data-chrome]')!
    const sceneLabel = $('[data-scenelabel]')!
    const topbar = $('[data-topbar]')!
    const titles = [0, 1].map(i => track.querySelector(`[data-title="${i}"]`) as HTMLElement | null)
    const beat = $('[data-beat]')!
    const voteCard = $('[data-votecard]')!
    const deputy = $('[data-deputy]')!
    const hint = $('[data-hint]')!
    const linkSvg = $('[data-link]') as SVGElement | null
    const linkPath = $('[data-linkpath]') as SVGPathElement | null
    const railDots = $$('[data-raildot]')
    const scene6 = $('[data-scene6]')!
    const s6inner = $('[data-s6inner]')!
    const s6items = $$('[data-s6item]')
    const entryLayers = [0, 1, 2].map(i => track.querySelector(`[data-entry="${i}"]`) as HTMLImageElement | null)
    const entryCaps = $$('[data-entrycap]')
    const hud = $('[data-hud]')!
    const nums = {
      pour: $('[data-num="pour"]'),
      contre: $('[data-num="contre"]'),
      abst: $('[data-num="abst"]'),
      total: $('[data-num="total"]'),
    }

    const REAL_POUR = leadVote.votesFor
    const REAL_CONTRE = leadVote.votesAgainst
    const REAL_ABST = leadVote.abstentions
    const REAL_TOTAL = REAL_POUR + REAL_CONTRE + REAL_ABST

    // ---- responsive cover-fit ----
    const BASE_W = 1672, BASE_H = 941
    let fitScale = 1, offX = 0, offY = 0

    const fitS6 = () => {
      if (!s6inner) return
      s6inner.style.transform = 'scale(1)'
      const avail = window.innerHeight - 56
      const need = s6inner.scrollHeight
      const s = need > 0 ? Math.min(1, avail / need) : 1
      s6inner.style.transform = `scale(${s.toFixed(4)})`
    }

    const fitStage = () => {
      const w = window.innerWidth, h = window.innerHeight - NAV_HEIGHT_PX
      fitScale = Math.max(w / BASE_W, h / BASE_H)
      offX = (w - BASE_W * fitScale) / 2
      offY = (h - BASE_H * fitScale) / 2
      fit.style.transform = `translate(-50%,-50%) scale(${fitScale})`
      fitS6()
    }

    // ---- hemicycle dot field ----
    const CX = 836, CY = 452, SQUASH = 0.86, arcs = 15
    const rMin = 300, rMax = 985
    const aMin = 21 * Math.PI / 180, aMax = 159 * Math.PI / 180
    type Seat = { x: number; y: number; kind: 'pour' | 'contre' | 'abst'; arc: number; order: number; _el: HTMLElement; _col: { c: string; g: string } }
    const seats: Seat[] = []
    const pPour = REAL_TOTAL > 0 ? REAL_POUR / REAL_TOTAL : 0.52
    const pAbst = REAL_TOTAL > 0 ? REAL_ABST / REAL_TOTAL : 0.08

    // Deterministic PRNG (mulberry32) so the seat layout is stable per render
    // and never re-randomizes on re-render or per frame (MON-71).
    let _seed = 0x9e3779b9 >>> 0
    const rand = () => {
      _seed = (_seed + 0x6d2b79f5) >>> 0
      let t = _seed
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    for (let a = 0; a < arcs; a++) {
      const r = rMin + (rMax - rMin) * (a / (arcs - 1))
      const arcLen = (aMax - aMin) * r
      const count = Math.max(7, Math.round(arcLen / 44))
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0.5 : i / (count - 1)
        const ang = aMin + (aMax - aMin) * t
        const x = CX + Math.cos(ang) * r
        const y = CY + Math.sin(ang) * r * SQUASH
        if (y < 548 || y > 980 || x < 70 || x > 1602) continue
        const aisleHalf = 70 + Math.max(0, y - 560) * 0.16
        if (Math.abs(x - CX) < aisleHalf && y > 560) continue
        // No left/right bias: kind is drawn from the global proportions so
        // pour/contre/abst spread evenly across both wings of the hemicycle.
        let kind: 'pour' | 'contre' | 'abst'
        const rnd = rand()
        if (rnd < pPour) kind = 'pour'
        else if (rnd < pPour + pAbst) kind = 'abst'
        else kind = 'contre'
        seats.push({ x, y, kind, arc: a, order: rand(), _el: null!, _col: null! })
      }
    }
    seats.sort((p, q) => (p.arc - q.arc) || (p.order - q.order))

    const COLORS = {
      pour:   { c: '#27e0ad', g: 'rgba(39,224,173,0.85)' },
      contre: { c: '#f4564a', g: 'rgba(244,86,74,0.85)' },
      abst:   { c: '#b9c4d8', g: 'rgba(185,196,216,0.6)' },
    }
    const counts = { pour: 0, contre: 0, abst: 0 }
    seats.forEach(s => { counts[s.kind]++ })

    // The hero seat must reflect the deputy's real vote_positions row (MON-102) —
    // fall back to 'contre' only when no real position is available.
    const heroKind: 'pour' | 'contre' | 'abst' =
      deputyInfo?.votePosition === 'pour' ? 'pour'
        : deputyInfo?.votePosition === 'abstention' ? 'abst'
        : 'contre'
    let hero: Seat | null = null
    const candidates = seats.filter(s => s.kind === heroKind && s.x > 540 && s.x < 800 && s.y > 660 && s.y < 850)
    const sameKind = seats.filter(s => s.kind === heroKind)
    hero = candidates.length
      ? candidates[Math.floor(candidates.length / 2)]
      : sameKind.length
        ? sameKind[Math.floor(sameKind.length / 2)]
        : seats[Math.floor(seats.length / 2)]
    // Force the hero seat's own kind to match heroKind so its dot color never
    // disagrees with the ring/glow, even in the rare case where no seat of
    // heroKind exists and we fell back to an arbitrary seat above.
    hero.kind = heroKind

    seats.forEach(s => {
      const el = document.createElement('div')
      const col = COLORS[s.kind]
      const size = Math.round((s.kind === 'abst' ? 7 : 8) + (s.arc / arcs) * 4)
      el.style.cssText = `position:absolute;left:${s.x}px;top:${s.y}px;width:${size}px;height:${size}px;margin:${-size/2}px 0 0 ${-size/2}px;border-radius:999px;background:${col.c};opacity:0;transform:scale(0.2);will-change:opacity,transform;`
      s._el = el; s._col = col
      dotsLayer.appendChild(el)
    })

    const heroColor = COLORS[heroKind]
    // Keep the connective link line's color in sync with the hero dot (MON-102).
    const linkStops = $$('[data-linkstop]') as unknown as SVGStopElement[]
    linkStops.forEach(stop => stop.setAttribute('stop-color', heroColor.c))
    if (linkPath) linkPath.style.filter = `drop-shadow(0 0 6px ${heroColor.g})`
    const heroRing = document.createElement('div')
    heroRing.style.cssText = `position:absolute;left:${hero.x}px;top:${hero.y}px;width:54px;height:54px;border-radius:999px;border:2px solid ${heroColor.c};opacity:0;transform:translate(-50%,-50%) scale(0.5);will-change:opacity,transform;box-shadow:0 0 18px ${heroColor.g};`
    fxLayer.appendChild(heroRing)
    const heroGlow = document.createElement('div')
    heroGlow.style.cssText = `position:absolute;left:${hero.x}px;top:${hero.y}px;width:120px;height:120px;border-radius:999px;background:radial-gradient(circle,${heroColor.g} 0%,rgba(0,0,0,0) 70%);opacity:0;transform:translate(-50%,-50%) scale(0.6);will-change:opacity,transform;`
    fxLayer.appendChild(heroGlow)

    // ---- helpers ----
    const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
    const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a), 0, 1)
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t
    const easeIO = (t: number) => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
    const setText = (el: HTMLElement | null, v: number | string) => { if (el) el.textContent = String(v) }
    titles.forEach(t => { if (t) t.style.transition = 'none' })

    let camS = 1, camTx = 0, camTy = 0
    const applyCam = (s: number, tx: number, ty: number) => {
      const minTx = BASE_W * (1 - s), minTy = BASE_H * (1 - s)
      tx = Math.min(0, Math.max(minTx, tx)); ty = Math.min(0, Math.max(minTy, ty))
      camS = s; camTx = tx; camTy = ty
      camera.style.transform = `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${s.toFixed(4)})`
    }

    // ---- entry act (0-30% scroll) ----
    const estops = [
      { type: 'hold', scene: 0, a: 0.00, b: 0.20 },
      { type: 'trans', from: 0, to: 1, a: 0.20, b: 0.46 },
      { type: 'hold', scene: 1, a: 0.46, b: 0.62 },
      { type: 'trans', from: 1, to: 2, a: 0.62, b: 0.86 },
      { type: 'hold', scene: 2, a: 0.86, b: 1.0001 },
    ] as const
    type EStop = typeof estops[number]
    const ePhase = (p: number) => {
      for (const s of estops) { if (p >= s.a && p < s.b) return { s, local: clamp((p - s.a) / (s.b - s.a), 0, 1) } }
      return { s: estops[estops.length - 1] as EStop, local: 1 }
    }
    const eHold = (sc: number) => estops.find(x => x.type === 'hold' && (x as {scene:number}).scene === sc)!

    const entryFrame = (ep: number) => {
      const { s, local } = ePhase(ep)
      let cur: number, nxt: number, f: number
      if (s.type === 'hold') { cur = nxt = (s as {scene:number}).scene; f = 0 }
      else { cur = (s as {from:number}).from; nxt = (s as {to:number}).to; f = easeIO(local) }
      entryLayers.forEach((l, i) => {
        if (!l) return
        let o = 0, sc = 1
        if (i === cur && i === nxt) { o = 1; sc = 1 }
        else if (i === cur) { o = 1 - f; sc = 1 + 0.30 * f }
        else if (i === nxt) { o = f; sc = 1 + 0.30 * (1 - f) * 0.55 }
        l.style.opacity = o.toFixed(3)
        l.style.transform = `scale(${sc.toFixed(4)})`
      })
      const trans = s.type === 'trans' ? Math.sin(f * Math.PI) : 0
      scrim.style.opacity = (0.30 + 0.30 * trans).toFixed(3)
      entryCaps.forEach((c, i) => {
        const hw = eHold(i)
        let o = 0
        if (ep >= hw.a - 0.03 && ep <= hw.b + 0.03) {
          const lz = clamp((ep - hw.a) / (hw.b - hw.a), 0, 1)
          o = 1
          if (i > 0 && lz < 0.22) o = lz / 0.22
          if (i < 2 && lz > 0.82) o = (1 - lz) / 0.18
          o = clamp(o, 0, 1)
        }
        c.style.opacity = o.toFixed(3)
        c.style.transform = `translate(-50%, calc(-50% + ${((1 - o) * 18).toFixed(1)}px))`
      })
    }

    // ---- data + voice + intelligence act (30-100% scroll) ----
    const D_END = 0.72
    const N = seats.length

    const dataFrame = (dp: number) => {
      const p = Math.min(dp / D_END, 1)
      const zoomP = easeIO(seg(p, 0.04, 0.50))
      const punch = easeIO(seg(p, 0.50, 0.72))
      const settle = easeIO(seg(p, 0.72, 0.82))
      const scale = 1 + zoomP * 0.16 + punch * 0.42 - settle * 0.18
      const panE = easeIO(seg(p, 0.46, 0.72))
      const fx = lerp(BASE_W / 2, hero!.x, panE)
      const fy = lerp(BASE_H * 0.46, hero!.y, panE)
      const tx = (BASE_W / 2 - fx) * scale + (BASE_W / 2 - BASE_W / 2 * scale)
      const ty = (BASE_H / 2 - fy) * scale + (BASE_H / 2 - BASE_H / 2 * scale)
      applyCam(scale, tx, ty)

      const cool = easeIO(seg(p, 0.04, 0.30))
      blue.style.opacity = (cool * 0.92).toFixed(3)
      if (bg) bg.style.filter = `saturate(${(1 - cool * 0.55).toFixed(2)}) brightness(${(1 - cool * 0.42).toFixed(2)}) contrast(${(1 + cool * 0.10).toFixed(2)})`
      const bgDim = easeIO(seg(p, 0.24, 0.46)) * 0.4 + easeIO(seg(p, 0.66, 0.82)) * 0.4
      scrim.style.opacity = (0.2 + bgDim).toFixed(3)

      chrome.style.opacity = easeIO(seg(p, 0.06, 0.20)).toFixed(3)

      const igniteSpan = [0.10, 0.40]
      for (let i = 0; i < N; i++) {
        const s = seats[i]
        const f0 = igniteSpan[0] + (s.arc / arcs) * (igniteSpan[1] - igniteSpan[0]) * 0.8
        const f1 = f0 + 0.05
        const a = easeOut(seg(p, f0, f1))
        const isHero = (s === hero)
        const dim = isHero ? 0 : easeIO(seg(p, 0.66, 0.82))
        const op = a * (1 - dim * 0.86)
        s._el.style.opacity = op.toFixed(3)
        s._el.style.transform = `scale(${lerp(0.2, 1, a).toFixed(3)})`
        s._el.style.boxShadow = a > 0.5 ? `0 0 ${(6 * a).toFixed(1)}px ${s._col.g}` : 'none'
      }

      const cardIn = easeIO(seg(p, 0.28, 0.38))
      const cardOut = easeIO(seg(p, 0.52, 0.60))
      voteCard.style.opacity = (cardIn * (1 - cardOut)).toFixed(3)
      voteCard.style.transform = `translateY(${lerp(24, 0, cardIn)}px)`
      const countP = easeOut(seg(p, 0.28, 0.48))
      setText(nums.pour, Math.round(REAL_POUR * countP))
      setText(nums.contre, Math.round(REAL_CONTRE * countP))
      setText(nums.abst, Math.round(REAL_ABST * countP))
      setText(nums.total, Math.round(REAL_TOTAL * countP))

      const t0o = easeIO(seg(p, 0.06, 0.16)) * (1 - easeIO(seg(p, 0.46, 0.52)))
      const t1o = easeIO(seg(p, 0.80, 0.90))
      if (titles[0]) titles[0].style.opacity = t0o.toFixed(3)
      if (titles[1]) titles[1].style.opacity = t1o.toFixed(3)

      const beatIn = easeIO(seg(p, 0.52, 0.58))
      const beatOut = easeIO(seg(p, 0.64, 0.70))
      beat.style.opacity = (beatIn * (1 - beatOut)).toFixed(3)
      beat.style.transform = `translate(-50%,-50%) translateY(${lerp(18, 0, beatIn)}px)`

      const heroOn = easeOut(seg(p, 0.64, 0.74))
      if (hero!._el) {
        hero!._el.style.opacity = Math.max(Number(hero!._el.style.opacity) || 0, heroOn).toFixed(3)
        hero!._el.style.transform = `scale(${lerp(1, 1.9, heroOn).toFixed(3)})`
        hero!._el.style.boxShadow = `0 0 ${(8 + heroOn * 20).toFixed(1)}px ${hero!._col.g}`
        hero!._el.style.background = '#ff6a5a'
      }
      heroRing.style.opacity = (heroOn * 0.9).toFixed(3)
      heroRing.style.transform = `translate(-50%,-50%) scale(${lerp(0.5, 1, heroOn).toFixed(3)})`
      heroGlow.style.opacity = (heroOn * 0.85).toFixed(3)
      heroGlow.style.transform = `translate(-50%,-50%) scale(${lerp(0.6, 1.15, heroOn).toFixed(3)})`

      const depIn = easeIO(seg(p, 0.82, 0.95))
      deputy.style.opacity = depIn.toFixed(3)
      deputy.style.transform = `translateX(${lerp(70, 0, depIn)}px)`

      // connective link line
      const linkP = easeOut(seg(p, 0.72, 0.86))
      const linkVis = 1 - easeIO(seg(dp, 0.74, 0.80))
      if (linkP > 0 && linkVis > 0.002 && linkSvg && linkPath) {
        const sx = offX + (hero!.x * camS + camTx) * fitScale
        const sy = offY + (hero!.y * camS + camTy) * fitScale
        const hr = hud.getBoundingClientRect()
        const dr = deputy.getBoundingClientRect()
        const dxp = dr.left - hr.left + dr.width * 0.32
        const dyp = dr.top - hr.top + 28
        const ex = lerp(sx, dxp, linkP)
        const ey = lerp(sy, dyp, linkP)
        const midx = (sx + dxp) / 2
        const midy = Math.min(sy, dyp) - 90
        linkSvg.style.opacity = linkVis.toFixed(3)
        linkPath.setAttribute('d', `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${midx.toFixed(1)} ${midy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`)
      } else if (linkSvg) {
        linkSvg.style.opacity = '0'
      }

      // intelligence act
      const s6env = easeIO(seg(dp, 0.76, 0.93))
      if (dp > 0.76) {
        const s6scale = lerp(1.40, 1.05, s6env)
        const cx2 = lerp(hero!.x, BASE_W * 0.5, s6env)
        const cy2 = lerp(hero!.y, BASE_H * 0.5, s6env)
        const tx2 = (BASE_W / 2 - cx2) * s6scale + (BASE_W / 2 - BASE_W / 2 * s6scale)
        const ty2 = (BASE_H / 2 - cy2) * s6scale + (BASE_H / 2 - BASE_H / 2 * s6scale)
        applyCam(s6scale, tx2, ty2)
        if (bg) bg.style.filter = `saturate(0.45) brightness(${(0.5 - s6env * 0.30).toFixed(2)}) contrast(1.04) blur(${(s6env * 8).toFixed(1)}px)`
        scrim.style.opacity = (0.5 + s6env * 0.42).toFixed(3)
        dotsLayer.style.opacity = lerp(1, 0.6, s6env).toFixed(3)
        for (let i = 0; i < N; i++) {
          const s = seats[i]
          const base = Number(s._el.style.opacity) || 0
          s._el.style.opacity = Math.max(base * (1 - s6env), s6env * 0.45).toFixed(3)
        }
        fxLayer.style.opacity = (1 - easeIO(seg(dp, 0.76, 0.86))).toFixed(3)
        deputy.style.opacity = ((Number(deputy.style.opacity) || 1) * (1 - easeIO(seg(dp, 0.76, 0.86)))).toFixed(3)
        const t1curr = Number(titles[1]?.style.opacity) || 0
        if (titles[1]) titles[1].style.opacity = (t1curr * (1 - easeIO(seg(dp, 0.76, 0.86)))).toFixed(3)
        chrome.style.opacity = (easeIO(seg(p, 0.06, 0.20)) - s6env * 0.85).toFixed(3)
      } else {
        dotsLayer.style.opacity = '1'
        fxLayer.style.opacity = '1'
      }
      scene6.style.opacity = s6env > 0 ? '1' : '0'
      s6items.forEach((el, i) => {
        const d0 = 0.78 + i * 0.009
        const a = easeOut(seg(dp, d0, d0 + 0.11))
        el.style.opacity = a.toFixed(3)
        el.style.transform = `translateY(${lerp(24, 0, a).toFixed(1)}px)`
      })
    }

    // ---- master frame ----
    const ENTRY_END = 0.30
    const ACCENT = '#C9302C'
    const railPhases = [0.05, 0.16, 0.45, 0.80, 0.94]
    const labelStops = [
      { p: 0.10, t: 'EXTÉRIEUR' }, { p: 0.20, t: 'ENTRÉE' },
      { p: 0.62, t: 'HÉMICYCLE' }, { p: 0.83, t: 'VOTRE VOIX' },
      { p: 2.00, t: 'INTELLIGENCE' },
    ]

    const frame = (P: number) => {
      topbar.style.transform = `scaleX(${P.toFixed(4)})`

      if (P < ENTRY_END) {
        const ep = P / ENTRY_END
        camera.style.transform = ''; camS = 1; camTx = 0; camTy = 0
        blue.style.opacity = '0'
        if (bg) bg.style.filter = 'none'
        dotsLayer.style.opacity = '1'; fxLayer.style.opacity = '1'
        heroRing.style.opacity = '0'; heroGlow.style.opacity = '0'
        for (let i = 0; i < N; i++) { const e = seats[i]._el; e.style.opacity = '0'; e.style.boxShadow = 'none'; e.style.transform = 'scale(0.2)' }
        voteCard.style.opacity = '0'; deputy.style.opacity = '0'; beat.style.opacity = '0'
        if (linkSvg) linkSvg.style.opacity = '0'
        titles.forEach(t => { if (t) t.style.opacity = '0' })
        scene6.style.opacity = '0'; s6items.forEach(e => { e.style.opacity = '0' })
        chrome.style.opacity = '0'
        entryFrame(ep)
      } else {
        entryCaps.forEach(c => { c.style.opacity = '0' })
        entryLayers.forEach((l, i) => {
          if (!l) return
          l.style.opacity = i === 2 ? '1' : '0'
          l.style.transform = 'scale(1)'
        })
        dataFrame((P - ENTRY_END) / (1 - ENTRY_END))
      }

      hint.style.opacity = (1 - easeIO(seg(P, 0.02, 0.07))).toFixed(3)

      let lt = labelStops[labelStops.length - 1].t
      for (const ls of labelStops) { if (P < ls.p) { lt = ls.t; break } }
      setText(sceneLabel, lt)
      const lblIn = easeIO(seg(P, 0.01, 0.05))
      const lblOut = easeIO(seg(P, 0.88, 0.94))
      sceneLabel.style.opacity = (lblIn * (1 - lblOut) * 0.9).toFixed(3)

      railDots.forEach((d, i) => {
        const reached = P >= railPhases[i] - 0.05
        d.style.background = reached ? ACCENT : 'rgba(160,185,235,0.28)'
        d.style.height = Math.abs(P - railPhases[i]) < 0.07 ? '16px' : '7px'
      })
    }

    // ---- scroll loop ----
    let target = 0, cur = 0, raf: number | null = null

    const computeTarget = () => {
      const rect = track.getBoundingClientRect()
      // Account for nav height: experience starts when track top hits the nav bottom
      const scrolled = -(rect.top - NAV_HEIGHT_PX)
      const max = track.offsetHeight - (window.innerHeight - NAV_HEIGHT_PX)
      target = max > 0 ? clamp(scrolled / max, 0, 1) : 0
    }

    const tick = () => {
      cur += (target - cur) * 0.12
      if (Math.abs(target - cur) < 0.0002) cur = target
      frame(cur)
      raf = Math.abs(target - cur) > 0.00005 ? requestAnimationFrame(tick) : null
    }

    const kick = () => { computeTarget(); if (!raf) raf = requestAnimationFrame(tick) }

    fitStage()
    const ro = new ResizeObserver(() => { fitStage(); kick() })
    ro.observe(track)
    const onResize = () => { fitStage(); kick() }
    window.addEventListener('scroll', kick, { passive: true })
    window.addEventListener('resize', onResize)
    computeTarget(); frame(0); cur = target; kick()
    setTimeout(fitS6, 350)

    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', kick)
      window.removeEventListener('resize', onResize)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [stats, leadVote, deputyInfo])

  const totalVotes = leadVote.votesFor + leadVote.votesAgainst + leadVote.abstentions

  // Prefer the deputy's real vote_positions row over the bill's overall
  // result so the badge always matches the highlighted hero seat (MON-102).
  const billAdopted = leadVote.result.toLowerCase().includes('adopt')
  const effectivePosition: 'pour' | 'contre' | 'abstention' =
    deputyInfo?.votePosition ?? (billAdopted ? 'pour' : 'contre')
  const VOTE_BADGE = {
    pour: { label: 'A voté pour', icon: '✓', color: '#1fd4a6', bg: 'rgba(31,212,166,0.16)', border: 'rgba(31,212,166,0.35)' },
    contre: { label: 'A voté contre', icon: '✕', color: '#f3b6b1', bg: 'rgba(217,48,37,0.16)', border: 'rgba(240,88,76,0.35)' },
    abstention: { label: "S'est abstenu sur", icon: '–', color: '#c7cfe0', bg: 'rgba(185,196,216,0.16)', border: 'rgba(185,196,216,0.35)' },
  } as const
  const {
    label: voteResultLabel,
    icon: voteResultIcon,
    color: voteResultColor,
    bg: voteResultBg,
    border: voteResultBorder,
  } = VOTE_BADGE[effectivePosition]

  return (
    <div
      ref={trackRef}
      style={{ height: '650vh', position: 'relative', background: '#070b14' }}
    >
      {/* sticky viewport — offset by nav height so content is never hidden behind the nav */}
      <div
        data-sticky
        style={{ position: 'sticky', top: NAV_HEIGHT_PX, height: `calc(100vh - ${NAV_HEIGHT_PX}px)`, overflow: 'hidden', background: '#070b14' }}
      >
        {/* cover-fit stage: imagery + dot field */}
        <div
          data-fit
          style={{ position: 'absolute', top: '50%', left: '50%', width: 1672, height: 941, transformOrigin: 'center center' }}
        >
          <div data-stage style={{ position: 'relative', width: 1672, height: 941, overflow: 'hidden', background: '#070b14' }}>
            <div data-camera style={{ position: 'absolute', inset: 0, transformOrigin: '0 0', willChange: 'transform' }}>
              {/* bg = scene 2 (hémicycle) - always underneath, used by data act */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                data-bg
                data-entry="2"
                src="/hemicycle.jpg"
                alt="Hémicycle de l'Assemblée nationale"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block', transformOrigin: 'center center', willChange: 'transform,filter,opacity' }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                data-entry="1"
                src="/entrance.jpg"
                alt="Entrée de l'Assemblée nationale"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block', transformOrigin: 'center center', opacity: 0, willChange: 'transform,opacity' }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                data-entry="0"
                src="/exterior-morning.jpg"
                fetchPriority="high"
                alt="Façade de l'Assemblée nationale"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block', transformOrigin: 'center center', opacity: 1, willChange: 'transform,opacity' }}
              />
              <div data-blue style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,#0c1a3a 0%,#0a1430 60%,#070d1f 100%)', mixBlendMode: 'color', opacity: 0, pointerEvents: 'none' }} />
              <div data-scrim style={{ position: 'absolute', inset: 0, background: 'radial-gradient(118% 120% at 50% 40%, rgba(8,16,34,0) 0%, rgba(8,15,32,0.45) 58%, rgba(5,9,20,0.92) 100%)', opacity: 0.32, pointerEvents: 'none' }} />
              <div data-dots style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
              <div data-fx style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
            </div>
          </div>
        </div>

        {/* HUD: all text/cards — never cover-clipped */}
        <div data-hud style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>

          {/* progress bar */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.12)' }}>
            <div data-topbar style={{ height: '100%', background: '#C9302C', transform: 'scaleX(0)', transformOrigin: 'left center', willChange: 'transform' }} />
          </div>

          {/* connective link SVG */}
          <svg data-link width="100%" height="100%" style={{ position: 'absolute', inset: 0, overflow: 'visible', opacity: 0 }}>
            <defs>
              <linearGradient id="linkgrad" x1="0" y1="1" x2="1" y2="0">
                <stop data-linkstop offset="0" stopColor="#F04438" stopOpacity="0.05" />
                <stop data-linkstop offset="0.5" stopColor="#F04438" stopOpacity="0.95" />
                <stop data-linkstop offset="1" stopColor="#F04438" stopOpacity="0.95" />
              </linearGradient>
            </defs>
            <path data-linkpath d="" fill="none" stroke="url(#linkgrad)" strokeWidth="2.4" strokeLinecap="round" />
          </svg>

          {/* corner chrome */}
          <div data-chrome style={{ opacity: 0 }}>
            <div style={{ position: 'absolute', top: 26, left: 26, width: 28, height: 28, borderLeft: '1px solid rgba(120,160,230,0.5)', borderTop: '1px solid rgba(120,160,230,0.5)' }} />
            <div style={{ position: 'absolute', top: 26, right: 26, width: 28, height: 28, borderRight: '1px solid rgba(120,160,230,0.5)', borderTop: '1px solid rgba(120,160,230,0.5)' }} />
            <div style={{ position: 'absolute', bottom: 26, left: 26, width: 28, height: 28, borderLeft: '1px solid rgba(120,160,230,0.5)', borderBottom: '1px solid rgba(120,160,230,0.5)' }} />
            <div style={{ position: 'absolute', bottom: 26, right: 26, width: 28, height: 28, borderRight: '1px solid rgba(120,160,230,0.5)', borderBottom: '1px solid rgba(120,160,230,0.5)' }} />
            <div style={{ position: 'absolute', top: 60, right: 'clamp(22px,4vw,56px)', textAlign: 'right' }}>
              <div style={{ fontSize: 'clamp(12px,1.4vw,15px)', letterSpacing: '0.30em', color: 'rgba(150,185,240,0.9)', fontWeight: 600 }}>SÉANCE PUBLIQUE</div>
              <div style={{ fontSize: 11, letterSpacing: '0.20em', color: 'rgba(150,185,240,0.6)', marginTop: 7, fontFamily: 'monospace' }}>SCRUTIN N° {stats.votes.toLocaleString('fr-FR')}</div>
              <div style={{ fontSize: 11, letterSpacing: '0.20em', color: 'rgba(150,185,240,0.6)', marginTop: 3, fontFamily: 'monospace' }}>{stats.lastUpdated.replace('Mis à jour : ', '').toUpperCase()}</div>
            </div>
            <div style={{ position: 'absolute', bottom: 52, left: 'clamp(22px,4vw,56px)' }}>
              <div style={{ fontSize: 12, letterSpacing: '0.26em', color: 'rgba(120,160,230,0.95)', fontWeight: 600 }}>DONNÉES OUVERTES</div>
              <div style={{ fontSize: 13, lineHeight: 1.5, color: 'rgba(150,180,225,0.55)', marginTop: 8 }}>Chaque scrutin, archivé et<br />rendu lisible par MonÉlu.</div>
            </div>
          </div>

          {/* scene label */}
          <div data-scenelabel style={{ position: 'absolute', top: 64, left: 'clamp(22px,4vw,60px)', fontSize: 'clamp(11px,1.3vw,13px)', letterSpacing: '0.30em', color: 'rgba(150,185,240,0.85)', fontWeight: 600, opacity: 0, fontFamily: 'monospace' }}>EXTÉRIEUR</div>

          {/* entry captions (3 scenes) */}
          <div data-entrycap style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(680px,90vw)', textAlign: 'center', opacity: 0 }}>
            <div style={{ width: 34, height: 2, background: '#C9302C', margin: '0 auto 18px' }} />
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.82)', textShadow: '0 1px 8px rgba(0,0,0,0.5)' }}>Données officielles</div>
            <div style={{ fontFamily: 'DM Serif Display, Georgia, serif', fontWeight: 800, fontSize: 'clamp(30px,4.6vw,52px)', lineHeight: 1.08, letterSpacing: '-0.02em', color: '#fff', margin: '16px 0 0', textShadow: '0 2px 28px rgba(0,0,0,0.55)' }}>La vie politique française, enfin lisible.</div>
            <p style={{ fontSize: 'clamp(16px,1.8vw,19px)', lineHeight: 1.55, color: 'rgba(255,255,255,0.9)', margin: '16px auto 0', maxWidth: 500, textShadow: '0 1px 14px rgba(0,0,0,0.55)' }}>Chaque loi naît ici. Nous la rendons accessible à toutes et tous.</p>
          </div>
          <div data-entrycap style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(680px,90vw)', textAlign: 'center', opacity: 0 }}>
            <div style={{ width: 34, height: 2, background: '#C9302C', margin: '0 auto 18px' }} />
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.82)', textShadow: '0 1px 8px rgba(0,0,0,0.5)' }}>Transparence</div>
            <div style={{ fontFamily: 'DM Serif Display, Georgia, serif', fontWeight: 800, fontSize: 'clamp(30px,4.6vw,52px)', lineHeight: 1.08, letterSpacing: '-0.02em', color: '#fff', margin: '16px 0 0', textShadow: '0 2px 28px rgba(0,0,0,0.55)' }}>Entrez là où se votent les lois.</div>
            <p style={{ fontSize: 'clamp(16px,1.8vw,19px)', lineHeight: 1.55, color: 'rgba(255,255,255,0.9)', margin: '16px auto 0', maxWidth: 500, textShadow: '0 1px 14px rgba(0,0,0,0.55)' }}>Les portes de l&apos;Assemblée nationale, ouvertes en données.</p>
          </div>
          <div data-entrycap style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(700px,90vw)', textAlign: 'center', opacity: 0 }}>
            <div style={{ width: 34, height: 2, background: '#C9302C', margin: '0 auto 18px' }} />
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.82)', textShadow: '0 1px 8px rgba(0,0,0,0.5)' }}>En clair</div>
            <div style={{ fontFamily: 'DM Serif Display, Georgia, serif', fontWeight: 800, fontSize: 'clamp(30px,4.6vw,52px)', lineHeight: 1.08, letterSpacing: '-0.02em', color: '#fff', margin: '16px 0 0', textShadow: '0 2px 28px rgba(0,0,0,0.55)' }}>Comprendre chaque scrutin.</div>
            <p style={{ fontSize: 'clamp(16px,1.8vw,19px)', lineHeight: 1.55, color: 'rgba(255,255,255,0.9)', margin: '16px auto 0', maxWidth: 520, textShadow: '0 1px 14px rgba(0,0,0,0.55)' }}>Suivez les votes de vos députés, en toute neutralité.</p>
          </div>

          {/* data act titles */}
          <div data-title="0" style={{ position: 'absolute', top: 'clamp(90px,13vh,124px)', left: 'clamp(22px,4vw,60px)', width: 'min(460px,86vw)', opacity: 0 }}>
            <h1 style={{ margin: 0, fontFamily: 'DM Serif Display, Georgia, serif', fontWeight: 800, fontSize: 'clamp(34px,4.6vw,52px)', lineHeight: 1.03, letterSpacing: '-0.02em', color: '#fff', textShadow: '0 2px 30px rgba(0,0,0,0.6)' }}>LA DÉMOCRATIE<br />EN DONNÉES</h1>
            <p style={{ margin: '22px 0 0', fontSize: 'clamp(16px,1.8vw,19px)', lineHeight: 1.55, color: 'rgba(255,255,255,0.84)', maxWidth: 340, textShadow: '0 1px 14px rgba(0,0,0,0.7)' }}>Chaque siège devient un point.<br />Chaque vote, une certitude.</p>
          </div>
          <div data-title="1" style={{ position: 'absolute', top: 'clamp(90px,13vh,124px)', left: 'clamp(22px,4vw,60px)', width: 'min(460px,86vw)', opacity: 0 }}>
            <h1 style={{ margin: 0, fontFamily: 'DM Serif Display, Georgia, serif', fontWeight: 800, fontSize: 'clamp(32px,4.4vw,50px)', lineHeight: 1.04, letterSpacing: '-0.02em', color: '#fff', textShadow: '0 2px 30px rgba(0,0,0,0.6)' }}>VOTRE DÉPUTÉ,<br />VOTRE VOIX</h1>
            <p style={{ margin: '22px 0 0', fontSize: 'clamp(16px,1.8vw,19px)', lineHeight: 1.55, color: 'rgba(255,255,255,0.84)', maxWidth: 330, textShadow: '0 1px 14px rgba(0,0,0,0.7)' }}>Derrière un seul point,<br />l&apos;élu qui répond de votre voix.</p>
          </div>

          {/* beat */}
          <div data-beat style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', opacity: 0, width: 'min(600px,90vw)' }}>
            <div style={{ width: 34, height: 2, background: '#C9302C', margin: '0 auto 20px' }} />
            <div style={{ fontFamily: 'DM Serif Display, Georgia, serif', fontWeight: 800, fontSize: 'clamp(30px,4.2vw,46px)', letterSpacing: '-0.01em', color: '#fff', lineHeight: 1.08, textShadow: '0 2px 26px rgba(0,0,0,0.7)' }}>Un siège. Un vote. Un élu.</div>
            <p style={{ margin: '18px 0 0', fontSize: 'clamp(16px,1.8vw,19px)', color: 'rgba(255,255,255,0.82)', textShadow: '0 1px 12px rgba(0,0,0,0.7)' }}>Approchons-nous d&apos;un seul point de donnée.</p>
          </div>

          {/* vote card */}
          <div data-votecard style={{ position: 'absolute', right: 'clamp(16px,3vw,60px)', bottom: 130, width: 'min(312px,86vw)', padding: '26px 28px 24px', borderRadius: 14, background: 'rgba(11,18,38,0.82)', border: '1px solid rgba(120,150,210,0.22)', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', backdropFilter: 'blur(7px)', WebkitBackdropFilter: 'blur(7px)', opacity: 0 }}>
            <div style={{ textAlign: 'center', fontFamily: 'DM Serif Display, Georgia, serif', fontWeight: 700, fontSize: 24, color: '#fff', letterSpacing: '-0.01em', marginBottom: 6 }}>Mon<span style={{ color: '#C9302C' }}>É</span>lu</div>
            <div style={{ textAlign: 'center', fontSize: 12, letterSpacing: '0.18em', color: 'rgba(150,185,240,0.6)', fontFamily: 'monospace', marginBottom: 8 }}>RÉSULTAT DU SCRUTIN</div>
            {leadVote.votedAt && (
              <div style={{ textAlign: 'center', fontSize: 11, letterSpacing: '0.14em', color: 'rgba(150,185,240,0.45)', fontFamily: 'monospace', marginBottom: 6 }}>{leadVote.votedAt}</div>
            )}
            <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(210,220,240,0.72)', lineHeight: 1.45, marginBottom: 16, padding: '0 4px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{leadVote.title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <span style={{ width: 13, height: 13, borderRadius: 999, background: '#1fd4a6', boxShadow: '0 0 10px rgba(31,212,166,0.7)', flex: 'none' }} />
                <span style={{ fontSize: 17, color: 'rgba(255,255,255,0.86)' }}>Pour</span>
                <span data-num="pour" style={{ marginLeft: 'auto', fontFamily: 'monospace', fontWeight: 500, fontSize: 24, color: '#1fd4a6' }}>0</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <span style={{ width: 13, height: 13, borderRadius: 999, background: '#f0584c', boxShadow: '0 0 10px rgba(240,88,76,0.7)', flex: 'none' }} />
                <span style={{ fontSize: 17, color: 'rgba(255,255,255,0.86)' }}>Contre</span>
                <span data-num="contre" style={{ marginLeft: 'auto', fontFamily: 'monospace', fontWeight: 500, fontSize: 24, color: '#f0584c' }}>0</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <span style={{ width: 13, height: 13, borderRadius: 999, background: '#9aa6bd', flex: 'none' }} />
                <span style={{ fontSize: 17, color: 'rgba(255,255,255,0.86)' }}>Abstention</span>
                <span data-num="abst" style={{ marginLeft: 'auto', fontFamily: 'monospace', fontWeight: 500, fontSize: 24, color: '#dfe5f0' }}>0</span>
              </div>
            </div>
            <div style={{ height: 1, background: 'rgba(120,150,210,0.22)', margin: '20px 0 16px' }} />
            <div style={{ textAlign: 'center' }}>
              <span data-num="total" style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: 26, color: '#6d9eff' }}>0</span>
              {' '}<span style={{ fontSize: 17, color: 'rgba(255,255,255,0.72)' }}>votants</span>
            </div>
          </div>

          {/* deputy card — real deputy data from API */}
          <div data-deputy style={{ position: 'absolute', top: 'clamp(24px,6vh,60px)', right: 'clamp(16px,3vw,54px)', width: 'min(400px,92vw)', padding: 'clamp(20px,2.4vw,28px) clamp(20px,2.6vw,30px) clamp(20px,2.6vw,28px)', borderRadius: 18, background: 'linear-gradient(180deg,rgba(16,24,48,0.93),rgba(10,16,34,0.93))', border: '1px solid rgba(120,150,210,0.28)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', opacity: 0, transform: 'translateX(70px)', boxSizing: 'border-box', pointerEvents: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 11, letterSpacing: '0.26em', fontWeight: 600, color: '#f3b6b1', background: 'rgba(217,48,37,0.22)', border: '1px solid rgba(240,88,76,0.4)', padding: '6px 18px', borderRadius: 999 }}>VOTRE DÉPUTÉ</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div style={{ width: 100, height: 100, borderRadius: 999, padding: 3, background: 'linear-gradient(160deg,rgba(240,88,76,0.85),rgba(120,150,210,0.5))', boxShadow: '0 0 24px rgba(240,68,56,0.45)', overflow: 'hidden', flexShrink: 0 }}>
                {deputyInfo?.photoUrl ? (
                  <Image
                    src={deputyInfo.photoUrl}
                    alt={deputyInfo.name}
                    width={94}
                    height={94}
                    style={{ borderRadius: 999, objectFit: 'cover', width: 94, height: 94 }}
                  />
                ) : (
                  <div style={{ width: 94, height: 94, borderRadius: 999, background: 'rgba(13,31,60,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: 'rgba(150,185,240,0.7)' }}>⚖</div>
                )}
              </div>
            </div>
            <div style={{ textAlign: 'center', fontFamily: 'DM Serif Display, Georgia, serif', fontWeight: 700, fontSize: 'clamp(18px,2.2vw,24px)', color: '#fff', letterSpacing: '-0.01em', lineHeight: 1.2 }}>{deputyInfo?.name ?? '17ème Législature'}</div>
            <div style={{ textAlign: 'center', fontSize: 'clamp(12px,1.3vw,15px)', color: 'rgba(220,228,245,0.78)', marginTop: 6 }}>{deputyInfo?.department ?? 'Assemblée Nationale'}</div>
            <div style={{ textAlign: 'center', fontSize: 'clamp(12px,1.3vw,14px)', color: '#7fd9b6', marginTop: 6 }}>{deputyInfo?.party ?? `${stats.deputies} députés actifs`}</div>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: voteResultBg, border: `1px solid ${voteResultBorder}`, padding: '8px 20px', borderRadius: 999 }}>
                <span style={{ width: 19, height: 19, borderRadius: 999, background: voteResultColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{voteResultIcon}</span>
                <span style={{ fontSize: 'clamp(12px,1.4vw,14px)', fontWeight: 600, color: voteResultColor }}>{voteResultLabel} ce texte</span>
              </div>
            </div>
            <div style={{ height: 1, background: 'rgba(120,150,210,0.2)', margin: '14px 0 14px' }} />
            <div style={{ display: 'flex', gap: 'clamp(12px,2vw,20px)', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: 'clamp(17px,2vw,22px)', color: '#fff' }}>{(deputyInfo?.totalVotes ?? stats.votes).toLocaleString('fr-FR')}</div>
                <div style={{ fontSize: 12, color: 'rgba(180,196,228,0.66)', marginTop: 3, letterSpacing: '0.04em' }}>scrutins</div>
              </div>
              <div style={{ width: 1, background: 'rgba(120,150,210,0.2)' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: 'clamp(17px,2vw,22px)', color: '#fff' }}>{deputyInfo ? `${deputyInfo.presenceRate}%` : `${stats.deputies}`}</div>
                <div style={{ fontSize: 12, color: 'rgba(180,196,228,0.66)', marginTop: 3, letterSpacing: '0.04em' }}>{deputyInfo ? 'présence' : 'sièges'}</div>
              </div>
              <div style={{ width: 1, background: 'rgba(120,150,210,0.2)' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: 'clamp(17px,2vw,22px)', color: '#fff' }}>{(deputyInfo?.votesFor ?? totalVotes).toLocaleString('fr-FR')}</div>
                <div style={{ fontSize: 12, color: 'rgba(180,196,228,0.66)', marginTop: 3, letterSpacing: '0.04em' }}>{deputyInfo ? 'pour' : 'votants'}</div>
              </div>
            </div>
            <Link
              href={deputyInfo ? `/deputes/${deputyInfo.deputyId}` : '/deputes'}
              style={{ display: 'block', marginTop: 18, textAlign: 'center', fontSize: 14, fontWeight: 600, letterSpacing: '0.02em', color: '#fff', background: 'linear-gradient(180deg,#e8463a,#cf2f24)', padding: 12, borderRadius: 11, boxShadow: '0 10px 24px rgba(207,47,36,0.4)', textDecoration: 'none' }}
            >
              Voir le profil complet →
            </Link>
          </div>

          {/* intelligence section */}
          <div data-scene6 style={{ position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(130% 120% at 28% 18%, rgba(14,26,58,0.72) 0%, rgba(8,15,36,0.92) 52%, rgba(5,9,22,0.98) 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, boxSizing: 'border-box' }}>
              <div data-s6inner style={{ transformOrigin: 'center center', display: 'flex', flexDirection: 'column', alignItems: 'center', width: 'min(1180px,94vw)' }}>

                <div data-s6item style={{ textAlign: 'center', maxWidth: 1000, opacity: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 22 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: '#27e0ad', boxShadow: '0 0 10px rgba(39,224,173,0.8)' }} />
                    <span style={{ fontFamily: 'monospace', fontSize: 12, letterSpacing: '0.34em', color: 'rgba(160,200,235,0.82)', fontWeight: 500 }}>MONÉLU - INTELLIGENCE CIVIQUE</span>
                  </div>
                  <h2 style={{ margin: 0, fontFamily: 'DM Serif Display, Georgia, serif', fontWeight: 800, fontSize: 'clamp(32px,4.6vw,58px)', lineHeight: 1.06, letterSpacing: '-0.015em', color: '#fff' }}>De votre député à toute l&apos;Assemblée<span style={{ color: '#f0584c' }}>.</span></h2>
                  <p style={{ margin: '18px auto 0', fontSize: 'clamp(16px,1.8vw,19px)', lineHeight: 1.55, color: 'rgba(214,224,244,0.8)', maxWidth: 700 }}>Posez une question sur un député, un vote, un groupe ou une loi. L&apos;IA de MonÉlu relie chaque réponse aux données et aux sources officielles.</p>
                </div>

                <form
                  data-s6item
                  onSubmit={e => { e.preventDefault(); submitQuery(query) }}
                  style={{ marginTop: 30, width: 'min(880px,94%)', display: 'flex', alignItems: 'center', gap: 16, padding: 16, borderRadius: 16, background: 'rgba(9,15,32,0.72)', border: '1px solid rgba(120,150,210,0.34)', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxSizing: 'border-box', opacity: 0, pointerEvents: 'auto' }}
                >
                  <span style={{ width: 40, height: 40, flex: 'none', borderRadius: 11, background: 'linear-gradient(160deg,#13213f,#0b1730)', border: '1px solid rgba(39,224,173,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2.5 L13.7 9.6 L21 11 L13.7 12.4 L12 19.5 L10.3 12.4 L3 11 L10.3 9.6 Z" fill="#27e0ad" /></svg>
                  </span>
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Posez votre question sur un député, un vote..."
                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 'clamp(14px,1.6vw,17px)', color: 'rgba(230,238,252,0.96)', letterSpacing: '-0.01em' }}
                  />
                  <button
                    type="submit"
                    style={{ flex: 'none', fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.08em', color: 'rgba(160,190,230,0.62)', border: '1px solid rgba(120,150,210,0.36)', borderRadius: 7, padding: '7px 11px', background: 'transparent', cursor: 'pointer' }}
                  >
                    Entrée ↵
                  </button>
                </form>

                <div data-s6item style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 9, opacity: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12.5 L10 17.5 L19 6.5" stroke="#27e0ad" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span style={{ fontSize: 'clamp(12px,1.4vw,13.5px)', color: 'rgba(180,205,235,0.7)' }}>Chaque réponse reliée à ses sources officielles - Assemblée nationale, Journal officiel, Légifrance.</span>
                </div>

                <div style={{ marginTop: 32, width: '100%', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
                  {[
                    {
                      icon: <><circle cx="12" cy="8" r="3.6" /><path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /></>,
                      color: '#f0584c', colorBg: 'rgba(38,22,30,0.5)', colorBorder: 'rgba(240,88,76,0.42)',
                      label: 'Députés', badge: `${stats.deputies} élus`,
                      q: deputyInfo ? `Quel est le bilan de ${deputyInfo.name} ?` : 'Quel est le bilan de Marine Le Pen ?',
                    },
                    {
                      icon: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 12.2l2.6 2.6L16 9" /></>,
                      color: '#5fd6b0', colorBg: 'rgba(18,28,54,0.5)', colorBorder: 'rgba(120,150,210,0.2)',
                      label: 'Votes', badge: `${stats.votes.toLocaleString('fr-FR')} scrutins`,
                      q: 'Quels votes ont été rejetés récemment ?',
                    },
                    {
                      icon: <><circle cx="8.5" cy="9" r="2.7" /><path d="M3.5 19c0-2.8 2.2-4.6 5-4.6" /><circle cx="16" cy="10" r="2.4" /><path d="M13.5 19c0-2.2 1.7-3.8 3.6-3.8 1.9 0 3.4 1.4 3.4 3.4" /></>,
                      color: '#5fd6b0', colorBg: 'rgba(18,28,54,0.5)', colorBorder: 'rgba(120,150,210,0.2)',
                      label: 'Groupes', badge: '8 groupes',
                      q: 'Comment le RN vote-t-il par rapport à la majorité ?',
                    },
                    {
                      icon: <><path d="M4 8.5 12 3.5l8 5" /><path d="M6 11v7M10 11v7M14 11v7M18 11v7" /><path d="M4 20.5h16" /></>,
                      color: '#5fd6b0', colorBg: 'rgba(18,28,54,0.5)', colorBorder: 'rgba(120,150,210,0.2)',
                      label: 'Assemblée', badge: 'XVIIe lég.',
                      q: 'Quels députés ont le meilleur taux de présence ?',
                    },
                  ].map((card, i) => (
                    <button
                      key={i}
                      data-s6item
                      onClick={() => submitQuery(card.q)}
                      style={{ background: card.colorBg, border: `1px solid ${card.colorBorder}`, borderRadius: 16, padding: '18px 20px', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', opacity: 0, cursor: 'pointer', textAlign: 'left', pointerEvents: 'auto', transition: 'border-color 0.2s, background 0.2s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = card.color }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = card.colorBorder }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                          <span style={{ width: 36, height: 36, flex: 'none', borderRadius: 10, background: `rgba(${card.color === '#f0584c' ? '240,88,76' : '39,224,173'},0.1)`, border: `1px solid rgba(${card.color === '#f0584c' ? '240,88,76' : '39,224,173'},0.26)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{card.icon}</svg>
                          </span>
                          <span style={{ fontSize: 15, fontWeight: 600, color: '#fff', letterSpacing: '0.01em' }}>{card.label}</span>
                        </div>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(160,195,230,0.6)' }}>{card.badge}</span>
                      </div>
                      <div style={{ fontSize: 14.5, lineHeight: 1.45, color: 'rgba(206,218,240,0.74)' }}>«&nbsp;{card.q}&nbsp;»</div>
                    </button>
                  ))}
                </div>

                <div data-s6item style={{ marginTop: 28, opacity: 0, pointerEvents: 'auto' }}>
                  <Link
                    href="/chat"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'linear-gradient(160deg,rgba(39,224,173,0.18),rgba(39,224,173,0.08))', border: '1px solid rgba(39,224,173,0.45)', padding: '14px 32px', borderRadius: 12, fontSize: 16, fontWeight: 600, color: '#27e0ad', textDecoration: 'none', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', pointerEvents: 'auto' }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2.5 L13.7 9.6 L21 11 L13.7 12.4 L12 19.5 L10.3 12.4 L3 11 L10.3 9.6 Z" fill="#27e0ad" /></svg>
                    Poser une question à MonÉlu →
                  </Link>
                </div>

              </div>
            </div>
          </div>

          {/* scroll hint */}
          <div data-hint style={{ position: 'absolute', bottom: 30, left: '50%', transform: 'translate(-50%,0)', textAlign: 'center' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.26em', color: 'rgba(170,195,240,0.7)', fontWeight: 600, marginBottom: 9, fontFamily: 'monospace' }}>DÉFILER</div>
            <svg width="22" height="13" viewBox="0 0 22 13" fill="none" style={{ margin: '0 auto', display: 'block' }}>
              <path d="M2 2 L11 11 L20 2" stroke="rgba(170,195,240,0.8)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* rail dots */}
          <div style={{ position: 'absolute', top: '50%', right: 'clamp(14px,2vw,26px)', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 11, alignItems: 'center' }}>
            {[0, 1, 2, 3, 4].map(i => (
              <span key={i} data-raildot style={{ width: 7, height: 7, borderRadius: 999, background: 'rgba(160,185,235,0.28)', transition: 'background .4s,height .4s', display: 'block' }} />
            ))}
          </div>

        </div>
      </div>
    </div>
  )
}

export function AssemblyScrollExperience({ stats, leadVote, deputyInfo }: Props) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return <StaticExperience stats={stats} leadVote={leadVote} deputyInfo={deputyInfo} />
  }

  return (
    <>
      <div className="hidden md:block">
        <CinematicExperience stats={stats} leadVote={leadVote} deputyInfo={deputyInfo} />
      </div>
      <MobileExperience stats={stats} leadVote={leadVote} deputyInfo={deputyInfo} />
    </>
  )
}
