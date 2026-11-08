// Resolves a French postal code to its department via geo.api.gouv.fr.
// The name matches the full-name format stored in deputies.department (see
// scripts/update_party.py DEPT_NAMES); the code is the canonical INSEE code
// used by the /departements/[code] pages. Non-postal-code input (names,
// department names) is left for the caller to search on directly.
//
// A postal code can cover communes in more than one department (ADR-047 §6),
// so `resolvePostalCodeToDepartments` returns every one of them, in the order
// geo.api.gouv.fr lists the communes, and callers offer each rather than
// silently keeping the first.
export type ResolvedDepartment = { code: string; nom: string }

export async function resolvePostalCodeToDepartments(input: string): Promise<ResolvedDepartment[]> {
  if (!/^\d{5}$/.test(input)) return []

  try {
    const res = await fetch(
      `https://geo.api.gouv.fr/communes?codePostal=${input}&fields=departement&format=json`
    )
    if (!res.ok) return []
    const communes: { departement?: { code?: string; nom?: string } }[] = await res.json()
    const seen = new Map<string, ResolvedDepartment>()
    for (const commune of Array.isArray(communes) ? communes : []) {
      const dep = commune?.departement
      if (dep?.code && dep?.nom && !seen.has(dep.code)) seen.set(dep.code, { code: dep.code, nom: dep.nom })
    }
    return [...seen.values()]
  } catch {
    return []
  }
}

/** The department of a postal code, or null when it has none or several. */
export async function resolvePostalCodeToDepartment(
  input: string
): Promise<ResolvedDepartment | null> {
  const departments = await resolvePostalCodeToDepartments(input)
  return departments.length === 1 ? departments[0] : null
}

/** The names of every department a postal code covers (empty when none). */
export async function resolvePostalCodeToNames(input: string): Promise<string[]> {
  return (await resolvePostalCodeToDepartments(input)).map(d => d.nom)
}
