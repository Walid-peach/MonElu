import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { EmbedButton } from '@/components/EmbedButton'
import { OEMBED_HEIGHT, OEMBED_WIDTH } from '@/lib/oembed'

afterEach(() => {
  jest.restoreAllMocks()
})

describe('EmbedButton', () => {
  it('shows an iframe snippet pointing at the given path when opened', () => {
    render(<EmbedButton path="/embed/votes/V1" />)
    expect(screen.queryByText(/<iframe/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /intégrer/i }))
    expect(screen.getByText(/<iframe/)).toHaveTextContent('/embed/votes/V1')
  })

  it('copies the snippet to the clipboard and shows confirmation', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    render(<EmbedButton path="/embed/votes/V1" />)
    fireEvent.click(screen.getByRole('button', { name: /intégrer/i }))
    fireEvent.click(screen.getByRole('button', { name: /copier le code/i }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/embed/votes/V1')))
    await waitFor(() => expect(screen.getByRole('button', { name: /copié/i })).toBeInTheDocument())
  })
})

// The snippet this button copies and the `html` the oEmbed endpoint returns
// have to describe the same box, so the defaults are one shared pair of
// constants rather than two literals that drift apart (MON-266).
describe('EmbedButton defaults', () => {
  it('sizes the snippet from the shared oEmbed constants', () => {
    render(<EmbedButton path="/embed/votes/V1" />)
    fireEvent.click(screen.getByRole('button', { name: /intégrer/i }))
    expect(screen.getByText(/<iframe/)).toHaveTextContent(
      `width="${OEMBED_WIDTH}" height="${OEMBED_HEIGHT}"`
    )
  })
})
