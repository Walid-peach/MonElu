import type { SearchResult } from '@/lib/api'

// Shared between the chat page and the read-only share page (MON-66) so a
// shared answer renders identically to how the user saw it in the chat.

export function mdToHtml(text: string): string {
  let h = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  const blocks = h.split('\n\n')
  return blocks.map(block => {
    const lines = block.split('\n')
    if (lines.length > 1 && lines.every(l => /^- /.test(l))) {
      const items = lines.map(l => `<li style="margin:5px 0">${l.slice(2)}</li>`).join('')
      return `<ul style="margin:6px 0 12px 0;padding-left:22px">${items}</ul>`
    }
    if (lines.length > 1 && lines.every(l => /^\d+\. /.test(l))) {
      const items = lines.map(l => `<li style="margin:5px 0">${l.replace(/^\d+\.\s/, '')}</li>`).join('')
      return `<ol style="margin:6px 0 12px 0;padding-left:22px">${items}</ol>`
    }
    return `<p style="margin:0 0 14px 0">${lines.join('<br>')}</p>`
  }).join('')
}

// MON-159: `kind` lets dark-mode-aware callers (ChatAnswerCard) pick a
// themed badge/dot color without breaking chat/page.tsx, which still reads
// dot/badgeBg/badgeColor directly (its own pre-existing light/dark toggle
// predates the shared --dp-* system - see ADR discussion on MON-168).
// `deputy` is excluded from the "always same" kinds because its dot is a
// real per-party brand color (group_color), not a theme token.
export type SourceKind = 'deputy' | 'positive' | 'negative' | 'default'
export type SourceCard = { dot: string; label: string; sub: string; badge: string; badgeBg: string; badgeColor: string; kind: SourceKind; href?: string }

export function mapSource(src: SearchResult['sources'][0]): SourceCard {
  const meta = src.metadata || {}
  const type = meta.chunk_type || 'stat'
  if (type === 'deputy' || type === 'notable_deputy') {
    return {
      dot: meta.group_color || '#1B2B50',
      label: meta.deputy_name || meta.full_name || meta.name || 'Député',
      sub: [meta.department, meta.circonscription, meta.party].filter(Boolean).join(' · ') || '',
      badge: meta.group_short || meta.group || meta.party || '',
      badgeBg: '#F1F5F9', badgeColor: '#475569', kind: 'deputy',
      href: meta.deputy_id ? `/deputes/${meta.deputy_id}` : undefined,
    }
  }
  if (type === 'vote' || type === 'law_summary') {
    const adopted = (meta.result || '').toLowerCase().includes('adopt')
    return {
      dot: adopted ? '#15803D' : '#DC2626',
      label: meta.title || meta.vote_title || src.content.slice(0, 60),
      sub: meta.date || meta.voted_at || '',
      badge: meta.result || '',
      badgeBg: adopted ? '#DCFCE7' : '#FEE2E2',
      badgeColor: adopted ? '#15803D' : '#DC2626',
      kind: adopted ? 'positive' : 'negative',
      href: meta.vote_id ? `/votes/${meta.vote_id}` : undefined,
    }
  }
  return {
    dot: '#1B2B50',
    label: src.content.slice(0, 55) + (src.content.length > 55 ? '…' : ''),
    sub: `Pertinence ${Math.round(src.similarity * 100)} %`,
    badge: type, badgeBg: '#EFF3FB', badgeColor: '#1B2B50', kind: 'default',
  }
}

// compute_confidence() in rag/chain/rag_chain.py derives this from retrieval
// quality (top similarity + supporting chunk count), not LLM self-rating.
export const CONFIDENCE_META: Record<string, { label: string; bg: string; color: string; bgDark: string; colorDark: string }> = {
  high:   { label: 'Haute confiance',   bg: '#DCFCE7', color: '#15803D', bgDark: 'rgba(21,128,61,0.20)', colorDark: '#4ADE80' },
  medium: { label: 'Confiance moyenne', bg: '#FEF3C7', color: '#92400E', bgDark: 'rgba(180,83,9,0.20)',  colorDark: '#FBBF24' },
  low:    { label: 'Basse confiance',   bg: '#FEE2E2', color: '#B91C1C', bgDark: 'rgba(185,28,28,0.20)', colorDark: '#F87171' },
}

export const CONFIDENCE_EXPLANATION =
  "La confiance reflète la qualité des sources retrouvées dans la base de données (similarité et nombre), " +
  "pas l'auto-évaluation du modèle. " +
  'Haute confiance : plusieurs sources très proches de la question. ' +
  'Confiance moyenne : sources partiellement pertinentes. ' +
  'Basse confiance : peu de sources vraiment pertinentes — vérifiez la réponse à la source.'
