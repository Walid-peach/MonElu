import { render, screen } from '@testing-library/react'
import { MonEluLogo } from '@/components/MonEluLogo'

describe('MonEluLogo', () => {
  it('names a home link once when the wordmark is visible', () => {
    render(<a href="/"><MonEluLogo /></a>)
    expect(screen.getByRole('link')).toHaveAccessibleName(/^Mon\s?Élu$/)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('keeps an icon-only home link named', () => {
    render(<a href="/"><MonEluLogo hideWordmark /></a>)
    expect(screen.getByRole('link')).toHaveAccessibleName(/^Mon\s?Élu$/)
    expect(screen.getByRole('img', { name: 'MonÉlu' })).toBeInTheDocument()
  })
})
