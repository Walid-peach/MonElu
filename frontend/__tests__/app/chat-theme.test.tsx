/**
 * MON-168: the chat page kept its own dark-mode flag on a private
 * `monelu-dark` localStorage key, so the site-wide toggle in the nav darkened
 * the chrome and left the whole conversation panel white. These tests lock the
 * page onto the shared ThemeProvider so the two systems cannot diverge again.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { fireEvent, render, screen } from '@testing-library/react'

import { ChatClient } from '@/app/chat/ChatClient'
import { ThemeProvider } from '@/components/ThemeProvider'
import { THEME_STORAGE_KEY } from '@/lib/theme'

jest.mock('@/lib/api', () => ({
  api: {
    search: jest.fn(),
    verify: jest.fn(),
    feedback: { chat: jest.fn() },
    shareAnswer: jest.fn(),
  },
}))

const CHAT_CLIENT = join(process.cwd(), 'src/app/chat/ChatClient.tsx')

// The chat panel's outermost element carries the page background, which is the
// single value that was wrong in the reported bug.
function panelBackground(container: HTMLElement): string {
  const root = container.firstElementChild as HTMLElement
  return root.style.background
}

describe('chat page theme', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('has no private dark-mode storage key left in the source', () => {
    // The quotes matter: the file still *mentions* the retired key in the
    // comment explaining why it is gone. Only a string literal is a real use.
    expect(readFileSync(CHAT_CLIENT, 'utf8')).not.toContain("'monelu-dark'")
  })

  it('renders the dark surface when the stored site theme is dark', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    const { container } = render(
      <ThemeProvider>
        <ChatClient />
      </ThemeProvider>,
    )
    expect(panelBackground(container)).toBe('rgb(11, 21, 37)')
  })

  it('renders the light surface when the stored site theme is light', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light')
    const { container } = render(
      <ThemeProvider>
        <ChatClient />
      </ThemeProvider>,
    )
    expect(panelBackground(container)).toBe('rgb(255, 255, 255)')
  })

  it("writes the shared theme key when the page's own toggle is used", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light')
    const { container } = render(
      <ThemeProvider>
        <ChatClient />
      </ThemeProvider>,
    )

    fireEvent.click(screen.getByTitle('Mode sombre'))

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(panelBackground(container)).toBe('rgb(11, 21, 37)')
  })
})
