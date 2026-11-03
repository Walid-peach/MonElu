/**
 * The RSS 2.0 feed of recent votes (#424), served at `/flux.xml`.
 *
 * Built as a pure function so the XML can be tested without a request. Every
 * absolute URL derives from `SITE_URL` (MON-261). Each item leads with the
 * official title and carries a summary only beside its label (#634).
 */
import type { Vote } from '@/lib/api'
import { SITE_URL } from '@/lib/site'
import { summaryDisclosure } from '@/lib/summaryLabel'

export const FEED_PATH = '/flux.xml'
export const FEED_ITEM_COUNT = 50
export const FEED_TITLE = 'MonÉlu - Derniers scrutins de l\'Assemblée nationale'

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** RFC 822 date. A timestamp with no zone is UTC, as the API means it (scrutins are dated at midnight). */
export function rfc822(timestamp: string): string {
  const zoned = /(Z|[+-]\d{2}:?\d{2})$/.test(timestamp) ? timestamp : `${timestamp}Z`
  return new Date(zoned).toUTCString()
}

function description(vote: Vote): string {
  const result = vote.result === 'adopté' ? 'Adopté' : vote.result === 'rejeté' ? 'Rejeté' : vote.result
  const lines = [
    `${result} : ${vote.votes_for} pour, ${vote.votes_against} contre, ` +
      `${vote.abstentions} abstention${vote.abstentions > 1 ? 's' : ''}.`,
  ]
  if (vote.summary_plain) {
    lines.push(`${vote.summary_plain} (${summaryDisclosure(vote.summary_basis)})`)
  }
  return lines.join(' ')
}

function item(vote: Vote): string {
  const link = `${SITE_URL}/votes/${encodeURIComponent(vote.vote_id)}`
  return [
    '    <item>',
    `      <title>${escapeXml(vote.vote_title)}</title>`,
    `      <link>${link}</link>`,
    `      <guid isPermaLink="true">${link}</guid>`,
    `      <pubDate>${rfc822(vote.voted_at)}</pubDate>`,
    vote.theme ? `      <category>${escapeXml(vote.theme)}</category>` : null,
    `      <description>${escapeXml(description(vote))}</description>`,
    '    </item>',
  ].filter(Boolean).join('\n')
}

export function buildVotesFeed(votes: readonly Vote[]): string {
  const self = `${SITE_URL}${FEED_PATH}`
  const updated = votes[0] ? rfc822(votes[0].voted_at) : new Date(0).toUTCString()
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(FEED_TITLE)}</title>`,
    `    <link>${SITE_URL}/votes</link>`,
    `    <atom:link href="${self}" rel="self" type="application/rss+xml" />`,
    '    <description>Chaque scrutin public de l\'Assemblée nationale, avec son résultat, mis à jour chaque jour ouvré.</description>',
    '    <language>fr-FR</language>',
    `    <lastBuildDate>${updated}</lastBuildDate>`,
    ...votes.map(item),
    '  </channel>',
    '</rss>',
    '',
  ].join('\n')
}
