import { canonicalUrl } from '@/lib/site'

/** What a stored summary was built from (`votes.summary_basis`, ADR-046). */
export type SummaryBasis = 'official_text' | 'procedure'

/** The Méthodologie section every label points to. */
export const SUMMARY_METHOD_PATH = '/methodologie#resumes'

/** The word beside a summary in a list, where the whole row is already a link. */
export function summaryTag(basis?: string | null): string {
  return basis === 'procedure' ? 'Procédure' : 'Résumé IA'
}

/**
 * The full disclosure. Only `official_text` may claim the official text: a motion's
 * sentence is written by code, and an agenda line comes from the order paper.
 */
export function summaryDisclosure(basis?: string | null): string {
  if (basis === 'procedure') return 'Phrase type écrite selon le résultat de la motion.'
  if (basis === 'official_text') {
    return 'Résumé généré par IA à partir du texte officiel. Peut contenir des erreurs.'
  }
  return 'Résumé généré par IA. Peut contenir des erreurs.'
}

/** One Markdown line for the `.md` twins, which stand alone as a citation. */
export function summaryDisclosureMarkdown(basis?: string | null): string {
  return `*${summaryDisclosure(basis)} [Méthode](${canonicalUrl(SUMMARY_METHOD_PATH)})*`
}
