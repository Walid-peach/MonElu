import { act, render, screen, fireEvent } from '@testing-library/react'
import { HemicycleReplay } from '@/components/HemicycleReplay'
import type { HemicycleDeputy } from '@/lib/hemicycle'

const DEPUTIES: HemicycleDeputy[] = [
  ...Array.from({ length: 30 }, (_, i) => ({ deputy_id: `PA${i}`, full_name: `Pour ${i}`, party: 'EPR', position: 'pour' })),
  ...Array.from({ length: 20 }, (_, i) => ({ deputy_id: `PB${i}`, full_name: `Contre ${i}`, party: 'RN', position: 'contre' })),
  ...Array.from({ length: 4 }, (_, i) => ({ deputy_id: `PC${i}`, full_name: `Abst ${i}`, party: 'DR', position: 'abstention' })),
  { deputy_id: 'PD0', full_name: 'Non votant', party: null, position: 'nonVotant' },
]

function mockReducedMotion(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  })
}

describe('HemicycleReplay', () => {
  it('draws one seat per deputy', () => {
    mockReducedMotion(true)
    const { container } = render(<HemicycleReplay deputies={DEPUTIES} />)
    expect(container.querySelectorAll('[data-seat]')).toHaveLength(DEPUTIES.length)
  })

  it('shows the final result at once when the reader asks for reduced motion', () => {
    mockReducedMotion(true)
    const { container } = render(<HemicycleReplay deputies={DEPUTIES} />)
    expect(container.querySelectorAll('[data-seat][data-pos="pour"]')).toHaveLength(30)
    expect(container.querySelectorAll('[data-seat][data-pos="contre"]')).toHaveLength(20)
    expect(container.querySelectorAll('[data-seat][data-pos="abstention"]')).toHaveLength(4)
    expect(container.querySelectorAll('[data-seat][data-pos="nonVotant"]')).toHaveLength(1)
    expect(screen.getByText('30 pour · 20 contre · 4 abst. · 1 non-votants')).toBeInTheDocument()
  })

  it('starts with empty seats and a zero count when it animates', () => {
    mockReducedMotion(false)
    const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0)
    const { container } = render(<HemicycleReplay deputies={DEPUTIES} />)
    expect(container.querySelectorAll('[data-seat][data-pos]')).toHaveLength(0)
    expect(screen.getByText('0 pour · 0 contre · 0 abst. · 0 non-votants')).toBeInTheDocument()
    raf.mockRestore()
  })

  it('empties the seats and plays again when a finished vote is replayed', () => {
    mockReducedMotion(false)
    const queue: FrameRequestCallback[] = []
    let now = 0
    const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => queue.push(cb))
    const caf = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => { queue.length = 0 })
    const flush = () => { while (queue.length) { now += 1000; queue.shift()!(now) } }
    const { container } = render(<HemicycleReplay deputies={DEPUTIES} />)
    act(flush)
    expect(container.querySelectorAll('[data-seat][data-pos]')).toHaveLength(DEPUTIES.length)
    fireEvent.click(screen.getByRole('button', { name: 'Rejouer le vote' }))
    expect(container.querySelectorAll('[data-seat][data-pos]')).toHaveLength(0)
    act(flush)
    expect(container.querySelectorAll('[data-seat][data-pos]')).toHaveLength(DEPUTIES.length)
    raf.mockRestore()
    caf.mockRestore()
  })

  it('waits until the chamber is on screen before the first run', () => {
    mockReducedMotion(false)
    let notify: (entries: Array<{ isIntersecting: boolean }>) => void = () => {}
    const original = (window as { IntersectionObserver?: unknown }).IntersectionObserver
    ;(window as { IntersectionObserver?: unknown }).IntersectionObserver = class {
      constructor(cb: typeof notify) { notify = cb }
      observe() {}
      disconnect() {}
    }
    const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0)
    render(<HemicycleReplay deputies={DEPUTIES} />)
    expect(raf).not.toHaveBeenCalled()
    expect(screen.getByText('0 pour · 0 contre · 0 abst. · 0 non-votants')).toBeInTheDocument()
    act(() => notify([{ isIntersecting: true }]))
    expect(raf).toHaveBeenCalled()
    expect(screen.getByText('0 pour · 0 contre · 0 abst. · 0 non-votants')).toBeInTheDocument()
    raf.mockRestore()
    ;(window as { IntersectionObserver?: unknown }).IntersectionObserver = original
  })

  it('replays from the start when the button is pressed', () => {
    mockReducedMotion(true)
    const { container } = render(<HemicycleReplay deputies={DEPUTIES} />)
    fireEvent.click(screen.getByRole('button', { name: 'Rejouer le vote' }))
    expect(container.querySelectorAll('[data-seat][data-pos]')).toHaveLength(DEPUTIES.length)
  })

  it('colours a seat whose position is not one of the four recorded ones instead of leaving it unstyled', () => {
    mockReducedMotion(true)
    const { container } = render(
      <HemicycleReplay deputies={[...DEPUTIES, { deputy_id: 'PE0', full_name: 'Inconnu', party: 'RN', position: 'autre' }]} />,
    )
    expect(container.querySelector('[data-seat][data-pos="absent"]')).not.toBeNull()
    expect(container.querySelector('style')!.textContent).toContain('[data-pos="absent"]')
  })

  it('renders nothing without deputies', () => {
    mockReducedMotion(true)
    const { container } = render(<HemicycleReplay deputies={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
