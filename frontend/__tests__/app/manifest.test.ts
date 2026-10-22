import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const PUBLIC = join(__dirname, '..', '..', 'public')
const APP = join(__dirname, '..', '..', 'src', 'app')

type Screenshot = { src: string; sizes: string; type: string; form_factor?: string; label?: string }
const manifest = JSON.parse(readFileSync(join(PUBLIC, 'manifest.json'), 'utf8')) as {
  id: string
  start_url: string
  scope: string
  description: string
  screenshots: Screenshot[]
}

/** Width and height from a WebP header (lossy VP8, lossless VP8L or extended VP8X). */
function webpSize(buf: Buffer): [number, number] {
  expect(buf.toString('ascii', 0, 4)).toBe('RIFF')
  expect(buf.toString('ascii', 8, 12)).toBe('WEBP')
  const chunk = buf.toString('ascii', 12, 16)
  if (chunk === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff]
  if (chunk === 'VP8L') {
    const bits = buf.readUInt32LE(21)
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1]
  }
  if (chunk === 'VP8X') return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1]
  throw new Error(`unknown WebP chunk ${chunk}`)
}

describe('web app manifest (#594)', () => {
  // The id is the installed app's identity: changing it would make every
  // existing install a different app instead of picking up the new start_url.
  it('keeps the installed app identity', () => {
    expect(manifest.id).toBe('/')
    expect(manifest.scope).toBe('/')
  })

  it('opens the installed app on Mon député', () => {
    expect(manifest.start_url).toBe('/mon-depute')
    expect(existsSync(join(APP, 'mon-depute', 'page.tsx'))).toBe(true)
  })

  it('has a description for the install sheet', () => {
    expect(manifest.description.trim().length).toBeGreaterThan(20)
  })

  // Chrome on Android shows its richer install sheet only with narrow
  // screenshots it accepts: 320-3840 px per side, the long side at most 2.3x
  // the short one, one aspect ratio per form factor.
  it('ships narrow screenshots Chrome accepts', () => {
    const narrow = manifest.screenshots.filter((s) => s.form_factor === 'narrow')
    expect(narrow.length).toBeGreaterThanOrEqual(1)
    expect(narrow.length).toBeLessThanOrEqual(5)

    const ratios = new Set<string>()
    for (const shot of manifest.screenshots) {
      expect(shot.src).toMatch(/^\/screenshots\/[\w-]+\.webp$/)
      expect(shot.type).toBe('image/webp')
      expect(shot.label?.trim()).toBeTruthy()

      const file = join(PUBLIC, shot.src)
      expect(existsSync(file)).toBe(true)
      const [width, height] = webpSize(readFileSync(file))
      expect(shot.sizes).toBe(`${width}x${height}`)
      expect(Math.min(width, height)).toBeGreaterThanOrEqual(320)
      expect(Math.max(width, height)).toBeLessThanOrEqual(3840)
      expect(Math.max(width, height) / Math.min(width, height)).toBeLessThanOrEqual(2.3)
      if (shot.form_factor === 'narrow') {
        expect(height).toBeGreaterThan(width)
        ratios.add((height / width).toFixed(3))
      }
    }
    expect(ratios.size).toBe(1)
  })

  // The screenshots are read by the install sheet, never by a page, so the
  // service worker must not precache them on every install.
  it('keeps the screenshots out of the service worker precache', () => {
    const config = readFileSync(join(__dirname, '..', '..', 'next.config.mjs'), 'utf8')
    expect(config).toMatch(/publicExcludes:\s*\[[^\]]*'!screenshots\/\*\*\/\*'/)
  })
})
