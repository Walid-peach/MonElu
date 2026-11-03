import { execSync } from 'node:child_process'

describe('a summary is never the headline (#634)', () => {
  it('finds no `summary_plain || vote_title` fallback in src', () => {
    const hits = execSync(
      `grep -rnE "summary_plain *\\|\\|" src || true`,
      { encoding: 'utf8' },
    )
    expect(hits).toBe('')
  })
})
