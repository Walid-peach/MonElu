import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

/**
 * AI crawlers named explicitly (MON-261).
 *
 * They are already covered by the `*` rule, so listing them changes nothing
 * today - which is the point. It records the policy as a deliberate yes
 * instead of an inherited default, so a later "let's tighten robots.txt" does
 * not silently delist a public-interest open-data site from AI answers. This
 * is Licence Ouverte 2.0 data whose whole purpose is to be reused; being
 * quotable by an assistant is distribution, not leakage.
 *
 * `Google-Extended` is the one with a distinct effect: it governs Gemini and
 * AI Overviews eligibility separately from Googlebot, so it is worth an
 * explicit entry rather than an inherited one.
 */
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'Bytespider',
  'meta-externalagent',
]

// /partager (share-target redirect) and /~offline (SW fallback) are
// machine endpoints, not content pages.
const DISALLOW = ['/partager', '/~offline']

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: DISALLOW },
      ...AI_CRAWLERS.map(userAgent => ({ userAgent, allow: '/', disallow: DISALLOW })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
