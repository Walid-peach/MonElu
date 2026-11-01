import { render } from '@testing-library/react'

import { CircoAnchorScroll } from '@/app/departements/[code]/CircoAnchorScroll'

// jsdom lays nothing out, so visibility is stubbed per element through
// getClientRects: an element with no rects is what `display: none` gives.
function visible(el: HTMLElement, shown: boolean) {
  el.getClientRects = () => (shown ? [{}] : []) as unknown as DOMRectList
  el.scrollIntoView = jest.fn()
  return el
}

function setup(desktopShown: boolean) {
  document.body.innerHTML = `
    <div id="circo-2"></div>
    <li data-circo-anchor="circo-2"></li>
    <li data-circo-anchor="circo-3"></li>`
  const desktop = visible(document.getElementById('circo-2') as HTMLElement, desktopShown)
  const [phone2, phone3] = [...document.querySelectorAll<HTMLElement>('[data-circo-anchor]')].map(el => visible(el, true))
  return { desktop, phone2, phone3 }
}

afterEach(() => {
  window.location.hash = ''
  document.body.innerHTML = ''
})

describe('CircoAnchorScroll', () => {
  it('scrolls to the phone card when the id target is hidden', () => {
    const { desktop, phone2 } = setup(false)
    window.location.hash = '#circo-2'
    render(<CircoAnchorScroll />)
    expect(phone2.scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
    expect(desktop.scrollIntoView).not.toHaveBeenCalled()
  })

  it('leaves the browser scroll alone when the id target is shown', () => {
    const { phone2 } = setup(true)
    window.location.hash = '#circo-2'
    render(<CircoAnchorScroll />)
    expect(phone2.scrollIntoView).not.toHaveBeenCalled()
  })

  it('follows a later hash change', () => {
    const { phone3 } = setup(false)
    render(<CircoAnchorScroll />)
    window.location.hash = '#circo-3'
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(phone3.scrollIntoView).toHaveBeenCalled()
  })

  it('ignores hashes that are not circonscription anchors', () => {
    const { phone2 } = setup(false)
    window.location.hash = '#bilan'
    render(<CircoAnchorScroll />)
    expect(phone2.scrollIntoView).not.toHaveBeenCalled()
  })
})
