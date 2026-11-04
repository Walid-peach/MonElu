import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import localFont from 'next/font/local'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './fonts/fonts.css'
import './globals.css'
import { Nav } from '@/components/Nav'
import { GlobalSearch } from '@/components/GlobalSearch'
import { BottomNav } from '@/components/BottomNav'
import { MobileTopBar } from '@/components/MobileTopBar'
import { PageTransition } from '@/components/PageTransition'
import { FreshnessBadge } from '@/components/FreshnessBadge'
import { Footer } from '@/components/Footer'
import { HideOnEmbed } from '@/components/HideOnEmbed'
import { MainFrame } from '@/components/MainFrame'
import { JsonLd } from '@/components/JsonLd'
import { ThemeProvider } from '@/components/ThemeProvider'
import { InstallEventsReporter } from '@/components/InstallEventsReporter'
import { SITE_DESCRIPTION, buildOrganizationJsonLd, buildWebsiteJsonLd } from '@/lib/seo'
import { SITE_URL } from '@/lib/site'
import { THEME_INIT_SCRIPT } from '@/lib/theme'
import { INSTALL_PROMPT_CAPTURE_SCRIPT, INSTALLED_FLAG_SCRIPT } from '@/lib/installState'
import { smartAppBannerMetadata } from '@/lib/appStore'

// Self-hosted: next/font/google downloaded these from Google Fonts on
// every `next build`, and a failed fetch failed the build. The files and
// @font-face rules are the ones it used to fetch. The latin subset is declared
// here so next/font preloads it; the other subsets and the metric-matched
// fallback faces live in ./fonts/fonts.css.
//
// next/font only accepts literal options, so the latin unicode-range is
// repeated in each call rather than shared through a constant.
const serif = localFont({
  src: [
    { path: './fonts/dm-serif-display-latin-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/dm-serif-display-latin-italic.woff2', weight: '400', style: 'italic' },
  ],
  declarations: [
    { prop: 'font-family', value: "'DM Serif Display'" },
    { prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  ],
  variable: '--font-serif',
  display: 'swap',
  adjustFontFallback: false,
  fallback: ["'DM Serif Display Fallback'"],
})

const newsreader = localFont({
  src: [
    { path: './fonts/newsreader-latin-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/newsreader-latin-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/newsreader-latin-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/newsreader-latin-normal.woff2', weight: '700', style: 'normal' },
    { path: './fonts/newsreader-latin-italic.woff2', weight: '400', style: 'italic' },
    { path: './fonts/newsreader-latin-italic.woff2', weight: '500', style: 'italic' },
    { path: './fonts/newsreader-latin-italic.woff2', weight: '600', style: 'italic' },
    { path: './fonts/newsreader-latin-italic.woff2', weight: '700', style: 'italic' },
  ],
  declarations: [
    { prop: 'font-family', value: "'Newsreader'" },
    { prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  ],
  variable: '--font-newsreader',
  display: 'swap',
  adjustFontFallback: false,
  fallback: ["'Newsreader Fallback'"],
})

const sans = localFont({
  src: [
    { path: './fonts/dm-sans-latin-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/dm-sans-latin-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/dm-sans-latin-normal.woff2', weight: '600', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: "'DM Sans'" },
    { prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  ],
  variable: '--font-sans',
  display: 'swap',
  adjustFontFallback: false,
  fallback: ["'DM Sans Fallback'"],
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'MonÉlu : suivez vos députés',
  // Shared with Organization.description in the JSON-LD below (MON-273) so the
  // meta description and the structured data cannot drift apart.
  description: SITE_DESCRIPTION,
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'MonÉlu' },
  // Safari's Smart App Banner (#597), off until the App Store ID is set.
  ...smartAppBannerMetadata(),
  openGraph: {
    title: 'MonÉlu : suivez vos députés',
    description: "Données officielles de l'Assemblée Nationale",
    url: SITE_URL,
    siteName: 'MonÉlu',
    locale: 'fr_FR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MonÉlu : suivez vos députés',
    description: "Données officielles de l'Assemblée Nationale",
  },
}

export const viewport: Viewport = {
  themeColor: '#0D1F3C',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: THEME_INIT_SCRIPT sets the theme class (#612)
    // and INSTALLED_FLAG_SCRIPT may add `data-installed` on <html> before
    // React hydrates; it only covers <html>'s own attributes.
    <html lang="fr" className={`${serif.variable} ${sans.variable} ${newsreader.variable}`} suppressHydrationWarning>
      <head>
        {/* First in <head>, so the theme is set before anything paints (#612). */}
        <script id="theme-init" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* A plain inline script, not next/script: in the App Router even
            beforeInteractive scripts wait for the bootstrap chunks, and Chrome
            can fire beforeinstallprompt as soon as the manifest loads. The
            event fires once per page load and /application needs it (#595). */}
        <script
          id="install-prompt-capture"
          dangerouslySetInnerHTML={{ __html: INSTALL_PROMPT_CAPTURE_SCRIPT }}
        />
        <script id="installed-flag" dangerouslySetInnerHTML={{ __html: INSTALLED_FLAG_SCRIPT }} />
      </head>
      <body className="min-h-screen">
        <ThemeProvider>
          {/* Organization first: WebSite.publisher references it by @id (MON-273). */}
          <JsonLd data={[buildOrganizationJsonLd(), buildWebsiteJsonLd()]} />
          <Suspense fallback={null}>
            <Nav />
          </Suspense>
          {/* Phones in the browser; the installed app keeps BottomNav (H1). */}
          <Suspense fallback={null}>
            <MobileTopBar />
          </Suspense>
          {/* Triggerless: the nav menus and the mobile sheet open it, plus ⌘K. */}
          <HideOnEmbed><GlobalSearch hideTrigger /></HideOnEmbed>
          <HideOnEmbed><FreshnessBadge /></HideOnEmbed>
          <MainFrame><PageTransition>{children}</PageTransition></MainFrame>
          <Footer />
          <Suspense fallback={null}>
            <BottomNav />
          </Suspense>
        </ThemeProvider>
        <InstallEventsReporter />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
