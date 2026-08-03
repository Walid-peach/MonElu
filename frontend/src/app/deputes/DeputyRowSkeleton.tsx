import { SkeletonBlock } from '@/components/ui/ContentSkeleton'

/**
 * Mirrors a real deputy row's grid (DeputiesClient.tsx): avatar + name/department
 * on the left, group dot+label, arrow — so the skeleton doesn't reflow into the
 * real rows once data lands.
 */
export function DeputyRowSkeleton() {
  return (
    <div
      data-testid="deputy-row-skeleton"
      className="grid grid-cols-[1fr_20px] sm:grid-cols-[1fr_260px_34px] gap-3 sm:gap-[18px] px-4 sm:px-[26px] py-[13px]"
      style={{ borderBottom: '1px solid var(--dp-track-bg)' }}
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <SkeletonBlock className="w-10 h-10 rounded-full shrink-0" />
        <div className="flex flex-col gap-2 min-w-0">
          <SkeletonBlock className="h-4 w-36" />
          <SkeletonBlock className="h-3 w-24" />
        </div>
      </div>
      <div className="hidden sm:flex items-center gap-2.5">
        <SkeletonBlock className="w-[9px] h-[9px] rounded-full shrink-0" />
        <SkeletonBlock className="h-3.5 w-28" />
      </div>
      <SkeletonBlock className="hidden sm:block w-[17px] h-[17px]" />
    </div>
  )
}
