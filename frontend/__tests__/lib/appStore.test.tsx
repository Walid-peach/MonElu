import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'

import { InstallActions } from '@/app/application/InstallActions'
import { PhoneAppSectionClient } from '@/components/home/PhoneAppSectionClient'
import { APP_STORE_BADGE_SRC, appStoreUrl, parseAppStoreId, smartAppBannerMetadata } from '@/lib/appStore'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'

function setDevice(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
  Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })),
  })
}

/** Runs `body` as if the site had been built with this App Store ID. */
function withAppStoreId(id: string | undefined, body: () => void) {
  const previous = process.env.NEXT_PUBLIC_IOS_APP_STORE_ID
  if (id === undefined) delete process.env.NEXT_PUBLIC_IOS_APP_STORE_ID
  else process.env.NEXT_PUBLIC_IOS_APP_STORE_ID = id
  try {
    body()
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_IOS_APP_STORE_ID
    else process.env.NEXT_PUBLIC_IOS_APP_STORE_ID = previous
  }
}

describe('App Store ID (#597)', () => {
  it('accepts only a numeric ID', () => {
    expect(parseAppStoreId('6740000000')).toBe('6740000000')
    expect(parseAppStoreId(' 6740000000 ')).toBe('6740000000')
    expect(parseAppStoreId(undefined)).toBeNull()
    expect(parseAppStoreId('')).toBeNull()
    expect(parseAppStoreId('id6740000000')).toBeNull()
  })

  it('links to the App Store product page', () => {
    expect(appStoreUrl('6740000000')).toBe('https://apps.apple.com/app/id6740000000')
  })
})

describe('iPhone visitors', () => {
  beforeEach(() => setDevice(IPHONE))

  it('keep the "arrive bientôt" message while the ID is unset', () => {
    withAppStoreId(undefined, () => {
      render(
        <>
          <InstallActions />
          <PhoneAppSectionClient qrSvg="<svg></svg>" />
        </>,
      )
    })
    expect(screen.getAllByText(/L'application iPhone arrive bientôt/)).toHaveLength(2)
    expect(screen.queryByRole('img', { name: "Télécharger dans l'App Store" })).not.toBeInTheDocument()
  })

  it('get the App Store badge on /application and the homepage once it is set', () => {
    withAppStoreId('6740000000', () => {
      render(
        <>
          <InstallActions />
          <PhoneAppSectionClient qrSvg="<svg></svg>" />
        </>,
      )
    })
    const badges = screen.getAllByRole('img', { name: "Télécharger dans l'App Store" })
    expect(badges).toHaveLength(2)
    for (const badge of badges) {
      expect(badge).toHaveAttribute('src', APP_STORE_BADGE_SRC)
      expect(badge.closest('a')).toHaveAttribute('href', 'https://apps.apple.com/app/id6740000000')
    }
    expect(screen.queryByText(/arrive bientôt/)).not.toBeInTheDocument()
    // The app targets iPhone only (ios/Project.swift), so the copy says so.
    expect(screen.getAllByText("L'application MonÉlu est disponible sur iPhone.")).toHaveLength(2)
  })
})

it('leaves Android untouched when the ID is set', () => {
  setDevice(ANDROID)
  withAppStoreId('6740000000', () => {
    render(<PhoneAppSectionClient qrSvg="<svg></svg>" />)
  })
  expect(screen.getByRole('link', { name: 'Installer MonÉlu' })).toHaveAttribute('href', '/application')
  expect(screen.queryByRole('img', { name: "Télécharger dans l'App Store" })).not.toBeInTheDocument()
})

describe('build guard (scripts/app-store-badge-guard.mjs)', () => {
  const guard = join(__dirname, '..', '..', 'scripts', 'app-store-badge-guard.mjs')

  function runGuard(id: string | undefined, withBadge: boolean): string {
    const publicDir = mkdtempSync(join(tmpdir(), 'monelu-public-'))
    if (withBadge) {
      mkdirSync(join(publicDir, 'badges'))
      writeFileSync(join(publicDir, 'badges', 'app-store-fr-black.svg'), '<svg/>')
    }
    const script =
      `import { assertAppStoreBadge } from ${JSON.stringify(guard)};` +
      `try { assertAppStoreBadge(${JSON.stringify(id === undefined ? {} : { NEXT_PUBLIC_IOS_APP_STORE_ID: id })}, ${JSON.stringify(publicDir)}); console.log('ok') }` +
      `catch (e) { console.log('error: ' + e.message) }`
    return execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' }).trim()
  }

  it('passes while the ID is unset, with or without the badge file', () => {
    expect(runGuard(undefined, false)).toBe('ok')
    expect(runGuard('', false)).toBe('ok')
  })

  it('fails a build that has the ID but not the badge file', () => {
    expect(runGuard('6740000000', false)).toMatch(/^error: .*public\/badges\/app-store-fr-black\.svg is missing/)
  })

  it('fails a build with a malformed ID', () => {
    expect(runGuard('id6740000000', true)).toMatch(/^error: .*numeric App Store ID/)
  })

  it('passes once the ID and the badge file are both there', () => {
    expect(runGuard('6740000000', true)).toBe('ok')
  })

  it('points at the same file the site renders', () => {
    expect(`/${require('node:fs').readFileSync(guard, 'utf8').match(/APP_STORE_BADGE_FILE = '([^']+)'/)[1]}`).toBe(
      APP_STORE_BADGE_SRC,
    )
  })
})

describe('Smart App Banner', () => {
  it('is declared only when the ID is set', () => {
    withAppStoreId(undefined, () => expect(smartAppBannerMetadata()).toEqual({}))
    withAppStoreId('6740000000', () =>
      expect(smartAppBannerMetadata()).toEqual({ itunes: { appId: '6740000000' } }),
    )
  })

  it('is spread into the root layout metadata', () => {
    const layout = require('node:fs').readFileSync(join(__dirname, '..', '..', 'src', 'app', 'layout.tsx'), 'utf8')
    expect(layout).toMatch(/export const metadata: Metadata = \{[\s\S]*\.\.\.smartAppBannerMetadata\(\),[\s\S]*\n\}/)
  })
})

describe("Apple's badge artwork", () => {
  const FRONTEND = join(__dirname, '..', '..')
  const svg = readFileSync(join(FRONTEND, 'public', APP_STORE_BADGE_SRC), 'utf8')

  // Apple's own French black badge, unmodified (App Store marketing guidelines).
  it('is the French black "Télécharger dans l\'App Store" badge from Apple', () => {
    expect(svg).toContain('<title>Download_on_the_App_Store_Badge_FR_RGB_blk_')
    expect(svg).toMatch(/viewBox="0 0 [\d.]+ 40"/)
  })

  it('is a plain vector with nothing executable or external', () => {
    expect(svg).not.toMatch(/<script|<style|url\(|javascript:|href=|<image|<foreignObject|\son[a-z]+=/i)
  })

  // Only iPhone visitors see it, and only after the release.
  it('stays out of the service worker precache', () => {
    const config = readFileSync(join(FRONTEND, 'next.config.mjs'), 'utf8')
    expect(config).toMatch(/publicExcludes:\s*\[[^\]]*'!badges\/\*\*\/\*'/)
  })
})
