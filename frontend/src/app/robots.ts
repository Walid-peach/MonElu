import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    // /partager (share-target redirect) and /~offline (SW fallback) are
    // machine endpoints, not content pages.
    rules: { userAgent: '*', allow: '/', disallow: ['/partager', '/~offline'] },
    sitemap: 'https://mon-elu.vercel.app/sitemap.xml',
  }
}
