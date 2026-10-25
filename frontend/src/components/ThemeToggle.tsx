'use client'

import { useTheme } from './ThemeProvider'

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()

  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
      title={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
      className={`flex items-center justify-center w-8 h-8 rounded-full text-[color:var(--dp-text-muted)] hover:text-navy hover:bg-gray-light transition-colors ${className}`}
    >
      <span aria-hidden="true" className="text-base leading-none">{isDark ? '☀' : '☾'}</span>
    </button>
  )
}
