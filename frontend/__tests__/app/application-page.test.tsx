import { act, fireEvent, render, screen } from '@testing-library/react'
import { TextDecoder, TextEncoder } from 'node:util'

import ApplicationPage from '@/app/application/page'
import { InstallActions } from '@/app/application/InstallActions'
import { INSTALL_PROMPT_CAPTURE_SCRIPT } from '@/lib/installState'

const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'

function setDevice({ ua = ANDROID, touch = 5, standalone = false } = {}) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
  Object.defineProperty(navigator, 'maxTouchPoints', { value: touch, configurable: true })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: standalone && query === '(display-mode: standalone)',
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })),
  })
}

function firePrompt(outcome: 'accepted' | 'dismissed') {
  const event = Object.assign(new Event('beforeinstallprompt'), {
    prompt: jest.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome }),
  })
  act(() => {
    window.dispatchEvent(event)
  })
  return event
}

beforeAll(() => {
  new Function(INSTALL_PROMPT_CAPTURE_SCRIPT)()
})

beforeEach(() => {
  setDevice()
  act(() => {
    window.dispatchEvent(new Event('appinstalled')) // clears any prompt left by a previous test
  })
})

describe('/application page (#595)', () => {
  it('server-renders one h1 and the menu instructions, whatever the device', () => {
    // react-dom/server needs TextEncoder, which jsdom does not provide.
    Object.assign(globalThis, { TextEncoder, TextDecoder })
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { renderToString } = require('react-dom/server') as typeof import('react-dom/server')
    setDevice({ ua: ANDROID })
    const android = renderToString(<ApplicationPage />)
    setDevice({ ua: IPHONE })
    const iphone = renderToString(<ApplicationPage />)
    setDevice({ standalone: true })
    const installed = renderToString(<ApplicationPage />)

    expect(iphone).toBe(android)
    expect(installed).toBe(android)
    expect(android.match(/<h1[\s>]/g)).toHaveLength(1)
    expect(android).toContain('data-install-situation="manual"')
    expect(android).toContain('Chrome sur Android')
  })

  it('offers the install window when the browser provides one', async () => {
    const event = firePrompt('accepted')
    render(<InstallActions />)

    fireEvent.click(screen.getByRole('button', { name: 'Installer MonÉlu' }))
    expect(await screen.findByText(/MonÉlu est installé/)).toBeInTheDocument()
    expect(event.prompt).toHaveBeenCalledTimes(1)
  })

  it('keeps "Continuer sur le site" after the visitor cancels', async () => {
    firePrompt('dismissed')
    render(<InstallActions />)
    expect(screen.getByRole('link', { name: /Continuer sur le site/ })).toHaveAttribute('href', '/')

    fireEvent.click(screen.getByRole('button', { name: 'Installer MonÉlu' }))
    expect(await screen.findByText(/Installation annulée/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Continuer sur le site/ })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('button', { name: 'Installer MonÉlu' })).not.toBeInTheDocument()
  })

  it('shows menu instructions when no prompt is available', () => {
    render(<InstallActions />)
    expect(screen.getByText(/Installez MonÉlu depuis le menu/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('links to Mon député inside the installed web app', () => {
    setDevice({ standalone: true })
    render(<InstallActions />)
    expect(screen.getByRole('link', { name: 'Accéder à mon député' })).toHaveAttribute('href', '/mon-depute')
  })

  it('announces the iPhone app on iPhone and on an iPad presenting itself as a Mac', () => {
    setDevice({ ua: IPHONE })
    const { unmount } = render(<InstallActions />)
    expect(screen.getByText(/L'application iPhone arrive bientôt/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Continuer sur le site' })).toHaveAttribute('href', '/')
    unmount()

    setDevice({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', touch: 5 })
    firePrompt('accepted')
    render(<InstallActions />)
    expect(screen.getByText(/L'application iPhone arrive bientôt/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
