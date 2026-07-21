'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { THEME_STORAGE_KEY, isLightOnlyPath, type Theme } from '@/lib/theme'

type ThemeContextValue = {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getStoredOrPreferredTheme(): Theme {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    // Reading localStorage/matchMedia during render would mismatch the
    // server-rendered 'light' default and break hydration — this effect is
    // the one-time sync from those browser-only APIs into React state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(getStoredOrPreferredTheme())
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark' && !isLightOnlyPath(pathname))
  }, [theme, pathname])

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      window.localStorage.setItem(THEME_STORAGE_KEY, next)
      return next
    })
  }, [])

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
