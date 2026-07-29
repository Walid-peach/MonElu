import { fireEvent, render, screen } from '@testing-library/react'

import { MobileMenu } from '@/components/MobileMenu'
import { ThemeProvider } from '@/components/ThemeProvider'

let pathname = '/'
jest.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))

jest.mock('@/lib/api', () => ({
  api: { deputies: { get: jest.fn() } },
}))

function renderMenu(open: boolean, onClose = jest.fn()) {
  return render(
    <ThemeProvider>
      <MobileMenu open={open} onClose={onClose} />
    </ThemeProvider>
  )
}

beforeEach(() => {
  pathname = '/'
  window.localStorage.clear()
  document.body.style.overflow = ''
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

describe('MobileMenu', () => {
  it('is hidden from assistive tech when closed', () => {
    renderMenu(false)
    expect(screen.getByRole('dialog', { hidden: true })).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('dialog', { hidden: true }).parentElement).toHaveAttribute('aria-hidden', 'true')
  })

  it('locks and restores body scroll while open', () => {
    const { rerender } = renderMenu(false)
    expect(document.body.style.overflow).toBe('')

    rerender(
      <ThemeProvider>
        <MobileMenu open onClose={jest.fn()} />
      </ThemeProvider>
    )
    expect(document.body.style.overflow).toBe('hidden')

    rerender(
      <ThemeProvider>
        <MobileMenu open={false} onClose={jest.fn()} />
      </ThemeProvider>
    )
    expect(document.body.style.overflow).toBe('')
  })

  it('calls onClose on Escape while open', () => {
    const onClose = jest.fn()
    renderMenu(true, onClose)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = jest.fn()
    renderMenu(true, onClose)

    const dialog = screen.getByRole('dialog')
    // The backdrop is the dialog's previous sibling inside the fixed wrapper.
    const backdrop = dialog.parentElement?.firstElementChild as HTMLElement
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when an entry is clicked, closing the sheet before navigation', () => {
    const onClose = jest.fn()
    renderMenu(true, onClose)

    fireEvent.click(screen.getByRole('link', { name: /députés/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('traps Tab focus inside the dialog', () => {
    renderMenu(true)
    const dialog = screen.getByRole('dialog')
    const focusable = dialog.querySelectorAll('a[href], button:not([disabled])')
    const first = focusable[0] as HTMLElement
    const last = focusable[focusable.length - 1] as HTMLElement

    last.focus()
    expect(document.activeElement).toBe(last)
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    first.focus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })
})
