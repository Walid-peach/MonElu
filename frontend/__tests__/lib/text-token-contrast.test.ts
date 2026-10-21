import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import tailwindConfig from '../../tailwind.config'

// Every text token in globals.css must reach WCAG AA for body text (4.5:1) on
// each background it is drawn on, in the light, dark and print palettes (#513).
// --dp-text-secondary and --dp-text-muted missed it in light mode until they
// took the iPhone app's values (#480). The iOS twin of this check is
// test_text_tokens_reach_aa_contrast in tests/unit/test_ios_design_tokens.py.
//
// --dp-green is a fill (bars, dots, seats): in light mode it is 3.95:1 on the
// page, so green text uses --dp-badge-pos-text, the app's positiveText. A
// check below keeps --dp-green out of text colors in src/.
//
// Grey text goes through the tokens too (#559): Tailwind's gray-mid (#8A8885)
// and the literals #9CA3AF and #6B7280 missed AA on the site's surfaces, and
// so did translucent white on the dark ones. The last checks keep them out of
// text colors in src/.

const AA_BODY_TEXT = 4.5
const SRC = join(__dirname, '..', '..', 'src')
const CSS = readFileSync(join(SRC, 'app', 'globals.css'), 'utf8')

const SURFACES = ['--dp-page-bg', '--dp-card-bg', '--dp-header-bg', '--dp-track-bg']

// Backgrounds outside the tokens that the text tokens are also drawn on:
// gray-off (the freshness bar), the hemicycle's view toggle, and the chat
// page's own surfaces, which it keeps as inline literals (MON-168): its
// panels, its mode switch and source cards, and the navy of its sidebar, the
// footer and the /a-propos sections, which dp-dark pins to the dark palette.
const OTHER_SURFACES: Record<string, string[]> = {
  light: ["theme('colors.gray.off')", '#F2F3F5', '#F7F8FA', '#F0F1F4'],
  dark: ['#0B1525', '#111C35', '#162035', '#1B2B50'],
  print: [],
}

// Text token -> the backgrounds it is drawn on. A translucent badge tint is
// checked composited over the page and card backgrounds it can sit on.
const TEXT_ON_BACKGROUNDS: Record<string, string[]> = {
  '--dp-text': SURFACES,
  '--dp-text-secondary': SURFACES,
  '--dp-text-muted': SURFACES,
  // Red and the text green are also written straight on the surfaces: counts,
  // eyebrows, links, the above/below-average figures.
  '--dp-red': SURFACES,
  '--dp-badge-pos-text': ['--dp-badge-pos-bg', ...SURFACES],
  '--dp-badge-neg-text': ['--dp-badge-neg-bg'],
  '--dp-badge-neutral-text': ['--dp-badge-neutral-bg'],
  '--dp-badge-info-text': ['--dp-badge-info-bg'],
  '--dp-badge-abst-text': ['--dp-badge-abst-bg'],
}

type Rgba = { rgb: [number, number, number]; alpha: number }

