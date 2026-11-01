export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'monelu-theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

// #612: the theme is one value for the whole site, the landing page included,
// and the DOM is only ever written with the value the visitor will keep.
// THEME_INIT_SCRIPT applies it in <head>, before the first paint; the store
// below applies the same value again on mount (a no-op after the script, and
// what tests rely on), then on every toggle, every system appearance change
// while nothing is stored, and every change made in another tab. Nothing here
// runs in a React effect, so no render with a provisional value can reach the
// page: that is what made a dark page flash light on load, and Accueil flip
// the theme on the way to /quiz.

// The choice made on this page, read only while storage is blocked.
let chosenTheme: Theme | null = null

function storedTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    return chosenTheme
  }
}

export function resolveTheme(): Theme {
  return storedTheme() ?? (window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light')
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

const listeners = new Set<() => void>()

function refresh() {
  applyTheme(resolveTheme())
  listeners.forEach(listener => listener())
}

function onStorage(event: StorageEvent) {
  if (event.key === THEME_STORAGE_KEY || event.key === null) refresh()
}

export function subscribeToTheme(listener: () => void): () => void {
  if (listeners.size === 0) {
    window.matchMedia(DARK_QUERY).addEventListener('change', refresh)
    window.addEventListener('storage', onStorage)
  }
  listeners.add(listener)
  applyTheme(resolveTheme())
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.matchMedia(DARK_QUERY).removeEventListener('change', refresh)
      window.removeEventListener('storage', onStorage)
    }
  }
}

/** Stores an explicit choice, which from then on wins over the system appearance. */
export function setTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Storage blocked: the choice still holds until the page is left.
    chosenTheme = theme
  }
  refresh()
}

/**
 * Inlined in <head> by the root layout, as a plain script rather than
 * next/script: in the App Router even `beforeInteractive` scripts wait for the
 * bootstrap chunks, so the page painted light before the dark class arrived.
 * It must resolve exactly as `resolveTheme` does.
 */
export const THEME_INIT_SCRIPT =
  `(function(){try{` +
  `var s=localStorage.getItem('${THEME_STORAGE_KEY}');` +
  `var t=s==='dark'||s==='light'?s:(window.matchMedia('${DARK_QUERY}').matches?'dark':'light');` +
  `if(t==='dark')document.documentElement.classList.add('dark');` +
  `}catch(e){}})();`
