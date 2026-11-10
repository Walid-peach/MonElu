import { render } from '@testing-library/react'

import { ScrollToToday } from '@/app/agenda/ScrollToToday'

const days = [{ sitting_date: '2026-10-27' }, { sitting_date: '2026-10-29' }]

function mountDays() {
  document.body.innerHTML = days
    .map(d => `<section data-agenda-day="${d.sitting_date}" id="d${d.sitting_date}"></section>`)
    .join('')
}

describe('ScrollToToday', () => {
  let scrollIntoView: jest.Mock

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-28T10:00:00Z'))
    scrollIntoView = jest.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView
    jest.spyOn(window.HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    mountDays()
    window.location.hash = ''
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('scrolls to the next sitting day when today has none', () => {
    render(<ScrollToToday days={days} />)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' })
    expect(scrollIntoView.mock.contexts[0]).toHaveAttribute('data-agenda-day', '2026-10-29')
  })

  it('does nothing when the URL names a section', () => {
    window.location.hash = '#autre'
    render(<ScrollToToday days={days} />)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('does nothing when the browser already restored a scroll position', () => {
    Object.defineProperty(window, 'scrollY', { value: 400, configurable: true })
    render(<ScrollToToday days={days} />)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('does nothing when no sitting day is left', () => {
    jest.setSystemTime(new Date('2026-10-31T10:00:00Z'))
    render(<ScrollToToday days={days} />)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
