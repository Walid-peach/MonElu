import { fireEvent, render, screen } from '@testing-library/react'

import { ThemeProvider } from '@/components/ThemeProvider'
import { ThemeToggle } from '@/components/ThemeToggle'
import { THEME_STORAGE_KEY } from '@/lib/theme'

jest.mock('next/navigation', () => ({
  usePathname: () => '/votes',
}))

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>
  )
}

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: jest.fn().mockImplementation(() => ({
      matches,
      media: '(prefers-color-scheme: dark)',
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })),
  })
}

beforeEach(() => {
  mockMatchMedia(false)
})

afterEach(() => {
  window.localStorage.clear()
  document.documentElement.classList.remove('dark')
  jest.restoreAllMocks()
})

describe('ThemeToggle', () => {
  it('defaults to light and switches to dark on click, persisting the choice', () => {
    renderToggle()
    const button = screen.getByRole('button', { name: /passer en mode sombre/i })

    fireEvent.click(button)

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(screen.getByRole('button', { name: /passer en mode clair/i })).toBeInTheDocument()
  })

  it('toggles back to light and updates storage', () => {
    renderToggle()
    const button = screen.getByRole('button', { name: /passer en mode sombre/i })

    fireEvent.click(button)
    fireEvent.click(screen.getByRole('button', { name: /passer en mode clair/i }))

    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })

  it('respects prefers-color-scheme on first render when nothing is stored', () => {
    mockMatchMedia(true)

    renderToggle()

    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('prefers a stored choice over the system preference', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light')
    mockMatchMedia(true)

    renderToggle()

    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
