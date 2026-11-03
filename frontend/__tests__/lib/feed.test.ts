import type { Vote } from '@/lib/api'
import { buildVotesFeed, escapeXml, rfc822 } from '@/lib/feed'
import { SITE_URL } from '@/lib/site'

function vote(o: Partial<Vote> = {}): Vote {
  return {
    vote_id: 'VTANR5L17V9241', voted_at: '2026-10-29T00:00:00', result: 'adopté',
    vote_title: "l'ensemble de la proposition de loi visant à créer un parcours de soins (première lecture).",
    votes_for: 152, votes_against: 5, abstentions: 110, total_voters: 267,
    summary_plain: null, theme: 'Santé & Social', ...o,
  }
}

describe('the RSS feed of recent votes (#424)', () => {
  it('is RSS 2.0 with a self link built from SITE_URL', () => {
    const xml = buildVotesFeed([vote()])
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">')
    expect(xml).toContain(`<atom:link href="${SITE_URL}/flux.xml" rel="self" type="application/rss+xml" />`)
  })

  it('links each item to its vote page and leads with the official title', () => {
    const xml = buildVotesFeed([vote()])
    expect(xml).toContain(`<link>${SITE_URL}/votes/VTANR5L17V9241</link>`)
    expect(xml).toContain("<title>l&apos;ensemble de la proposition de loi")
    expect(xml).toContain('<pubDate>Thu, 29 Oct 2026')
    expect(xml).toContain('<category>Santé &amp; Social</category>')
  })

  it('shows no summary placeholder when a vote has none, and labels one when it has', () => {
    expect(buildVotesFeed([vote()])).not.toContain('Résumé')
    const xml = buildVotesFeed([vote({ summary_plain: 'Créer un parcours de soins.', summary_basis: 'official_text' })])
    expect(xml).toContain('Créer un parcours de soins. (Résumé généré par IA à partir du texte officiel.')
  })

  it('reads a timestamp with no zone as UTC', () => {
    expect(rfc822('2026-10-29T00:00:00')).toBe('Thu, 29 Oct 2026 00:00:00 GMT')
    expect(rfc822('2026-10-29T00:00:00+00:00')).toBe('Thu, 29 Oct 2026 00:00:00 GMT')
  })

  it('escapes every XML special character', () => {
    expect(escapeXml(`a & b < c > "d" 'e'`)).toBe('a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;')
  })

  it('still builds with no votes', () => {
    expect(buildVotesFeed([])).toContain('<channel>')
  })
})
