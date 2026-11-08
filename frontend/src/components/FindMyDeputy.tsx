'use client'
// "Find my deputy" from an address (ADR-047, #663).
//
// The visitor types an address; suggestions come from the Base Adresse Nationale,
// called from the browser. Picking one sends only its coordinates to
// POST /circonscriptions/locate. Nothing is stored: the parent decides what to do
// with the deputy the visitor chooses (follow them, compare quiz answers...).
import { useEffect, useId, useRef, useState, KeyboardEvent } from 'react'
import Link from 'next/link'
import { api, ApiError } from '@/lib/api'
import type { AbroadSeat, LocateResponse, Seat } from '@/lib/api'
import { searchAddresses, MIN_ADDRESS_QUERY_LENGTH } from '@/lib/address'
import type { AddressSuggestion } from '@/lib/address'
import { DeputyAvatar } from '@/components/DeputyAvatar'

export const SITUATION_ELECTORALE_URL =
  'https://www.service-public.gouv.fr/particuliers/vosdroits/services-en-ligne-et-formulaires/ISE'

const SUGGEST_DELAY_MS = 250

type Outcome =
  | { kind: 'located'; address: string; response: LocateResponse }
  | { kind: 'not_found'; address: string }
  | { kind: 'error' }
  | { kind: 'abroad'; seats: AbroadSeat[] | null; failed: boolean }

type Props = {
  /** Label of the button on each deputy card, e.g. "Suivre ce député". */
  actionLabel: string
  onChoose: (seat: Seat) => void
  /** Disables the action buttons while the parent works (e.g. the quiz computing). */
  busy?: boolean
}

