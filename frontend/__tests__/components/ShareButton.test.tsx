import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { ShareButton } from '@/components/ShareButton'

const props = { url: '/votes/V1', title: 'Adopté - Un scrutin', text: 'Suivez ce scrutin sur MonÉlu' }

afterEach(() => {
  jest.restoreAllMocks()
  // @ts-expect-error test-only cleanup of a property we add per test
  delete navigator.share
})

describe('ShareButton', () => {
  it('uses native share when available and does not open the menu', async () => {
    const share = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })

    render(<ShareButton {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /partager/i }))

    await waitFor(() => expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ title: props.title, text: props.text })
    ))
    expect(screen.queryByRole('menuitem', { name: /copier le lien/i })).not.toBeInTheDocument()
  })

  it('falls back to a menu with copy-link and social links when native share is unavailable', () => {
    render(<ShareButton {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /partager/i }))

    expect(screen.getByRole('menuitem', { name: /copier le lien/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /partager sur x/i })).toHaveAttribute(
      'href', expect.stringContaining('twitter.com/intent/tweet')
    )
    expect(screen.getByRole('menuitem', { name: /partager sur bluesky/i })).toHaveAttribute(
      'href', expect.stringContaining('bsky.app/intent/compose')
    )
    expect(screen.getByRole('menuitem', { name: /partager sur facebook/i })).toHaveAttribute(
      'href', expect.stringContaining('facebook.com/sharer')
    )
  })

  it('copies the link to the clipboard and shows confirmation', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    render(<ShareButton {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /partager/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /copier le lien/i }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining(props.url)))
    await waitFor(() => expect(screen.getByText(/copié/i)).toBeInTheDocument())
  })
})
