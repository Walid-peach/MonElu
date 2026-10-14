import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import tailwindConfig from '../../tailwind.config'

// Every text token in globals.css must reach WCAG AA for body text (4.5:1) on
// each background it is drawn on, in the light, dark and print palettes (#513).
// --dp-text-secondary and --dp-text-muted missed it in light mode until they
// took the iPhone app's values (#480). The iOS twin of this check is
// test_text_tokens_reach_aa_contrast in tests/unit/test_ios_design_tokens.py.

const AA_BODY_TEXT = 4.5
const CSS = readFileSync(join(__dirname, '..', '..', 'src', 'app', 'globals.css'), 'utf8')

const SURFACES = ['--dp-page-bg', '--dp-card-bg', '--dp-header-bg', '--dp-track-bg']

// Text token -> the backgrounds it is drawn on. A translucent badge tint is
// checked composited over the page and card backgrounds it can sit on.
const TEXT_ON_BACKGROUNDS: Record<string, string[]> = {
  '--dp-text': SURFACES,
  '--dp-text-secondary': SURFACES,
  '--dp-text-muted': SURFACES,
  '--dp-badge-pos-text': ['--dp-badge-pos-bg'],
  '--dp-badge-neg-text': ['--dp-badge-neg-bg'],
  '--dp-badge-neutral-text': ['--dp-badge-neutral-bg'],
  '--dp-badge-info-text': ['--dp-badge-info-bg'],
  '--dp-badge-abst-text': ['--dp-badge-abst-bg'],
}

type Rgba = { rgb: [number, number, number]; alpha: number }

/** The body of the block opened by `opener`, up to the brace at `indent`. */
function block(opener: RegExp, indent = ''): string {
  const start = CSS.search(opener)
  if (start < 0) throw new Error(`${opener} not found in globals.css`)
  const body = CSS.slice(start).match(new RegExp(`\\{([\\s\\S]*?)\\n${indent}\\}`))
  if (!body) throw new Error(`${opener} is not closed in globals.css`)
  return body[1]
}

function vars(body: string): Record<string, string> {
  // Comments go first: one naming a variable before a colon would be read as
  // its declaration.
  const code = body.replace(/\/\*[\s\S]*?\*\//g, '')
  return Object.fromEntries([...code.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

/** `theme('colors.navy.DEFAULT')` -> the value in tailwind.config.ts. */
function resolveTheme(value: string): string {
  const path = value.match(/^theme\('([^']+)'\)$/)
  if (!path) return value
  const found = path[1]
    .split('.')
    .reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], tailwindConfig.theme?.extend)
  if (typeof found !== 'string') throw new Error(`${value} does not resolve in tailwind.config.ts`)
  return found
}

function parse(value: string): Rgba {
  const color = resolveTheme(value)
  const hex = color.match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha: 1 }
  }
  const rgba = color.match(/^rgba\(([^)]+)\)$/)
  if (!rgba) throw new Error(`unsupported color ${color}`)
  const [r, g, b, a] = rgba[1].split(',').map(Number)
  return { rgb: [r, g, b], alpha: a }
}

function over(top: Rgba, surface: Rgba): Rgba {
  const rgb = top.rgb.map((c, i) => Math.round(c * top.alpha + surface.rgb[i] * (1 - top.alpha)))
  return { rgb: rgb as [number, number, number], alpha: 1 }
}

function luminance({ rgb }: Rgba): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: Rgba, b: Rgba): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}

const light = vars(block(/^:root\s*\{/m))
const PALETTES: Record<string, Record<string, string>> = {
  light,
  dark: { ...light, ...vars(block(/^\.dark\s*\{/m)) },
  print: { ...light, ...vars(block(/@media print\s*\{[\s\S]*?^ {2}:root\s*\{/m, '  ')) },
}

function failures(palette: Record<string, string>): string[] {
  const color = (name: string) => {
    if (!(name in palette)) throw new Error(`${name} is not declared`)
    return parse(palette[name])
  }
  return Object.entries(TEXT_ON_BACKGROUNDS).flatMap(([text, backgrounds]) => {
    const fg = color(text)
    if (fg.alpha !== 1) return [`${text} is translucent text`]
    return backgrounds.flatMap((background) => {
      const bg = color(background)
      const surfaces = bg.alpha === 1 ? [bg] : ['--dp-page-bg', '--dp-card-bg'].map((s) => over(bg, color(s)))
      return surfaces
        .map((surface) => contrast(fg, surface))
        .filter((ratio) => ratio < AA_BODY_TEXT)
        .map((ratio) => `${text} on ${background} is ${ratio.toFixed(2)}:1`)
    })
  })
}

describe('text token contrast', () => {
  it.each(Object.keys(PALETTES))('every text token reaches 4.5:1 in the %s palette', (name) => {
    expect(failures(PALETTES[name])).toEqual([])
  })

  it('computes the WCAG ratios', () => {
    expect(contrast(parse('#000000'), parse('#FFFFFF'))).toBeCloseTo(21, 1)
    expect(contrast(parse('#767676'), parse('#FFFFFF'))).toBeCloseTo(4.54, 2)
    expect(parse("theme('colors.navy.DEFAULT')")).toEqual(parse('#0D1F3C'))
  })

  it('catches the values #513 replaced', () => {
    expect(failures({ ...light, '--dp-text-secondary': '#6B7280', '--dp-text-muted': '#9CA3AF' })).toEqual([
      '--dp-text-secondary on --dp-page-bg is 4.40:1',
      '--dp-text-secondary on --dp-track-bg is 4.23:1',
      '--dp-text-muted on --dp-page-bg is 2.31:1',
      '--dp-text-muted on --dp-card-bg is 2.54:1',
      '--dp-text-muted on --dp-header-bg is 2.43:1',
      '--dp-text-muted on --dp-track-bg is 2.22:1',
    ])
    expect(failures({ ...PALETTES.dark, '--dp-text-muted': '#7C879C' })).toEqual([
      '--dp-text-muted on --dp-header-bg is 4.34:1',
      '--dp-text-muted on --dp-track-bg is 4.11:1',
    ])
  })
})
