import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// --dp-green / --dp-red are fills (bars, dots, hemicycle seats). As text on a
// --dp-badge-pos-bg / --dp-badge-neg-bg tint, --dp-green is 3.88:1 in light
// mode, under WCAG AA; badge text uses --dp-badge-pos-text / -neg-text.
// The iOS twin of this check is test_badge_text_does_not_use_the_fill_colors
// in tests/unit/test_ios_design_tokens.py.

const SRC = join(__dirname, '..', '..', 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

const BADGE_TINT = /--dp-badge-(pos|neg)-bg\b/
const FILL_VAR = /var\(--dp-(green|red)\)/
// A text color property or variable: `color:`, `badgeColor:`, `const posColor =`.
// Its value runs to the next comma, so `dot:` or `background:` on the same
// line is never read as text.
const TEXT_COLOR = /\b\w*[cC]olor\s*[:=]\s*([^,;\n]*)/g
// How far from a badge tint a text color still counts as drawn on it: a style
// object split one property per line keeps both within this many lines.
const WINDOW = 3

/** Text colors drawn with a fill near a badge tint, as `file:line: code`. */
function fillTextOnBadgeTint(source: string, file = 'source'): string[] {
  // Module constants that alias a fill (`const RED = 'var(--dp-red)'`).
  const aliases = [...source.matchAll(/const (\w+)\s*=\s*'var\(--dp-(?:green|red)\)'/g)].map((m) => m[1])
  const usesFill = (value: string) =>
    FILL_VAR.test(value) || aliases.some((name) => new RegExp(`\\b${name}\\b`).test(value))

  const lines = source.split('\n')
  return lines.flatMap((line, index) => {
    const nearTint = lines.slice(Math.max(0, index - WINDOW), index + WINDOW + 1).some((l) => BADGE_TINT.test(l))
    if (!nearTint) return []
    const offends = [...line.matchAll(TEXT_COLOR)].some((m) => usesFill(m[1]))
    return offends ? [`${file}:${index + 1}: ${line.trim()}`] : []
  })
}

describe('badge text contrast', () => {
  it('never draws badge text in --dp-green / --dp-red on a badge tint', () => {
    const offenders = sourceFiles(SRC).flatMap((path) =>
      fillTextOnBadgeTint(readFileSync(path, 'utf8'), relative(SRC, path)),
    )
    expect(offenders).toEqual([])
  })

  it('catches the forms the badges were written in', () => {
    const offending = [
      "<span style={{ background: adopted ? 'var(--dp-badge-pos-bg)' : 'var(--dp-badge-neg-bg)', color: adopted ? 'var(--dp-green)' : 'var(--dp-red)' }}>",
      "const posColor = g.position === 'Pour' ? 'var(--dp-green)' : 'x'\nconst posBg = g.position === 'Pour' ? 'var(--dp-badge-pos-bg)' : 'y'",
      "<span style={{\n  fontSize: 13,\n  color: p === 'pour' ? 'var(--dp-green)' : 'x',\n  background: p === 'pour' ? 'var(--dp-badge-pos-bg)' : 'y',\n}}>",
      "const RED = 'var(--dp-red)'\n\ncolor: ok ? 'var(--dp-badge-pos-text)' : RED,\nbackground: ok ? 'var(--dp-badge-pos-bg)' : 'var(--dp-badge-neg-bg)',",
    ]
    for (const source of offending) expect(fillTextOnBadgeTint(source)).toHaveLength(1)
  })

  it('leaves fills and badge text tokens alone', () => {
    const fine = [
      "positive: { dot: 'var(--dp-green)', badgeBg: 'var(--dp-badge-pos-bg)', badgeColor: 'var(--dp-badge-pos-text)' },",
      "<span style={{ color: 'var(--dp-badge-pos-text)', background: 'var(--dp-badge-pos-bg)' }} />",
      "<span style={{ background: 'var(--dp-green)', width: 6 }} />\n<div style={{ background: 'var(--dp-badge-pos-bg)' }} />",
      "<div style={{ color: 'var(--dp-green)' }}>far from any tint</div>\n\n\n\n\n<span style={{ background: 'var(--dp-badge-pos-bg)' }} />",
    ]
    for (const source of fine) expect(fillTextOnBadgeTint(source)).toEqual([])
  })
})
