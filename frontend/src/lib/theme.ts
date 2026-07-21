export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'monelu-theme'

// The cinematic landing page keeps its fixed navy/red visual treatment
// (ADR-027) — it never renders dark, regardless of the stored preference.
export function isLightOnlyPath(pathname: string): boolean {
  return pathname === '/'
}
