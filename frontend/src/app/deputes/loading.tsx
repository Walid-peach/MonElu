import { ContentSkeleton, SkeletonBlock } from '@/components/ui/ContentSkeleton'
import { DeputyRowSkeleton } from './DeputyRowSkeleton'

// /deputes has no client-side loading state of its own (the list is filtered
// client-side over data already fetched server-side) — the only moment a user
// ever sees a loading treatment here is this route-level Suspense fallback
// while the server awaits fetchAllDeputies(). Approximates the hero's height
// too, not just the list, so landing here doesn't cause a large layout jump
// once the real page replaces it.
const ROW_COUNT = 10

export default function DeputiesLoading() {
  return (
    <div style={{ background: 'var(--dp-page-bg)', minHeight: '100vh' }}>
      <div
        className="px-5 sm:px-14 pt-8 sm:pt-[50px] pb-8 sm:pb-10"
        style={{
          background: 'linear-gradient(180deg,var(--dp-card-bg) 0%,var(--dp-page-bg) 100%)',
          borderBottom: '1px solid var(--dp-border-subtle)',
        }}
      >
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <SkeletonBlock className="h-3 w-40 mb-4" />
          <SkeletonBlock className="h-10 w-full max-w-[600px] mb-3" />
          <SkeletonBlock className="h-4 w-full max-w-[480px] mb-7" />
          <SkeletonBlock className="h-[54px] w-full max-w-[720px] rounded-[10px]" />
        </div>
      </div>

      <div className="px-5 sm:px-14 pt-8 pb-14 sm:pb-[72px]">
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <ContentSkeleton label="Chargement des députés…">
            <div
              style={{
                background: 'var(--dp-card-bg)',
                border: '1px solid var(--dp-border)',
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              {Array.from({ length: ROW_COUNT }).map((_, i) => (
                <DeputyRowSkeleton key={i} />
              ))}
            </div>
          </ContentSkeleton>
        </div>
      </div>
    </div>
  )
}
