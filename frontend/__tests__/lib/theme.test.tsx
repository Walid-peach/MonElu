/**
 * #612: one theme for the whole site, written to <html> only with the value
 * the visitor keeps. Accueil used to be pinned light while every other page
 * followed the system, so a dark-mode phone flipped theme on every trip
 * through the home page, and the provider's effect briefly removed the dark
 * class the <head> script had set, so dark pages flashed light on load.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, fireEvent, render, screen } from '@testing-library/react'

import { ThemeProvider } from '@/components/ThemeProvider'
import { ThemeToggle } from '@/components/ThemeToggle'
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from '@/lib/theme'

let pathname = '/'
jest.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))

type Listener = () => void
let systemDark = false
let systemListeners: Listener[] = []

function mockMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: jest.fn().mockImplementation((media: string) => ({
      get matches() {
        return systemDark
      },
      media,
      addEventListener: (_: string, listener: Listener) => systemListeners.push(listener),
      removeEventListener: (_: string, listener: Listener) => {
        systemListeners = systemListeners.filter(l => l !== listener)
      },
    })),
  })
}

function setSystemDark(dark: boolean) {
  systemDark = dark
  act(() => systemListeners.forEach(listener => listener()))
}

const isDark = () => document.documentElement.classList.contains('dark')

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>
  )
}

beforeEach(() => {
  pathname = '/'
  systemDark = false
  systemListeners = []
  mockMatchMedia()
})

afterEach(() => {
  window.localStorage.clear()
  document.documentElement.classList.remove('dark')
})

describe('the landing page', () => {
  it('shows the toggle', () => {
    renderToggle()
    expect(screen.getByRole('button', { name: /passer en mode sombre/i })).toBeInTheDocument()
  })

  it('follows a dark system appearance like every other page', () => {
    systemDark = true
    renderToggle()
    expect(isDark()).toBe(true)
  })

  it('keeps the theme when the visitor moves from Accueil to the quiz', () => {
    systemDark = true
    const { rerender } = renderToggle()
    pathname = '/quiz'
    rerender(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    )
    expect(isDark()).toBe(true)
  })
})

describe('the theme store', () => {
  it('never removes the dark class the head script set when the stored theme is dark', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    document.documentElement.classList.add('dark')
    const seen: boolean[] = []
    const observer = new MutationObserver(() => seen.push(isDark()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    renderToggle()
    // MutationObserver callbacks are microtasks; flush them.
    return Promise.resolve().then(() => {
      observer.disconnect()
      expect(seen).not.toContain(false)
      expect(isDark()).toBe(true)
    })
  })

  it('follows a system appearance change live while nothing is stored', () => {
    renderToggle()
    expect(isDark()).toBe(false)

    setSystemDark(true)

    expect(isDark()).toBe(true)
    expect(screen.getByRole('button', { name: /passer en mode clair/i })).toBeInTheDocument()
  })

  it('never lets the system override a stored choice', () => {
    renderToggle()
    fireEvent.click(screen.getByRole('button', { name: /passer en mode sombre/i }))

    setSystemDark(false)

    expect(isDark()).toBe(true)
  })

  it('follows a choice made in another tab', () => {
    renderToggle()

    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'dark' }))
    })

    expect(isDark()).toBe(true)
  })

  it("stops listening once nothing is mounted", () => {
    const { unmount } = renderToggle()
    expect(systemListeners).toHaveLength(1)
    unmount()
    expect(systemListeners).toHaveLength(0)
  })
})

describe('THEME_INIT_SCRIPT', () => {
  const run = () => new Function(THEME_INIT_SCRIPT)()

  it.each([
    [null, false, false],
    [null, true, true],
    ['dark', false, true],
    ['light', true, false],
  ])('stored %s with a dark system %s resolves dark: %s', (stored, system, dark) => {
    if (stored) window.localStorage.setItem(THEME_STORAGE_KEY, stored)
    systemDark = system
    run()
    expect(isDark()).toBe(dark)
  })

  it('has no exception for the landing page', () => {
    expect(THEME_INIT_SCRIPT).not.toContain('pathname')
  })

  it('runs as a plain script first in <head>, not through next/script', () => {
    const layout = readFileSync(join(__dirname, '..', '..', 'src', 'app', 'layout.tsx'), 'utf8')
    const head = layout.slice(layout.indexOf('<head>'), layout.indexOf('</head>'))
    expect(head.indexOf('THEME_INIT_SCRIPT')).toBeGreaterThan(-1)
    expect(head.indexOf('THEME_INIT_SCRIPT')).toBeLessThan(head.indexOf('INSTALL_PROMPT_CAPTURE_SCRIPT'))
    expect(layout).not.toContain('strategy="beforeInteractive"')
  })
})

describe('color-scheme', () => {
  const css = readFileSync(join(__dirname, '..', '..', 'src', 'app', 'globals.css'), 'utf8')

  it('follows the palette, so native controls and scrollbars match the theme', () => {
    expect(css).toMatch(/:root,\s*\.dp-light\s*\{\s*(\/\*[\s\S]*?\*\/\s*)?color-scheme: light;/)
    expect(css).toMatch(/\.dark,\s*\.dp-dark\s*\{\s*color-scheme: dark;/)
  })
})
