import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The site's fonts are committed under src/app/fonts and loaded with
 * next/font/local. next/font/google fetched them from Google Fonts during
 * every `next build`, and a failed fetch failed the build at random on Vercel
 * and in CI. These checks keep the build free of that network dependency.
 */
const SRC = join(__dirname, '..', '..', 'src')
const FONTS = join(SRC, 'app', 'fonts')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.(tsx?|css)$/.test(entry.name) ? [full] : []
  })
}

describe('fonts are self-hosted', () => {
  it('never loads fonts from Google Fonts', () => {
    const offenders = sourceFiles(SRC).filter((file) =>
      /from ['"]next\/font\/google['"]|https?:\/\/fonts\.(googleapis|gstatic)\.com/.test(
        readFileSync(file, 'utf8'),
      ),
    )
    expect(offenders).toEqual([])
  })

  it('ships every font file the layout and fonts.css reference', () => {
    const layout = readFileSync(join(SRC, 'app', 'layout.tsx'), 'utf8')
    const css = readFileSync(join(FONTS, 'fonts.css'), 'utf8')
    const fromLayout = [...layout.matchAll(/path: '\.\/fonts\/([^']+\.woff2)'/g)].map((m) => m[1])
    const fromCss = [...css.matchAll(/url\('\.\/([^']+\.woff2)'\)/g)].map((m) => m[1])
    expect(fromLayout.length).toBeGreaterThan(0)
    expect(fromCss.length).toBeGreaterThan(0)
    for (const file of [...fromLayout, ...fromCss]) {
      expect(existsSync(join(FONTS, file))).toBe(true)
    }
  })

  it('ships the licence of every family (SIL OFL 1.1)', () => {
    for (const family of ['DM-Sans', 'DM-Serif-Display', 'Newsreader']) {
      const licence = readFileSync(join(FONTS, `OFL-${family}.txt`), 'utf8')
      expect(licence).toContain('SIL Open Font License, Version 1.1')
    }
  })
})
