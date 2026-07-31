import type { QuizDeputyMatch, QuizMatchResponse } from '@/lib/api'
import { partyHex } from '@/lib/utils'

// The poster card (MON-203) — one framed portrait panel that *is* the shared
// result, rendered identically on the live results screen (QuizClient) and on
// the stored share page (/quiz/s/[id]).
//
// Every block reads from the match/snapshot payload alone: no second API call,
// no client-side recomputation of any percentage (ADR-025). Blocks whose data
// is absent from a snapshot disappear entirely rather than rendering a
// placeholder — a card with four blocks and one with seven must both look
// deliberate, which is what the space-between body layout below is for.
//
// Not a client component: it holds no state and no handlers, so the share page
// renders it on the server.

const BAND = 'var(--dp-active-bg)' // navy in both themes, unlike --dp-text
const NAVY = 'var(--dp-text)'
const RED = 'var(--dp-red)'
const GRAY = 'var(--dp-text-secondary)'
const MUTED = 'var(--dp-text-muted)'
const LINE = 'var(--dp-border)'

// Themes are one-word-ish; three fill the centre block without wrapping past
// two lines at the card's width.
const MAX_THEMES = 3

const kicker: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 10.5,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: RED,
  margin: '0 0 9px',
}

const inset: React.CSSProperties = {
  background: 'var(--dp-track-bg)',
  borderRadius: 8,
  padding: '14px 16px',
}

function pct(match: QuizDeputyMatch): string {
  return match.agreement_pct !== null ? `${match.agreement_pct}%` : '—'
}

function Band({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: BAND,
        color: '#fff',
        padding: '11px 16px',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {children}
    </div>
  )
}

// Allies and opposites share one pill shape so they read as a matched pair.
// The party colour is used as border + text on the card background — the
// contrast pairing the design system already tunes (MON-197) — never as a
// fill behind white text, which is untested for the lighter party palette.
function DeputyPill({ match, muted = false }: { match: QuizDeputyMatch; muted?: boolean }) {
  const hex = partyHex(match.party)
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 7,
        padding: '5px 11px',
        borderRadius: 999,
        fontSize: 12.5,
        maxWidth: '100%',
        border: muted ? `1px dashed ${LINE}` : `2px solid ${hex}`,
        color: muted ? GRAY : hex,
      }}
    >
      <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {match.full_name}
      </span>
      <span className="font-mono" style={{ fontWeight: 700, flexShrink: 0 }}>
        {pct(match)}
      </span>
    </span>
  )
}

