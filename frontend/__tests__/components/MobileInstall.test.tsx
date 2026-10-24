import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { MobileInstall } from '@/components/home/MobileInstall'
import { INSTALL_PROMPT_CAPTURE_SCRIPT } from '@/lib/installState'

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

function sentEvents(fetchMock: jest.Mock): string[] {
  return fetchMock.mock.calls.map(call => JSON.parse(call[1].body).event)
}

let fetchMock: jest.Mock

beforeAll(() => {
  new Function(INSTALL_PROMPT_CAPTURE_SCRIPT)()
})

beforeEach(() => {
  act(() => {
    window.dispatchEvent(new Event('appinstalled')) // clears any prompt left by a previous test
  })
  fetchMock = jest.fn().mockResolvedValue({ ok: true })
  global.fetch = fetchMock
})

const install = () => screen.getByRole('button', { name: "Installer l'application" })

describe('MobileInstall on Android', () => {
  it('shows how to install from the menu when Chrome offered no install window', () => {
    render(<MobileInstall ios={false} appStoreId={null} />)
    expect(install()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('list', { name: 'Comment installer MonÉlu' })).not.toBeInTheDocument()

    fireEvent.click(install())
    expect(install()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('list', { name: 'Comment installer MonÉlu' })).toHaveTextContent('menu ⋮ de Chrome')
    expect(screen.getByRole('link', { name: /Toute l'aide/ })).toHaveAttribute('href', '/application')
    expect(sentEvents(fetchMock)).toEqual(['install_section_tap'])
  })

  it("opens Chrome's install window when it offered one, and confirms once installed", async () => {
    render(<MobileInstall ios={false} appStoreId={null} />)
    const event = firePrompt('accepted')

    fireEvent.click(install())
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('MonÉlu est installé'))
    expect(event.prompt).toHaveBeenCalled()
    expect(sentEvents(fetchMock)).toEqual(['install_section_tap', 'install_prompt_shown', 'install_prompt_accepted'])
  })

  it('falls back to the menu steps when the visitor closes the install window', async () => {
    render(<MobileInstall ios={false} appStoreId={null} />)
    firePrompt('dismissed')

    fireEvent.click(install())
    await waitFor(() => expect(screen.getByRole('list', { name: 'Comment installer MonÉlu' })).toBeInTheDocument())
    expect(sentEvents(fetchMock)).toContain('install_prompt_dismissed')
  })
})

describe('MobileInstall on iPhone', () => {
  it('offers the App Store badge once the app has an ID', () => {
    render(<MobileInstall ios appStoreId="6740000000" />)
    expect(screen.getByRole('img', { name: "Télécharger dans l'App Store" }).closest('a')).toHaveAttribute(
      'href',
      'https://apps.apple.com/app/id6740000000',
    )
    expect(screen.queryByRole('button', { name: "Installer l'application" })).not.toBeInTheDocument()
  })

  it('says the app is coming until then, with nothing to install', () => {
    render(<MobileInstall ios appStoreId={null} />)
    expect(screen.getByText(/l'app native arrive bientôt sur l'App Store/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: "Installer l'application" })).not.toBeInTheDocument()
  })
})
