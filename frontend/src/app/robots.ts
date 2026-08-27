import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    // /partager (share-target redirect) and /~offline (SW fallback) are
    // machine endpoints, not content pages.
    rules: { userAgent: '*', allow: '/', disallow: ['/partager', '/~offline'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
