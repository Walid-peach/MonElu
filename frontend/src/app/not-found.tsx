import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 py-16 text-center">
      <div className="font-newsreader text-[64px] leading-none text-navy/20 mb-2">404</div>
      <h2 className="font-serif text-2xl text-navy mb-3">
        Page introuvable
      </h2>
      <p className="text-gray-mid text-sm mb-6">
        Ce député, ce vote ou cette page n&apos;existe pas ou plus.
      </p>
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <Link
          href="/"
          className="bg-navy text-white px-5 py-2 rounded font-medium text-sm hover:bg-navy/90 transition-colors"
        >
          Accueil
        </Link>
        <Link
          href="/deputes"
          className="border border-navy/30 text-navy px-5 py-2 rounded font-medium text-sm hover:bg-navy/5 transition-colors"
        >
          Voir les députés
        </Link>
        <Link
          href="/votes"
          className="border border-navy/30 text-navy px-5 py-2 rounded font-medium text-sm hover:bg-navy/5 transition-colors"
        >
          Voir les votes
        </Link>
        <Link
          href="/chat"
          className="border border-navy/30 text-navy px-5 py-2 rounded font-medium text-sm hover:bg-navy/5 transition-colors"
        >
          Rechercher
        </Link>
      </div>
    </div>
  )
}
