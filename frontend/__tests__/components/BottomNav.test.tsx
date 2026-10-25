import { fireEvent, render, screen } from '@testing-library/react'

import { BottomNav, MENU_SEEN_STORAGE_KEY } from '@/components/BottomNav'
import { ThemeProvider } from '@/components/ThemeProvider'

let pathname = '/'
jest.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))

jest.mock('@/lib/api', () => ({
  api: { deputies: { get: jest.fn() } },
}))

function mockMatchMedia(standalone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: standalone && query === '(display-mode: standalone)',
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })),
  })
}

function renderNav() {
  return render(
    <ThemeProvider>
      <BottomNav />
    </ThemeProvider>
  )
}

const bar = () => screen.getByRole('navigation', { name: 'Navigation principale' })

beforeEach(() => {
  pathname = '/'
  window.localStorage.clear()
  document.body.style.overflow = ''
  mockMatchMedia(false)
})

describe('BottomNav', () => {
  it('shows the app tabs with Quiz in the centre, then Menu', () => {
    renderNav()
    const controls = Array.from(bar().querySelectorAll('a, button')).map(
      el => el.getAttribute('aria-label') ?? el.textContent
    )
    expect(controls).toEqual(['Accueil', 'Explorer', 'Quiz', 'Demander', 'Ouvrir le menu'])
    expect(screen.getByRole('link', { name: 'Quiz' })).toHaveAttribute('href', '/quiz')
    expect(screen.getByRole('link', { name: 'Demander' })).toHaveAttribute('href', '/chat')
  })

  // The phone browser gets MobileTopBar; this bar belongs to the installed app.
  it('shows in the installed web app only', () => {
    renderNav()
    expect(bar().className).toMatch(/^hidden\b/)
    expect(bar().className).toMatch(/\binstalled:block\b/)
    expect(bar().className).toMatch(/\bmd:!hidden\b/)
  })

  it('marks the current tab', () => {
    pathname = '/verifier/v/abc'
    renderNav()
    expect(screen.getByRole('link', { name: 'Demander' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Accueil' })).not.toHaveAttribute('aria-current')
  })

  it('opens the Explorer sheet from the Explorer tab and closes it on a second tap', () => {
    renderNav()
    const explore = screen.getByRole('button', { name: 'Explorer' })
    fireEvent.click(explore)
    expect(explore).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog', { name: 'Explorer' })).toBeInTheDocument()

    fireEvent.click(explore)
    expect(explore).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens the Menu sheet from the Menu button', () => {
    renderNav()
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu' }))
    expect(screen.getByRole('dialog', { name: 'Menu de navigation' })).toBeInTheDocument()
  })

  // The install entry lives in the Menu sheet: a dot points at it until it is opened once.
  it('shows the install dot on Menu until the menu has been opened', () => {
    const { unmount } = renderNav()
    expect(screen.getByTestId('menu-install-dot')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu' }))
    expect(window.localStorage.getItem(MENU_SEEN_STORAGE_KEY)).toBe('1')
    expect(screen.queryByTestId('menu-install-dot')).not.toBeInTheDocument()
    unmount()

    renderNav()
    expect(screen.queryByTestId('menu-install-dot')).not.toBeInTheDocument()
  })

  it('shows no install dot inside the installed web app', () => {
    mockMatchMedia(true)
    renderNav()
    expect(screen.queryByTestId('menu-install-dot')).not.toBeInTheDocument()
  })

  it('renders nothing on embed pages', () => {
    pathname = '/embed/votes/1'
    renderNav()
    expect(screen.queryByRole('navigation', { name: 'Navigation principale' })).not.toBeInTheDocument()
  })
})
