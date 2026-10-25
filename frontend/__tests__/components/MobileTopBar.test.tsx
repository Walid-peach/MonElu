import { act, fireEvent, render, screen, within } from '@testing-library/react'

import { MobileTopBar, HOME_BAR_SCROLL_Y } from '@/components/MobileTopBar'
import { ThemeProvider } from '@/components/ThemeProvider'
import { PRIMARY_ENTRIES } from '@/components/nav/MobileDrawer'
import { INSTALLED_FLAG_SCRIPT } from '@/lib/installState'
import { openMobileMenu } from '@/lib/mobileMenu'

let pathname = '/'
jest.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: jest.fn() }),
}))

const getDeputy = jest.fn()
jest.mock('@/lib/api', () => ({
  api: { deputies: { get: (...args: unknown[]) => getDeputy(...args) } },
  API_BASE: 'http://api.test',
}))

let followedId: string | null = null
jest.mock('@/lib/mon-depute', () => ({
  getFollowedDeputyId: () => followedId,
}))

const openGlobalSearch = jest.fn()
jest.mock('@/components/GlobalSearch', () => ({
  openGlobalSearch: () => openGlobalSearch(),
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

function renderBar() {
  return render(
    <ThemeProvider>
      <MobileTopBar />
    </ThemeProvider>
  )
}

function scrollTo(y: number) {
  act(() => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
    window.dispatchEvent(new Event('scroll'))
  })
}

const bar = (container: HTMLElement) => container.querySelector('[data-mobile-top-bar]') as HTMLElement
const drawer = () => screen.getByRole('dialog', { name: 'Menu', hidden: true })

beforeEach(() => {
  pathname = '/'
  followedId = null
  getDeputy.mockReset()
  openGlobalSearch.mockReset()
  window.localStorage.clear()
  document.body.style.overflow = ''
  mockMatchMedia(false)
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
  global.fetch = jest.fn().mockResolvedValue({ ok: true })
})

describe('MobileTopBar', () => {
  it('stays hidden on the homepage until the hero has scrolled past', () => {
    const { container } = renderBar()
    expect(bar(container).className).toContain('invisible')
    expect(bar(container)).toHaveAttribute('aria-hidden', 'true')

    scrollTo(HOME_BAR_SCROLL_Y + 1)
    expect(bar(container).className).not.toContain('invisible')
    expect(bar(container)).toHaveAttribute('aria-hidden', 'false')

    scrollTo(0)
    expect(bar(container).className).toContain('invisible')
  })

  it('is always there on the other pages, in the flow of the page', () => {
    pathname = '/deputes'
    const { container } = renderBar()
    expect(bar(container).className).toContain('sticky')
    expect(bar(container).className).not.toContain('invisible')
  })

  // The installed web app keeps BottomNav; the bar must never share its screen.
  it('belongs to phones in the browser only', () => {
    pathname = '/deputes'
    const { container } = renderBar()
    expect(bar(container).className).toMatch(/\bmd:hidden\b/)
    expect(bar(container).className).toMatch(/\binstalled:hidden\b/)
  })

  it('renders nothing on embed pages', () => {
    pathname = '/embed/votes/1'
    const { container } = renderBar()
    expect(bar(container)).toBeNull()
  })

  it('opens search and offers the install page', () => {
    pathname = '/votes'
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: /Rechercher/ }))
    expect(openGlobalSearch).toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Installer' })).toHaveAttribute('href', '/application')
  })
})

describe('MobileDrawer', () => {
  it('opens from ☰ and closes on Escape', () => {
    pathname = '/deputes'
    renderBar()
    expect(drawer().parentElement).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu' }))
    expect(drawer().parentElement).toHaveAttribute('aria-hidden', 'false')
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(drawer().parentElement).toHaveAttribute('aria-hidden', 'true')
  })

  // The homepage hero has its own ☰, which opens the same drawer.
  it('opens from anywhere through openMobileMenu()', () => {
    renderBar()
    act(() => openMobileMenu())
    expect(drawer().parentElement).toHaveAttribute('aria-hidden', 'false')
  })

  it('lists the six main places and marks the current one', () => {
    pathname = '/votes/VTANR5L17V1'
    renderBar()
    act(() => openMobileMenu())
    const menu = within(drawer())
    for (const { href, label } of PRIMARY_ENTRIES) {
      expect(menu.getByRole('link', { name: new RegExp(`^${label}`) })).toHaveAttribute('href', href)
    }
    expect(menu.getByRole('link', { name: /^Votes/ })).toHaveAttribute('aria-current', 'page')
    expect(menu.getByRole('link', { name: /^Accueil/ })).not.toHaveAttribute('aria-current')
  })

  it("names the followed deputy, once the drawer opens", async () => {
    followedId = 'PA1'
    getDeputy.mockResolvedValue({ full_name: 'Marie Exemple' })
    renderBar()
    expect(getDeputy).not.toHaveBeenCalled()
    await act(async () => openMobileMenu())
    expect(within(drawer()).getByRole('link', { name: /Mon député/ })).toHaveTextContent('Marie Exemple')
  })

  it('counts a tap on the install card, and has none inside the installed app', () => {
    const fetchMock = global.fetch as jest.Mock
    const { unmount } = renderBar()
    act(() => openMobileMenu())
    fireEvent.click(within(drawer()).getByRole('link', { name: /Installer l'application/ }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ event: 'menu_entry_tap' })
    unmount()

    mockMatchMedia(true)
    renderBar()
    act(() => openMobileMenu())
    expect(within(drawer()).queryByRole('link', { name: /Installer l'application/ })).not.toBeInTheDocument()
  })
})

describe('INSTALLED_FLAG_SCRIPT', () => {
  afterEach(() => document.documentElement.removeAttribute('data-installed'))

  it('marks <html> inside the installed app only', () => {
    new Function(INSTALLED_FLAG_SCRIPT)()
    expect(document.documentElement.hasAttribute('data-installed')).toBe(false)

    mockMatchMedia(true)
    new Function(INSTALLED_FLAG_SCRIPT)()
    expect(document.documentElement.hasAttribute('data-installed')).toBe(true)
  })
})
