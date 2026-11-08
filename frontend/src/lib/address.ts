// Address suggestions from the Base Adresse Nationale, called from the browser
// (ADR-047 §4). The address typed goes to the State's geocoder and nowhere else:
// MonÉlu only ever receives the coordinates of the address the visitor picks.
//
// The geocoder is served by IGN's Géoplateforme, which took over
// api-adresse.data.gouv.fr; its CORS policy allows any origin.

export const GEOCODER_URL = 'https://data.geopf.fr/geocodage/search'

export const MIN_ADDRESS_QUERY_LENGTH = 3

export const MAX_SUGGESTIONS = 5

/**
 * Result types precise enough to stand for where someone lives: an address
 * with a house number, or a lieu-dit. A street's or a town's point is its
 * middle, which in a city split between seats would name the wrong one with
 * confidence (ADR-047 §5), so those are left out.
 */
export const PRECISE_TYPES = new Set(['housenumber', 'locality'])

export type AddressSuggestion = {
  /** "8 Boulevard du Port 80000 Amiens" */
  label: string
  /** "80, Somme, Hauts-de-France" */
  context: string
  lat: number
  lon: number
}

type GeocoderFeature = {
  geometry?: { type?: string; coordinates?: [number, number] }
  properties?: { label?: string; context?: string; type?: string }
}

export async function searchAddresses(
  query: string,
  signal?: AbortSignal
): Promise<AddressSuggestion[]> {
  const q = query.trim()
  if (q.length < MIN_ADDRESS_QUERY_LENGTH) return []
  // Ask for more than are shown: streets and towns are dropped afterwards, and
  // they must not crowd out the house numbers further down.
  const params = new URLSearchParams({ q, limit: '15', autocomplete: '1' })
  const res = await fetch(`${GEOCODER_URL}?${params}`, { signal })
  if (!res.ok) throw new Error(`Geocoder error: ${res.status}`)
  const body: { features?: GeocoderFeature[] } = await res.json()
  return (body.features ?? []).flatMap(feature => {
    const coords = feature.geometry?.coordinates
    const label = feature.properties?.label
    if (feature.geometry?.type !== 'Point' || !coords || !label) return []
    if (!PRECISE_TYPES.has(feature.properties?.type ?? '')) return []
    const [lon, lat] = coords
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return []
    return [{ label, context: feature.properties?.context ?? '', lat, lon }]
  }).slice(0, MAX_SUGGESTIONS)
}
