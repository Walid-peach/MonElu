import { summaryDisclosure, summaryDisclosureMarkdown, summaryTag } from '@/lib/summaryLabel'

describe('summary labels (#634)', () => {
  it('claims the official text only for a summary built from it', () => {
    expect(summaryDisclosure('official_text')).toContain('à partir du texte officiel')
    expect(summaryDisclosure(null)).not.toContain('texte officiel')
    expect(summaryDisclosure('procedure')).not.toContain('IA')
  })

  it('does not call a sentence written by code an AI summary', () => {
    expect(summaryTag('procedure')).toBe('Procédure')
    expect(summaryTag('official_text')).toBe('Résumé IA')
    expect(summaryTag(undefined)).toBe('Résumé IA')
  })

  it('gives the Markdown twins the same disclosure and the method link', () => {
    const line = summaryDisclosureMarkdown('official_text')
    expect(line).toContain(summaryDisclosure('official_text'))
    expect(line).toContain('/methodologie#resumes')
  })
})
