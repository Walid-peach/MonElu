import withPWAInit from '@ducanh2912/next-pwa'
import { withSentryConfig } from '@sentry/nextjs'

const withPWA = withPWAInit({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  // Cache pages reached through client-side navigation too, so the last-viewed
  // deputy/vote pages stay readable offline (MON-115).
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  // Hero JPEGs (~1.2 MB) are only loaded raw by the desktop cinematic and are
  // otherwise served as optimized /_next/image variants - runtime-cache them
  // on demand instead of eagerly precaching on every install (MON-146).
  publicExcludes: ['!*.jpg'],
  fallbacks: {
    // Served on navigation cache-miss while offline.
    document: '/~offline',
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.assemblee-nationale.fr',
        pathname: '/dyn/static/tribun/17/photos/carre/**',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'github.com',
      },
    ],
  },
  async rewrites() {
    return []
  },
  // /embed/* pages (MON-96) are meant to be iframed on external sites; every
  // other route stays framing-denied by default.
  async headers() {
    return [
      {
        // Segment-anchored (`embed/`, not `embed`) so a future route that merely
        // starts with the string "embed" (e.g. /embeddings) still falls under
        // this deny-by-default rule instead of matching neither rule below.
        source: '/((?!embed/).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      },
      {
        source: '/embed/:path*',
        headers: [
          // Deliberately permissive: /embed/* is the iframe surface external
          // sites paste MonÉlu cards into (MON-96) — do not tighten this back
          // to 'self' without breaking that feature.
          { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
        ],
      },
    ]
  },
}

export default withSentryConfig(withPWA(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Source map upload needs SENTRY_AUTH_TOKEN; without it the plugin warns
  // and skips the upload rather than failing the build.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
})
