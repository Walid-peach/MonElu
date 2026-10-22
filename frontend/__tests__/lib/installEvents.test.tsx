import { act, fireEvent, render, screen } from '@testing-library/react'

import { InstallActions } from '@/app/application/InstallActions'
import { AppStoreBadge } from '@/components/AppStoreBadge'
import { InstallEventsReporter } from '@/components/InstallEventsReporter'
import { PhoneAppSectionClient } from '@/components/home/PhoneAppSectionClient'
import { API_BASE } from '@/lib/api'
import { recordInstallEvent, recordStandaloneVisitOnce } from '@/lib/installEvents'
import { INSTALL_PROMPT_CAPTURE_SCRIPT } from '@/lib/installState'

const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'

let fetchMock: jest.Mock

function setDevice({ standalone = false } = {}) {
  Object.defineProperty(navigator, 'userAgent', { value: ANDROID, configurable: true })
  Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true })
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

/** The events sent so far, in order. */
function sentEvents(): string[] {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).event)
}

beforeAll(() => {
  new Function(INSTALL_PROMPT_CAPTURE_SCRIPT)()
})

beforeEach(() => {
  fetchMock = jest.fn().mockResolvedValue({ ok: true })
  global.fetch = fetchMock
  window.sessionStorage.clear()
  setDevice()
})

describe('recordInstallEvent (#598)', () => {
  it('posts only the event name to the API, surviving navigation', () => {
    recordInstallEvent('menu_entry_tap')
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/install-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'menu_entry_tap' }),
      keepalive: true,
    })
  })

  it('never throws, even when the request fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    expect(() => recordInstallEvent('app_installed')).not.toThrow()
    await Promise.resolve()
  })

  it('counts a standalone visit once per session', () => {
    recordStandaloneVisitOnce()
    recordStandaloneVisitOnce()
    expect(sentEvents()).toEqual(['standalone_visit'])
  })
})

describe('where each event is sent', () => {
  it('homepage section links send install_section_tap', () => {
    render(<PhoneAppSectionClient qrSvg="<svg></svg>" />)
    fireEvent.click(screen.getByRole('link', { name: 'Installer MonÉlu' }))
    fireEvent.click(screen.getByRole('link', { name: /\/application$/ }))
    expect(sentEvents()).toEqual(['install_section_tap', 'install_section_tap'])
  })

  it('the App Store badge sends app_store_badge_tap', () => {
    render(<AppStoreBadge id="6740000000" />)
    fireEvent.click(screen.getByRole('link'))
    expect(sentEvents()).toEqual(['app_store_badge_tap'])
  })

  it.each([
    ['accepted', 'install_prompt_accepted'],
    ['dismissed', 'install_prompt_dismissed'],
  ] as const)('the install window answered %s sends shown, then %s', async (outcome, event) => {
    act(() => {
      window.dispatchEvent(
        Object.assign(new Event('beforeinstallprompt'), {
          prompt: jest.fn().mockResolvedValue(undefined),
          userChoice: Promise.resolve({ outcome }),
        }),
      )
    })
    render(<InstallActions />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Installer MonÉlu' }))
    })
    expect(sentEvents()).toEqual(['install_prompt_shown', event])
  })

  it('the site-wide reporter counts appinstalled and standalone sessions', () => {
    setDevice({ standalone: true })
    render(<InstallEventsReporter />)
    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })
    expect(sentEvents()).toEqual(['standalone_visit', 'app_installed'])
  })

  it('sends nothing in a normal browser tab with no action', () => {
    render(<InstallEventsReporter />)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