// The spectrum between the group you agree with most and the one you agree
// with least. The marker sits at high / (high + low) — how far your answers
// lean toward the top pole relative to the bottom one — so a 84 %/18 % split
// puts you close to the top pole rather than in the middle.
function Axis({ result }: { result: QuizMatchResponse }) {
  // `groups` arrives sorted by descending agreement from the API.
  const high = result.groups[0]
  const low = result.groups[result.groups.length - 1]
  const total = high.agreement_pct + low.agreement_pct
  const markerPct = total === 0 ? 50 : (high.agreement_pct / total) * 100
  const highHex = partyHex(high.party)
  const lowHex = partyHex(low.party)

  return (
    <section>
      <p style={kicker}>Votre axe</p>
      <div
        style={{
          position: 'relative',
          height: 8,
          borderRadius: 999,
          background: `linear-gradient(90deg, ${lowHex}, ${highHex})`,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: -3,
            left: `${markerPct}%`,
            width: 14,
            height: 14,
            marginLeft: -7,
            borderRadius: '50%',
            background: 'var(--dp-card-bg)',
            border: `3px solid ${NAVY}`,
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, marginTop: 9 }}>
        {[
          { group: low, hex: lowHex, align: 'left' as const },
          { group: high, hex: highHex, align: 'right' as const },
        ].map(({ group, hex, align }) => (
          <div key={group.party} style={{ textAlign: align, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: hex }}>
              {group.party_short ?? group.party}
            </div>
            <div className="font-mono" style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>
              {group.agreement_pct}% d’accord
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function themeLine(themes: string[]): string {
  const shown = themes.slice(0, MAX_THEMES).join(' · ')
  const extra = themes.length - MAX_THEMES
  return extra > 0 ? `${shown} +${extra}` : shown
}

// The centre block. Present only when the payload carries `themes`: on a
// stored share that means the sharer opted into publishing their answers,
// since naming the themes voted pour / contre re-encodes them exactly
// (ADR-028, and the same reasoning that strips `detail` from snapshots).
function Themes({ themes }: { themes: NonNullable<QuizMatchResponse['themes']> }) {
  const forThemes = themes.supported.length > 0
  const hero = forThemes ? themes.supported : themes.opposed
  const counter = forThemes ? themes.opposed : []

  return (
    <section style={{ ...inset, textAlign: 'center' }}>
      <p style={{ ...kicker, color: GRAY, margin: '0 0 7px' }}>
        {forThemes ? 'Vous votez pour' : 'Vous votez contre'}
      </p>
      <p
        className="font-newsreader"
        style={{
          margin: 0,
          fontSize: 'clamp(17px, 4.4vw, 22px)',
          lineHeight: 1.3,
          fontWeight: 600,
          color: forThemes ? NAVY : RED,
        }}
      >
        {themeLine(hero)}
      </p>
      {counter.length > 0 && (
        <p style={{ margin: '7px 0 0', fontSize: 12, color: MUTED }}>
          et contre : {themeLine(counter)}
        </p>
      )}
    </section>
  )
}

function DotMeter({ value, hex }: { value: number | null; hex: string }) {
  const filled = value === null ? 0 : Math.round(value / 20)
  return (
    <span style={{ display: 'inline-flex', gap: 3 }} aria-hidden="true">
      {[0, 1, 2, 3, 4].map(i => (
        <span
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: i < filled ? hex : 'var(--dp-border)',
          }}
        />
      ))}
    </span>
  )
}

// The département block is gated on `my_department` being in the payload,
// which is itself opt-out at share time (MON-175): a shared card must never
// publish the sharer's département when they declined it. `focus` is a
// different thing — a deputy the taker arrived from (MON-183) — and says
// nothing about where they live, so it can stand in when there's no
// département.
function LocalDeputy({ result }: { result: QuizMatchResponse }) {
  const fromDepartment = result.my_department
    ? ([...result.my_department.deputies].sort(
        (a, b) => (b.agreement_pct ?? -1) - (a.agreement_pct ?? -1)
      )[0] ?? null)
    : null
  // The label follows whichever source actually produced the deputy, not the
  // mere presence of my_department: a département whose roster came back empty
  // must not caption a focus deputy as one of "vos députés".
  const deputy = fromDepartment ?? result.focus
  if (!deputy) return null
  const hex = partyHex(deputy.party)

  return (
    <section>
      <p style={kicker}>
        {fromDepartment
          ? `Vos députés · ${result.my_department!.name}`
          : 'Le député que vous suiviez'}
      </p>
      <div style={{ ...inset, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 999, background: hex }} />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13.5,
            fontWeight: 600,
            color: NAVY,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {deputy.full_name}
        </span>
        <DotMeter value={deputy.agreement_pct} hex={hex} />
        <span className="font-mono" style={{ fontSize: 13, fontWeight: 700, color: hex }}>
          {pct(deputy)}
        </span>
      </div>
    </section>
  )
}

export function QuizResultCard({ result }: { result: QuizMatchResponse }) {
  const best = result.top_matches[0] ?? null
  const allies = result.top_matches.slice(0, 3)
  const themes = result.themes
  const hasThemes = themes != null && themes.supported.length + themes.opposed.length > 0

  return (
    <article
      // Grid rather than a plain block: grid rows take their automatic minimum
      // size, so the panel holds its 4:5 portrait ratio when it has room and
      // grows past it instead of clipping when every block is present.
      style={{
        display: 'grid',
        gridTemplateRows: 'auto 1fr auto',
        aspectRatio: '4 / 5',
        maxWidth: 460,
        margin: '0 auto',
        border: `3px solid ${BAND}`,
        borderRadius: 10,
        overflow: 'hidden',
        background: 'var(--dp-card-bg)',
      }}
    >
      <Band>
        <span>Votre carte de vote</span>
        <span aria-hidden="true">✦</span>
      </Band>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 20,
          padding: '20px 18px',
          minWidth: 0,
        }}
      >
        <blockquote style={{ margin: 0, borderLeft: `3px solid ${RED}`, paddingLeft: 13 }}>
          <p
            className="font-newsreader"
            style={{
              margin: 0,
              fontStyle: 'italic',
              fontSize: 'clamp(18px, 4.8vw, 23px)',
              lineHeight: 1.35,
              fontWeight: 500,
              color: NAVY,
            }}
          >
            {best
              ? `Vous votez à ${pct(best)} comme ${best.full_name}.`
              : 'Pas assez de votes comparables pour désigner un député.'}
          </p>
        </blockquote>

        {allies.length > 0 && (
          <section>
            <p style={kicker}>Vos alliés</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {allies.map(m => (
                <DeputyPill key={m.deputy_id} match={m} />
              ))}
            </div>
          </section>
        )}

        {result.opposite && (
          <section>
            <p style={kicker}>À l’opposé</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              <DeputyPill match={result.opposite} muted />
            </div>
          </section>
        )}

        {result.groups.length >= 2 && <Axis result={result} />}

        {hasThemes && <Themes themes={themes} />}

        <LocalDeputy result={result} />
      </div>

      <Band>
        <span style={{ margin: '0 auto' }}>MonÉlu · 17ᵉ législature</span>
      </Band>
    </article>
  )
}
