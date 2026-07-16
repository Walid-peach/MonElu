// Resolves a French postal code to its department via geo.api.gouv.fr.
// The name matches the full-name format stored in deputies.department (see
// scripts/update_party.py DEPT_NAMES); the code is the canonical INSEE code
// used by the /departements/[code] pages. Non-postal-code input (names,
// department names) is left for the caller to search on directly.
export type ResolvedDepartment = { code: string; nom: string }

export async function resolvePostalCodeToDepartment(
  input: string
): Promise<ResolvedDepartment | null> {
  if (!/^\d{5}$/.test(input)) return null

  try {
    const res = await fetch(
      `https://geo.api.gouv.fr/communes?codePostal=${input}&fields=departement&format=json`
    )
    if (!res.ok) return null
    const communes = await res.json()
    const departement = communes[0]?.departement
    return departement?.code && departement?.nom
      ? { code: departement.code, nom: departement.nom }
      : null
  } catch {
    return null
  }
}

export async function resolvePostalCode(input: string): Promise<string | null> {
  const resolved = await resolvePostalCodeToDepartment(input)
  return resolved?.nom ?? null
}
