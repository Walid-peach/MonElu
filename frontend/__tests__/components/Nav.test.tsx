import { fireEvent, render, screen } from '@testing-library/react'

import { Nav } from '@/components/Nav'
import { ThemeProvider } from '@/components/ThemeProvider'

let pathname = '/'
jest.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))

jest.mock('@/lib/api', () => ({
  api: { deputies: { get: jest.fn() } },
}))

function renderNav() {
  return render(
    <ThemeProvider>
      <Nav />
    </ThemeProvider>
  )
}

beforeEach(() => {
  pathname = '/'
  window.localStorage.clear()
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

function explorerTrigger() {
  return screen.getByRole('button', { name: /explorer/i })
}

function aproposTrigger() {
  return screen.getByRole('button', { name: /à propos/i })
}

describe('Nav', () => {
  it('opens the Explorer menu on click and marks it expanded', () => {
    renderNav()
    const trigger = explorerTrigger()

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    const deputiesLink = screen.getByRole('link', { name: /députés/i })
    expect(deputiesLink).not.toHaveAttribute('tabindex', '-1')
  })

  it('keeps the panel open when the trigger is clicked again only if reopened', () => {
    renderNav()
    const trigger = explorerTrigger()

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('only keeps one menu open at a time', () => {
    renderNav()
    fireEvent.click(explorerTrigger())
    expect(explorerTrigger()).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(aproposTrigger())
    expect(aproposTrigger()).toHaveAttribute('aria-expanded', 'true')
    expect(explorerTrigger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the open menu on Escape', () => {
    renderNav()
    fireEvent.click(explorerTrigger())
    expect(explorerTrigger()).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(explorerTrigger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the open menu on an outside click', () => {
    renderNav()
    fireEvent.click(explorerTrigger())
    expect(explorerTrigger()).toHaveAttribute('aria-expanded', 'true')

    fireEvent.mouseDown(document.body)
    expect(explorerTrigger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the open menu when a panel entry is clicked', () => {
    renderNav()
    fireEvent.click(explorerTrigger())
    fireEvent.click(screen.getByRole('link', { name: /députés/i }))

    expect(explorerTrigger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes an open menu when a flat top link (Quiz/Chat IA) is clicked', () => {
    renderNav()
    fireEvent.click(explorerTrigger())
    expect(explorerTrigger()).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByRole('link', { name: /^quiz$/i }))

    expect(explorerTrigger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('dispatches the open-search event when Rechercher is clicked, and closes the menu', () => {
    renderNav()
    const onOpenSearch = jest.fn()
    window.addEventListener('monelu:open-search', onOpenSearch)

    fireEvent.click(explorerTrigger())
    fireEvent.click(screen.getByRole('button', { name: /rechercher/i }))

    expect(onOpenSearch).toHaveBeenCalledTimes(1)
    expect(explorerTrigger()).toHaveAttribute('aria-expanded', 'false')

    window.removeEventListener('monelu:open-search', onOpenSearch)
  })

  it('renders no chrome on /embed pages', () => {
    pathname = '/embed/votes/123'
    const { container } = renderNav()
    expect(container).toBeEmptyDOMElement()
  })
})
