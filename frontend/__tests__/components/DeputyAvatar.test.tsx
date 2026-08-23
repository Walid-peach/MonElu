import { render, screen } from '@testing-library/react'
import { DeputyAvatar } from '@/components/DeputyAvatar'
import { AN_PORTRAIT_PREFIX } from '@/lib/portraits'

// next/image resolves the relative proxy path against jsdom's origin.
const PROXY = 'http://localhost/api/portraits/718942'
const AN_PHOTO = `${AN_PORTRAIT_PREFIX}718942.jpg`

describe('DeputyAvatar', () => {
  it('renders every size through the same same-origin proxy URL (MON-198)', () => {
    for (const size of ['sm', 'lg', 'xl', '2xl'] as const) {
      const { unmount } = render(<DeputyAvatar name="Jean Dupont" photoUrl={AN_PHOTO} size={size} />)
      expect(screen.getByAltText('Jean Dupont')).toHaveAttribute('src', PROXY)
      unmount()
    }
  })

  it('falls back to initials when the deputy has no photo', () => {
    render(<DeputyAvatar name="Jean Dupont" photoUrl={null} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('JD')).toBeInTheDocument()
  })

  it('hides the image from assistive tech when marked decorative', () => {
    render(<DeputyAvatar name="Jean Dupont" photoUrl={AN_PHOTO} decorative />)
    expect(screen.getByAltText('')).toHaveAttribute('src', PROXY)
  })
})
