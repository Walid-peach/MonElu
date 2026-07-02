// Resolves a French postal code to its department name via geo.api.gouv.fr,
// matching the full-name format stored in deputies.department (see
// scripts/update_party.py DEPT_NAMES). Non-postal-code input (names,
// department names) is left for the caller to search on directly.
export async function resolvePostalCode(input: string): Promise<string | null> {
  if (!/^\d{5}$/.test(input)) return null

  try {
    const res = await fetch(
      `https://geo.api.gouv.fr/communes?codePostal=${input}&fields=departement&format=json`
    )
    if (!res.ok) return null
    const communes = await res.json()
    return communes[0]?.departement?.nom ?? null
  } catch {
    return null
  }
}
