import { TextDecoder, TextEncoder } from 'node:util'
import { render, screen } from '@testing-library/react'
import QRCode from 'qrcode'

import { APPLICATION_URL, PhoneAppSection } from '@/components/home/PhoneAppSection'
import { PhoneAppSectionClient } from '@/components/home/PhoneAppSectionClient'
import { SITE_URL } from '@/lib/site'

const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
const IPADOS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'

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

beforeEach(() => setDevice())

describe('PhoneAppSection (#596)', () => {
  it('encodes /application on the site origin in its QR code', async () => {
    // qrcode needs TextEncoder, which jsdom does not provide (the server has it).
    Object.assign(globalThis, { TextEncoder, TextDecoder })
    expect(APPLICATION_URL).toBe(`${SITE_URL}/application`)
    const expected = await QRCode.toString(APPLICATION_URL, {
      type: 'svg',
      margin: 2,
      width: 128,
      color: { dark: '#0D1F3C', light: '#FFFFFF' },
    })
    const element = await PhoneAppSection()
    expect(element.props.qrSvg).toBe(expected)
    expect(element.props.qrSvg).toMatch(/^<svg/)
  })

  it('offers the install link on phones and the QR code on computers, chosen by CSS', () => {
    const { container } = render(<PhoneAppSectionClient qrSvg="<svg></svg>" />)

    expect(screen.getByRole('heading', { level: 2, name: 'MonÉlu sur votre téléphone' })).toBeInTheDocument()
    const phone = container.querySelector('[data-phone-app="phone"]')!
    const computer = container.querySelector('[data-phone-app="computer"]')!
    expect(phone.className).toContain('md:hidden')
    expect(computer.className).toMatch(/\bhidden\b.*\bmd:flex\b/)
    expect(screen.getByRole('link', { name: 'Installer MonÉlu' })).toHaveAttribute('href', '/application')
    expect(screen.getByText('Scannez pour retrouver MonÉlu sur votre téléphone.')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /QR code/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /\/application$/ })).toHaveAttribute('href', '/application')
  })

  it.each([
    ['iPhone', IPHONE, 5],
    ['an iPad presenting itself as a Mac', IPADOS, 5],
  ])('announces the iPhone app on %s, with no install link or QR code', (_label, ua, touch) => {
    setDevice({ ua, touch })
    render(<PhoneAppSectionClient qrSvg="<svg></svg>" />)
    expect(screen.getByText(/L'application iPhone arrive bientôt/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Continuer sur le site/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Installer MonÉlu' })).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /QR code/ })).not.toBeInTheDocument()
  })

  it('is hidden inside the installed web app', () => {
    setDevice({ standalone: true })
    const { container } = render(<PhoneAppSectionClient qrSvg="<svg></svg>" />)
    expect(container).toBeEmptyDOMElement()
  })
})
