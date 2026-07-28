import { render } from '@testing-library/react'

import { MonEluLogo } from '@/components/MonEluLogo'

// Raw trig floats (e.g. 23.966679003209208) serialize differently on the server
// and on the client, which caused a hydration mismatch on every page load
// (MON-199). Every rendered coordinate must be short enough to round-trip
// identically through both serializers.
const MAX_DECIMALS = 3

function decimals(value: string): number {
  const dot = value.indexOf('.')
  return dot === -1 ? 0 : value.length - dot - 1
}

describe('MonEluLogo', () => {
  it('renders all ring segments', () => {
    const { container } = render(<MonEluLogo />)
    // 3 rings × 7 segments, plus the deputy body rect
    expect(container.querySelectorAll('rect')).toHaveLength(3 * 7 + 1)
    expect(container.querySelector('circle')).toBeInTheDocument()
  })

  it('rounds every numeric SVG attribute to a hydration-safe precision', () => {
    const { container } = render(<MonEluLogo />)
    const numeric = /-?\d+(\.\d+)?/g

    for (const el of Array.from(container.querySelectorAll('rect, circle'))) {
      for (const attr of Array.from(el.attributes)) {
        for (const match of attr.value.match(numeric) ?? []) {
          // Message carries the offending attribute so a failure is self-explanatory
          expect(`${attr.name}="${attr.value}" → ${decimals(match)} decimals`).toBe(
            `${attr.name}="${attr.value}" → ${Math.min(decimals(match), MAX_DECIMALS)} decimals`,
          )
        }
      }
    }
  })

  it('renders the wordmark unless hidden', () => {
    const { container, rerender } = render(<MonEluLogo />)
    expect(container.textContent).toContain('MonÉlu')
    rerender(<MonEluLogo hideWordmark />)
    expect(container.textContent).toBe('')
  })
})
