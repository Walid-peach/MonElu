import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import Script from 'next/script'
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
import { buildWebsiteJsonLd } from '@/lib/seo'
import { SITE_URL } from '@/lib/site'
import { THEME_STORAGE_KEY } from '@/lib/theme'

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
  description: "Données officielles de l'Assemblée Nationale. Suivez chaque vote de chaque député français.",
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'MonÉlu' },
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
    <html lang="fr" className={`${serif.variable} ${sans.variable} ${newsreader.variable}`}>
      <body className="min-h-screen">
        <Script id="theme-no-flash" strategy="beforeInteractive">
          {`(function(){try{if(window.location.pathname==='/')return;var s=localStorage.getItem('${THEME_STORAGE_KEY}');var d=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`}
        </Script>
        <ThemeProvider>
          <JsonLd data={buildWebsiteJsonLd()} />
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
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
