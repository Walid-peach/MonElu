import type { Metadata, Viewport } from 'next'
import { DM_Serif_Display, DM_Sans, Newsreader } from 'next/font/google'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'
import { Nav } from '@/components/Nav'
import { BottomNav } from '@/components/BottomNav'

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
  metadataBase: new URL('https://mon-elu.vercel.app'),
  title: 'MonÉlu — Suivez vos députés',
  description: "Données officielles de l'Assemblée Nationale. Suivez chaque vote de chaque député français.",
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'MonÉlu' },
  openGraph: {
    title: 'MonÉlu — Suivez vos députés',
    description: "Données officielles de l'Assemblée Nationale",
    url: 'https://mon-elu.vercel.app',
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
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${serif.variable} ${sans.variable} ${newsreader.variable}`}>
      <body className="bg-gray-off min-h-screen">
        <Nav />
        <main className="pb-20 md:pb-0">{children}</main>
        <BottomNav />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
