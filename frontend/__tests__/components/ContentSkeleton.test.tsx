import { render, screen } from '@testing-library/react'

import { ContentSkeleton, SkeletonBlock } from '@/components/ui/ContentSkeleton'

describe('ContentSkeleton', () => {
  it('exposes aria-busy and a status role on the wrapper', () => {
    render(
      <ContentSkeleton>
        <SkeletonBlock className="h-4 w-24" />
      </ContentSkeleton>
    )

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
  })

  it('announces a screen-reader label while hiding the decorative shapes', () => {
    render(
      <ContentSkeleton label="Chargement des députés…">
        <SkeletonBlock data-testid="shape" />
      </ContentSkeleton>
    )

    expect(screen.getByText('Chargement des députés…')).toHaveClass('sr-only')
    const shapeWrapper = screen.getByText('Chargement des députés…').nextSibling as HTMLElement
    expect(shapeWrapper).toHaveAttribute('aria-hidden', 'true')
  })

  it('marks each decorative block as aria-hidden individually', () => {
    const { container } = render(
      <ContentSkeleton>
        <SkeletonBlock className="h-4 w-24" />
        <SkeletonBlock className="h-4 w-16" />
      </ContentSkeleton>
    )

    const blocks = container.querySelectorAll('.dp-skeleton-block')
    expect(blocks).toHaveLength(2)
    blocks.forEach(block => expect(block).toHaveAttribute('aria-hidden', 'true'))
  })
})
