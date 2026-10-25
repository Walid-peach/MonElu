import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import { DM_Serif_Display, DM_Sans, Newsreader } from 'next/font/google'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'
import { Nav } from '@/components/Nav'
import { GlobalSearch } from '@/components/GlobalSearch'
import { BottomNav } from '@/components/BottomNav'
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
import { INSTALL_PROMPT_CAPTURE_SCRIPT } from '@/lib/installState'
import { smartAppBannerMetadata } from '@/lib/appStore'

const serif = DM_Serif_Display({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
})

const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
  display: 'swap',
})

const sans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'MonÉlu — Suivez vos députés',
  // Shared with Organization.description in the JSON-LD below (MON-273) so the
  // meta description and the structured data cannot drift apart.
  description: SITE_DESCRIPTION,
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'MonÉlu' },
  // Safari's Smart App Banner (#597), off until the App Store ID is set.
  ...smartAppBannerMetadata(),
  openGraph: {
    title: 'MonÉlu — Suivez vos députés',
    description: "Données officielles de l'Assemblée Nationale",
    url: SITE_URL,
    siteName: 'MonÉlu',
    locale: 'fr_FR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MonÉlu — Suivez vos députés',
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
    // suppressHydrationWarning: THEME_INIT_SCRIPT sets the theme class on
    // <html> before React hydrates (#612).
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
      </head>
      <body className="min-h-screen">
        <ThemeProvider>
          {/* Organization first: WebSite.publisher references it by @id (MON-273). */}
          <JsonLd data={[buildOrganizationJsonLd(), buildWebsiteJsonLd()]} />
          <Suspense fallback={null}>
            <Nav />
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