/** The body of the block whose opening brace ends `opener`, up to the closing brace at `indent`. */
function block(opener: RegExp, indent = ''): string {
  const found = CSS.match(opener)
  if (!found || found.index === undefined) throw new Error(`${opener} not found in globals.css`)
  const body = CSS.slice(found.index + found[0].length - 1).match(new RegExp(`\\{([\\s\\S]*?)\\n${indent}\\}`))
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

const light = vars(block(/^:root,\s*\.dp-light\s*\{/m))
const PALETTES: Record<string, Record<string, string>> = {
  light,
  dark: { ...light, ...vars(block(/^\.dark,\s*\.dp-dark\s*\{/m)) },
  print: { ...light, ...vars(block(/@media print\s*\{[\s\S]*?^ {2}:root\s*\{/m, '  ')) },
}

function failures(palette: Record<string, string>, otherSurfaces: string[] = []): string[] {
  const color = (name: string) => {
    if (name.startsWith('--') && !(name in palette)) throw new Error(`${name} is not declared`)
    return parse(palette[name] ?? name)
  }
  return Object.entries(TEXT_ON_BACKGROUNDS).flatMap(([text, backgrounds]) => {
    const fg = color(text)
    if (fg.alpha !== 1) return [`${text} is translucent text`]
    const drawnOn = backgrounds === SURFACES ? [...SURFACES, ...otherSurfaces] : backgrounds
    return drawnOn.flatMap((background) => {
      const bg = color(background)
      const surfaces = bg.alpha === 1 ? [bg] : ['--dp-page-bg', '--dp-card-bg'].map((s) => over(bg, color(s)))
      return surfaces
        .map((surface) => contrast(fg, surface))
        .filter((ratio) => ratio < AA_BODY_TEXT)
        .map((ratio) => `${text} on ${background} is ${ratio.toFixed(2)}:1`)
    })
  })
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

// --dp-green as a text color: a `color:` style property (or a `*Color` key,
// like the badges' `badgeColor`) up to the next comma, or a Tailwind text class.
const GREEN_TEXT = /\b\w*[cC]olor\s*[:=][^,;\n]*var\(--dp-green\)|text-\[(?:color:)?var\(--dp-green\)\]/

function greenText(source: string, file = 'source'): string[] {
  return source
    .split('\n')
    .flatMap((line, index) => (GREEN_TEXT.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : []))
}

// Grey text outside the tokens (#559): a Tailwind text class, or a `color`
// style property (`color: ...` or `.style.color = ...`) whose value holds one
// of the grey literals or a translucent white too faint for AA. Fills,
// strokes, backgrounds and `*Color` keys other than `color` are left alone.
const GREY_LITERAL = /#(?:9CA3AF|6B7280|8A8885)\b/i
const GREY_CLASS = /(?<![\w-])text-(?:gray-(?:mid|400|500)|\[(?:color:)?#(?:9CA3AF|6B7280|8A8885)\])(?![\w-])/i
const COLOR_PROPERTY = /(?<![\w-])color\s*[:=](?!=)/g
const WHITE = /rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)/g

// The surfaces translucent white text is written on: the dark palette's, and
// the chat page's.
const DARK_SURFACES = [...SURFACES.map((name) => PALETTES.dark[name]), ...OTHER_SURFACES.dark]

/** The faintest white that still reaches AA on every dark surface. */
const MIN_WHITE_ALPHA = (() => {
  for (let alpha = 0; alpha <= 1; alpha += 0.01) {
    const white = { rgb: [255, 255, 255] as [number, number, number], alpha: Number(alpha.toFixed(2)) }
    if (DARK_SURFACES.every((s) => contrast(over(white, parse(s)), parse(s)) >= AA_BODY_TEXT)) return white.alpha
  }
  return 1
})()

/** The value of each `color` property on a line, up to the next top-level `,` `;` or `}`. */
function colorValues(line: string): string[] {
  return [...line.matchAll(COLOR_PROPERTY)].map((m) => {
    let depth = 0
    let end = m.index + m[0].length
    for (; end < line.length; end++) {
      const c = line[end]
      if (c === '(' || c === '[') depth++
      else if (c === ')' || c === ']') depth--
      if (depth < 0 || (depth === 0 && /[,;}]/.test(c))) break
    }
    return line.slice(m.index + m[0].length, end)
  })
}

function greyText(source: string, file = 'source'): string[] {
  return source.split('\n').flatMap((line, index) => {
    const grey =
      GREY_CLASS.test(line) ||
      colorValues(line).some(
        (value) =>
          GREY_LITERAL.test(value) || [...value.matchAll(WHITE)].some((white) => Number(white[1]) < MIN_WHITE_ALPHA),
      )
    return grey ? [`${file}:${index + 1}: ${line.trim()}`] : []
  })
}

// Open Graph cards are images drawn on a fixed navy, not page text (#559).
const PAGE_SOURCES = sourceFiles(SRC).filter((path) => !path.endsWith('opengraph-image.tsx'))

describe('text token contrast', () => {
  it.each(Object.keys(PALETTES))('every text token reaches 4.5:1 in the %s palette', (name) => {
    expect(failures(PALETTES[name], OTHER_SURFACES[name])).toEqual([])
  })

  it('never writes text in --dp-green', () => {
    expect(sourceFiles(SRC).flatMap((path) => greenText(readFileSync(path, 'utf8'), relative(SRC, path)))).toEqual([])
  })

  it('tells green text from green fills', () => {
    const text = [
      "<span style={{ fontSize: 13, color: up ? 'var(--dp-green)' : RED }}>",
      "<div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dp-green)' }}>POUR</div>",
      '<span className="text-[color:var(--dp-green)]">',
      "positive: { badgeColor: 'var(--dp-green)' },",
    ]
    for (const line of text) expect(greenText(line)).toHaveLength(1)
    const fills = [
      "<div style={{ width: '40%', background: 'var(--dp-green)' }} />",
      "{ fill: 'var(--dp-green)', label: 'Pour', pct },",
      '<svg stroke="var(--dp-green)" />',
      "positive: { dot: 'var(--dp-green)', badgeColor: 'var(--dp-badge-pos-text)' },",
    ]
    for (const line of fills) expect(greenText(line)).toEqual([])
  })

  it('never writes text in gray-mid, a grey literal or a faint white', () => {
    expect(PAGE_SOURCES.flatMap((path) => greyText(readFileSync(path, 'utf8'), relative(SRC, path)))).toEqual([])
  })

  it('tells grey text from grey fills', () => {
    const text = [
      '<p className="text-gray-mid text-sm mb-6">',
      '<span className="hover:text-gray-mid">',
      '<span className="text-[#9CA3AF]">',
      "<span style={{ fontSize: 12, color: '#9CA3AF' }}>",
      "<div style={{ fontSize: 13, color: '#6B7280', fontWeight: 500 }}>",
      "<span style={{ color: MAJORITY_COLOR[v.majority_position] ?? '#9CA3AF' }}>",
      "<div style={{ fontSize: 11, color: dk ? 'rgba(255,255,255,0.27)' : 'var(--dp-text-muted)' }}>",
      "color: hover ? (dark ? 'rgba(255,255,255,0.70)' : '#1B2B50') : (dark ? 'rgba(255,255,255,0.26)' : '#1B2B50'),",
      "onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}",
    ]
    for (const line of text) expect(greyText(line)).toHaveLength(1)
    const fills = [
      "nonVotant: '#9CA3AF',",
      '<path d="M6 19 A9 9 0 0 1 24 19" stroke="#9CA3AF" strokeWidth="2.2" />',
      "<div style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--dp-text-muted)' }}>",
      "<div style={{ scrollbarColor: 'rgba(255,255,255,0.14) transparent' }}>",
      "<div style={{ borderColor: '#9CA3AF', color: 'var(--dp-text)' }}>",
      "<span style={{ fontSize: 17, color: 'rgba(255,255,255,0.86)' }}>Pour</span>",
      '<div className="text-gray-mid-like border-gray-mid">',
    ]
    for (const line of fills) expect(greyText(line)).toEqual([])
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
    expect(failures({ ...light, '--dp-badge-pos-text': light['--dp-green'] })).toEqual([
      '--dp-badge-pos-text on --dp-badge-pos-bg is 3.88:1',
      '--dp-badge-pos-text on --dp-page-bg is 3.95:1',
      '--dp-badge-pos-text on --dp-card-bg is 4.33:1',
      '--dp-badge-pos-text on --dp-header-bg is 4.15:1',
      '--dp-badge-pos-text on --dp-track-bg is 3.79:1',
    ])
    // Tailwind's gray-mid, which the nav and the tab bar used until #559.
    expect(failures({ ...light, '--dp-text-muted': '#8A8885' }, OTHER_SURFACES.light)).toEqual([
      '--dp-text-muted on --dp-page-bg is 3.22:1',
      '--dp-text-muted on --dp-card-bg is 3.53:1',
      '--dp-text-muted on --dp-header-bg is 3.38:1',
      '--dp-text-muted on --dp-track-bg is 3.09:1',
      "--dp-text-muted on theme('colors.gray.off') is 3.30:1",
      '--dp-text-muted on #F2F3F5 is 3.18:1',
      '--dp-text-muted on #F7F8FA is 3.33:1',
      '--dp-text-muted on #F0F1F4 is 3.13:1',
    ])
    expect(failures({ ...PALETTES.dark, '--dp-text-muted': '#7C879C' })).toEqual([
      '--dp-text-muted on --dp-header-bg is 4.34:1',
      '--dp-text-muted on --dp-track-bg is 4.11:1',
    ])
  })
})
