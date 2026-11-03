/**
 * Visible copy rules (#635, docs/writing-guide.md).
 *
 * An em dash may stay in a code comment and as the lone placeholder for an
 * empty value ('—'), never in a sentence or a title a reader sees. And À propos
 * prints no figure the API can provide: a figure written in the page goes stale,
 * as "1 200+ scrutins" and "3 741 chunks" did.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(__dirname, '..', '..', 'src')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

/** Lines outside comments that still carry an em dash other than the placeholder. */
function visibleDashes(path: string): string[] {
  const hits: string[] = []
  let inComment = false
  readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
    const s = line.trim()
    if (inComment) {
      if (s.includes('*/')) inComment = false
      return
    }
    if (s.startsWith('/*') || s.startsWith('{/*')) {
      if (!s.includes('*/')) inComment = true
      return
    }
    if (s.startsWith('//') || s.startsWith('*')) return
    const code = line
      .replace(/(?<!:)\/\/.*$/, '')
      .replace(/\{\/\*.*?\*\/\}/g, '')
      .replace(/(['"`])—\1/g, '')
      .replace(/>—</g, '')
    if (code.includes('—')) hits.push(`${path.slice(SRC.length + 1)}:${i + 1}`)
  })
  return hits
}

describe('visible copy (#635)', () => {
  it('has no em dash in a sentence or a title', () => {
    expect(files(SRC).flatMap(visibleDashes)).toEqual([])
  })

  it('prints no API figure as a literal on À propos', () => {
    const page = readFileSync(join(SRC, 'app', 'a-propos', 'page.tsx'), 'utf8')
    // "1 536" (embedding dimensions) is a property of the model, not a count the API returns.
    const literals = (page.match(/\b\d{1,3}(?:[\u00a0\u202f ]\d{3})+\+?|\b\d+\+(?![+\d])/g) ?? []).filter(
      n => n.replace(/\D/g, '') !== '1536',
    )
    expect(literals).toEqual([])
    expect(page).toContain('health?.votes')
    expect(page).toContain('health?.positions')
  })
})
