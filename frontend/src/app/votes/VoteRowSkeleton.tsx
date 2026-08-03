import { SkeletonBlock } from '@/components/ui/ContentSkeleton'

/**
 * Mirrors a real vote row's grid (VotesClient.tsx): date, title+subtitle, theme
 * badge, result badge+meter, arrow. Shared by the route-level loading skeleton
 * (initial navigation) and VotesClient's own client-side refetch skeleton
 * (filter/pagination changes), so both stay in sync with the real layout.
 */
export function VoteRowSkeleton() {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-[100px_1fr_180px_260px_36px] gap-1.5 sm:gap-4 px-4 sm:px-[26px] py-4 sm:py-[18px]"
      style={{ borderBottom: '1px solid var(--dp-track-bg)' }}
    >
      <SkeletonBlock className="hidden sm:block h-3 w-14" />
      <div className="flex flex-col gap-2 min-w-0">
        <SkeletonBlock className="h-4 w-4/5" />
        <SkeletonBlock className="h-3 w-2/5" />
      </div>
      <SkeletonBlock className="hidden sm:block h-6 w-24 rounded-full" />
      <div className="flex flex-col gap-2">
        <SkeletonBlock className="h-5 w-36 rounded-full" />
        <SkeletonBlock className="h-[5px] w-full rounded-full" />
      </div>
      <SkeletonBlock className="hidden sm:block w-4 h-4" />
    </div>
  )
}
