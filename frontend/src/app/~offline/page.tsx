'use client'
// Offline fallback (MON-115): served by the service worker when a navigation
// fails while offline (next-pwa `fallbacks.document`). Pages already visited
// are served from the runtime cache instead and never reach this fallback.

export default function OfflinePage() {
  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 py-16 text-center">
      <div className="font-newsreader text-[64px] leading-none text-navy/20 mb-2" aria-hidden="true">
        ⌁
      </div>
      <h2 className="font-serif text-2xl text-navy mb-3">Vous êtes hors ligne</h2>
      <p className="text-gray-mid text-sm mb-6">
        Cette page n&apos;est pas disponible sans connexion. Les pages déjà consultées
        (députés, votes) restent lisibles hors ligne.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="bg-navy text-white px-5 py-2 rounded font-medium text-sm hover:bg-navy/90 transition-colors"
      >
        Réessayer
      </button>
    </div>
  )
}
