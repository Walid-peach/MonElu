import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Nav } from '@/components/Nav'
import { BottomNav } from '@/components/BottomNav'

export const metadata: Metadata = {
  title: 'MonÉlu — Suivez vos députés',
  description: "Données officielles de l'Assemblée Nationale. Suivez chaque vote de chaque député français.",
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'MonÉlu' },
  openGraph: {
    title: 'MonÉlu — Suivez vos députés',
    description: "Données officielles de l'Assemblée Nationale",
    url: 'https://monelu.fr',
    siteName: 'MonÉlu',
    locale: 'fr_FR',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#0D1F3C',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-gray-off min-h-screen">
        <Nav />
        <main className="pb-20 md:pb-0">{children}</main>
        <BottomNav />
      </body>
    </html>
  )
}
