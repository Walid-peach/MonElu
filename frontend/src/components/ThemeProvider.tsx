'use client'

import { createContext, useContext, useSyncExternalStore } from 'react'
import { resolveTheme, setTheme, subscribeToTheme, type Theme } from '@/lib/theme'

const ThemeContext = createContext(false)

const serverTheme = (): Theme => 'light'

function toggleTheme() {
  setTheme(resolveTheme() === 'dark' ? 'light' : 'dark')
}

/**
 * Marks the tree that may read the theme. The theme itself is not in this
 * context: a context value that changes right after hydration reaches
 * Suspense boundaries that have not hydrated yet, which then hydrate against
 * the new value and mismatch the server HTML (#612). Each `useTheme()` reads
 * lib/theme's store instead, so it hydrates with the server snapshot and
 * re-renders on its own once mounted.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <ThemeContext.Provider value={true}>{children}</ThemeContext.Provider>
}

/**
 * The theme showing, for components that draw differently per theme. The
 * <html> class is written by lib/theme, never from here; prefer CSS (the
 * `dark:` variants or the --dp-* tokens) where markup can stay the same.
 */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  if (!useContext(ThemeContext)) throw new Error('useTheme must be used within ThemeProvider')
  const theme = useSyncExternalStore(subscribeToTheme, resolveTheme, serverTheme)
  return { theme, toggleTheme }
}
