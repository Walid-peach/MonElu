import { act, fireEvent, render, screen } from '@testing-library/react'

import { InstallActions } from '@/app/application/InstallActions'
import { AppStoreBadge } from '@/components/AppStoreBadge'
import { InstallEventsReporter } from '@/components/InstallEventsReporter'
import { PhoneAppSectionClient } from '@/components/home/PhoneAppSectionClient'
import { API_BASE } from '@/lib/api'
import { currentPlatform, recordInstallEvent, recordStandaloneVisitOnce } from '@/lib/installEvents'
import { INSTALL_PROMPT_CAPTURE_SCRIPT } from '@/lib/installState'

const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'

let fetchMock: jest.Mock

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36'

function setDevice({ standalone = false, ua = ANDROID, touch = 5 } = {}) {
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
  act(() => {
    window.dispatchEvent(new Event('appinstalled')) // drops any prompt a previous test left
  })
  fetchMock.mockClear()
})

describe('recordInstallEvent (#598)', () => {
  it('posts only the event name and a coarse platform, surviving navigation', () => {
    recordInstallEvent('menu_entry_tap')
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/install-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'menu_entry_tap', platform: 'android' }),
      keepalive: true,
    })
  })

  it('tells Android apart from iPhone, an iPad posing as a Mac, and desktop', () => {
    expect(currentPlatform()).toBe('android')
    setDevice({ ua: IPHONE })
    expect(currentPlatform()).toBe('ios')
    setDevice({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', touch: 5 })
    expect(currentPlatform()).toBe('ios')
    setDevice({ ua: DESKTOP, touch: 0 })
    expect(currentPlatform()).toBe('other')
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

  it('counts the install window as shown as soon as it opens, before any answer', async () => {
    let answer: (v: { outcome: 'accepted' | 'dismissed' }) => void = () => {}
    act(() => {
      window.dispatchEvent(
        Object.assign(new Event('beforeinstallprompt'), {
          prompt: jest.fn().mockResolvedValue(undefined),
          userChoice: new Promise<{ outcome: 'accepted' | 'dismissed' }>((resolve) => { answer = resolve }),
        }),
      )
    })
    render(<InstallActions />)
    fireEvent.click(screen.getByRole('button', { name: 'Installer MonÉlu' }))
    expect(sentEvents()).toEqual(['install_prompt_shown'])
    await act(async () => answer({ outcome: 'accepted' }))
    expect(sentEvents()).toEqual(['install_prompt_shown', 'install_prompt_accepted'])
  })

  it('counts a browser install offer once per session, even one that came before mount', () => {
    act(() => {
      window.dispatchEvent(
        Object.assign(new Event('beforeinstallprompt'), {
          prompt: jest.fn(),
          userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
        }),
      )
    })
    render(<InstallEventsReporter />)
    act(() => {
      window.dispatchEvent(
        Object.assign(new Event('beforeinstallprompt'), {
          prompt: jest.fn(),
          userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
        }),
      )
    })
    expect(sentEvents()).toEqual(['install_prompt_available'])
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
