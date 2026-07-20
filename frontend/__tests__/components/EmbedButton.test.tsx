import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { EmbedButton } from '@/components/EmbedButton'

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
