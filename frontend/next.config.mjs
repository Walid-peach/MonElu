import withPWAInit from '@ducanh2912/next-pwa'
import { withSentryConfig } from '@sentry/nextjs'

const withPWA = withPWAInit({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
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
}

export default withSentryConfig(withPWA(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Source map upload needs SENTRY_AUTH_TOKEN; without it the plugin warns
  // and skips the upload rather than failing the build.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
})
