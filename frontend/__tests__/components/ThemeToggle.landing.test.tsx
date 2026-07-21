import { render, screen } from '@testing-library/react'

import { ThemeProvider } from '@/components/ThemeProvider'
import { ThemeToggle } from '@/components/ThemeToggle'

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
}))

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: jest.fn().mockImplementation(() => ({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })),
  })
})

afterEach(() => {
  window.localStorage.clear()
  document.documentElement.classList.remove('dark')
})

describe('ThemeToggle on the landing page', () => {
  it('renders nothing, since the landing page is always light', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('never applies the dark class even when the stored preference is dark', () => {
    window.localStorage.setItem('monelu-theme', 'dark')

    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    )

    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