export function FindMyDeputy({ actionLabel, onChoose, busy = false }: Props) {
  const inputId = useId()
  const listId = useId()
  const helpId = useId()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [suggestFailed, setSuggestFailed] = useState(false)
  // The geocoder answered, but with no house number or lieu-dit to locate.
  const [noPreciseMatch, setNoPreciseMatch] = useState(false)
  const [locating, setLocating] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const picked = useRef<string | null>(null)
  // The lookup in flight (an address or the list abroad): a newer one aborts it,
  // so an older answer never replaces a newer result.
  const lookup = useRef<AbortController | null>(null)

  function startLookup(): AbortSignal {
    lookup.current?.abort()
    lookup.current = new AbortController()
    return lookup.current.signal
  }

  useEffect(() => () => lookup.current?.abort(), [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < MIN_ADDRESS_QUERY_LENGTH || q === picked.current) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchAddresses(q, controller.signal)
        .then(found => {
          setSuggestions(found)
          setNoPreciseMatch(found.length === 0)
          setSuggestFailed(false)
          setOpen(true)
          setActive(-1)
        })
        .catch(err => {
          if ((err as Error).name !== 'AbortError') setSuggestFailed(true)
        })
    }, SUGGEST_DELAY_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  async function pick(suggestion: AddressSuggestion) {
    const signal = startLookup()
    picked.current = suggestion.label
    setNoPreciseMatch(false)
    setQuery(suggestion.label)
    setOpen(false)
    setSuggestions([])
    setLocating(true)
    setOutcome(null)
    try {
      const response = await api.circonscriptions.locate({ lat: suggestion.lat, lon: suggestion.lon }, signal)
      if (signal.aborted) return
      setOutcome({ kind: 'located', address: suggestion.label, response })
    } catch (err) {
      if (signal.aborted) return
      setOutcome(
        err instanceof ApiError && err.status === 404
          ? { kind: 'not_found', address: suggestion.label }
          : { kind: 'error' }
      )
    } finally {
      if (!signal.aborted) setLocating(false)
    }
  }

  async function showAbroad() {
    const signal = startLookup()
    setOpen(false)
    setLocating(false)
    setOutcome({ kind: 'abroad', seats: null, failed: false })
    try {
      const seats = await api.circonscriptions.abroad()
      if (!signal.aborted) setOutcome({ kind: 'abroad', seats, failed: false })
    } catch {
      if (!signal.aborted) setOutcome({ kind: 'abroad', seats: null, failed: true })
    }
  }

  function clearSuggestions() {
    setSuggestions([])
    setOpen(false)
    setActive(-1)
    setSuggestFailed(false)
    setNoPreciseMatch(false)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length === 0) return
    if (!open) {
      // After Escape, the arrow keys bring the list back.
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(i => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(i => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      // Enter with nothing highlighted takes the first suggestion.
      e.preventDefault()
      pick(suggestions[active >= 0 ? active : 0]!)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const showList = open && suggestions.length > 0

  return (
    <div className="flex flex-col gap-3 text-left">
      <label htmlFor={inputId} className="text-sm font-semibold text-[color:var(--dp-text)]">
        Votre adresse
      </label>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          aria-describedby={helpId}
          autoComplete="street-address"
          value={query}
          onChange={e => {
            picked.current = null
            setQuery(e.target.value)
            if (e.target.value.trim().length < MIN_ADDRESS_QUERY_LENGTH) clearSuggestions()
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Ex. 8 boulevard du Port, Amiens"
          className="w-full rounded-lg border border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] px-4 py-3.5 text-base text-[color:var(--dp-text)] placeholder:text-[color:var(--dp-text-muted)] focus:border-[color:var(--dp-text)]"
        />
        {showList && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Adresses proposées"
            className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] shadow-lg"
          >
            {suggestions.map((s, i) => (
              <li
                key={`${s.label}-${i}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={e => {
                  e.preventDefault()
                  pick(s)
                }}
                className={`cursor-pointer border-l-4 px-4 py-3 text-sm ${i === active ? 'border-[color:var(--dp-red)] bg-[color:var(--dp-track-bg)]' : 'border-transparent'}`}
              >
                <span className="block font-medium text-[color:var(--dp-text)]">{s.label}</span>
                {s.context && (
                  <span className="block text-xs text-[color:var(--dp-text-secondary)]">{s.context}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p id={helpId} className="m-0 text-xs leading-relaxed text-[color:var(--dp-text-secondary)]">
        Votre adresse est envoyée à la Base Adresse Nationale, un service public, pour trouver ses
        coordonnées. MonÉlu ne reçoit que ces coordonnées et ne les conserve pas.
      </p>
      {/* What typing produced, for screen readers: the list itself is not announced. */}
      <p role="status" className="sr-only">
        {showList ? `${suggestions.length} adresse${suggestions.length > 1 ? 's' : ''} proposée${suggestions.length > 1 ? 's' : ''}` : ''}
      </p>
      {noPreciseMatch && !suggestFailed && (
        <p role="status" className="m-0 text-sm text-[color:var(--dp-text-secondary)]">
          Indiquez le numéro, la rue et la commune, par exemple « 8 boulevard du Port, Amiens ». Pour la
          Nouvelle-Calédonie, la Polynésie française et Wallis-et-Futuna, choisissez votre député dans la{' '}
          <Link href="/deputes" className="font-semibold text-[color:var(--dp-text)] underline">liste des députés</Link>.
        </p>
      )}
      {suggestFailed && (
        <p role="alert" className="m-0 text-sm text-[color:var(--dp-red)]">
          Les suggestions d&apos;adresse sont indisponibles pour le moment. Cherchez par code postal ou
          par nom ci-dessous.
        </p>
      )}
      <button
        type="button"
        onClick={showAbroad}
        className="self-start p-0 text-sm font-semibold text-[color:var(--dp-text)] underline"
      >
        J&apos;habite à l&apos;étranger
      </button>

      <div aria-live="polite">
        {locating && <p className="m-0 text-sm text-[color:var(--dp-text-secondary)]">Recherche de votre circonscription…</p>}
        {outcome && <OutcomeView outcome={outcome} actionLabel={actionLabel} onChoose={onChoose} busy={busy} />}
      </div>
    </div>
  )
}

function OutcomeView({
  outcome,
  actionLabel,
  onChoose,
  busy,
}: {
  outcome: Outcome
  actionLabel: string
  onChoose: (seat: Seat) => void
  busy: boolean
}) {
  if (outcome.kind === 'error') {
    return (
      <p role="alert" className="m-0 text-sm text-[color:var(--dp-red)]">
        La recherche a échoué. Réessayez dans un instant, ou cherchez par code postal ou par nom.
      </p>
    )
  }
  if (outcome.kind === 'not_found') {
    return (
      <p className="m-0 text-sm leading-relaxed text-[color:var(--dp-text-secondary)]">
        Nous n&apos;avons pas trouvé de circonscription pour « {outcome.address} ». Pour la
        Nouvelle-Calédonie, la Polynésie française, Wallis-et-Futuna, Saint-Barthélemy et Saint-Martin,
        choisissez votre député dans la <Link href="/deputes" className="font-semibold text-[color:var(--dp-text)] underline">liste des députés</Link>.
      </p>
    )
  }
  if (outcome.kind === 'abroad') {
    if (outcome.failed) {
      return (
        <p role="alert" className="m-0 text-sm text-[color:var(--dp-red)]">
          La liste des circonscriptions de l&apos;étranger est indisponible. Réessayez dans un instant.
        </p>
      )
    }
    if (!outcome.seats) {
      return <p className="m-0 text-sm text-[color:var(--dp-text-secondary)]">Chargement…</p>
    }
    return (
      <div className="flex flex-col gap-3">
        <p className="m-0 text-sm leading-relaxed text-[color:var(--dp-text-secondary)]">
          Les Français établis hors de France élisent 11 députés, chacun pour une région du monde.
          En cas de doute sur la vôtre, votre consulat vous l&apos;indique.
        </p>
        {outcome.seats.map(seat => (
          <SeatCard key={seat.circonscription} seat={seat} caption={seat.region} actionLabel={actionLabel} onChoose={onChoose} busy={busy} />
        ))}
      </div>
    )
  }

  const { response, address } = outcome
  return (
    <div className="flex flex-col gap-3">
      {response.uncertain ? (
        <p className="m-0 text-sm leading-relaxed text-[color:var(--dp-text-secondary)]">
          « {address} » est tout près de la limite entre {response.seats.length} circonscriptions, et
          notre carte n&apos;est pas assez précise pour trancher. Votre circonscription est indiquée sur
          votre carte électorale, ou sur le service officiel{' '}
          <a href={SITUATION_ELECTORALE_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-[color:var(--dp-text)] underline">
            Interroger sa situation électorale
          </a>
          .
        </p>
      ) : (
        <p className="m-0 text-sm text-[color:var(--dp-text-secondary)]">« {address} »</p>
      )}
      {response.seats.map(seat => (
        <SeatCard
          key={`${seat.department_code}-${seat.circonscription}`}
          seat={seat}
          caption={seat.label}
          actionLabel={actionLabel}
          onChoose={onChoose}
          busy={busy}
        />
      ))}
    </div>
  )
}

function SeatCard({
  seat,
  caption,
  actionLabel,
  onChoose,
  busy,
}: {
  seat: Seat
  caption: string
  actionLabel: string
  onChoose: (seat: Seat) => void
  busy: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[color:var(--dp-border)] bg-[color:var(--dp-card-bg)] p-4">
      {seat.deputy ? (
        <>
          <DeputyAvatar name={seat.deputy.full_name} photoUrl={seat.deputy.photo_url} decorative />
          {/* On a phone the button takes its own line, so the name is not squeezed. */}
          <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-auto">
            <div className="font-semibold text-[color:var(--dp-text)]">{seat.deputy.full_name}</div>
            <div className="text-sm text-[color:var(--dp-text-secondary)]">{caption}</div>
            {seat.deputy.party && (
              <div className="text-sm text-[color:var(--dp-text-secondary)]">{seat.deputy.party}</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onChoose(seat)}
            disabled={busy}
            className="w-full shrink-0 rounded-lg bg-red-civic px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
          >
            {actionLabel}
          </button>
        </>
      ) : (
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[color:var(--dp-text)]">{caption}</div>
          <div className="text-sm text-[color:var(--dp-text-secondary)]">
            Ce siège est vacant : aucun député ne le représente jusqu&apos;à une élection partielle.
          </div>
        </div>
      )}
    </div>
  )
}
