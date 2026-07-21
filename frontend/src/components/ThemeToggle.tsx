'use client'

import { usePathname } from 'next/navigation'
import { isLightOnlyPath } from '@/lib/theme'
import { useTheme } from './ThemeProvider'

export function ThemeToggle({ className = '' }: { className?: string }) {
  const pathname = usePathname()
  const { theme, toggleTheme } = useTheme()

  if (isLightOnlyPath(pathname)) return null

  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
      title={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
      className={`flex items-center justify-center w-8 h-8 rounded-full text-gray-mid hover:text-navy hover:bg-gray-light transition-colors ${className}`}
    >
      <span aria-hidden="true" className="text-base leading-none">{isDark ? '☀' : '☾'}</span>
    </button>
  )
}
