import { ContentSkeleton, SkeletonBlock } from '@/components/ui/ContentSkeleton'

// /deputes/tableau is `force-dynamic` and awaits all 577 scorecards, so it
// needs a route-level fallback. It used to inherit `deputes/loading.tsx`,
// which drew the deputy *card list* - the wrong shape for a dense table, and
// a large layout jump once the real page mounted. That file now lives in the
// `(liste)` route group (MON-275), so this page gets a fallback that matches
// what actually arrives: a header band and table rows.
const ROW_COUNT = 14

export default function TableauLoading() {
  return (
    <div style={{ background: 'var(--dp-page-bg)', minHeight: '100vh' }}>
      <div className="px-5 sm:px-14 pt-8 sm:pt-[50px] pb-6">
        <SkeletonBlock className="h-9 w-[280px] max-w-full rounded" />
        <SkeletonBlock className="h-4 w-[420px] max-w-full rounded mt-3" />
      </div>
      <ContentSkeleton
        label="Chargement du tableau des députés…"
        className="px-5 sm:px-14 pb-16"
      >
        <SkeletonBlock className="h-10 w-full rounded-t" />
        {Array.from({ length: ROW_COUNT }, (_, i) => (
          <SkeletonBlock key={i} className="h-11 w-full border-t border-[color:var(--dp-border)]" />
        ))}
      </ContentSkeleton>
    </div>
  )
}
