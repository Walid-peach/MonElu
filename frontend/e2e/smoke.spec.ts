import { test, expect, type Page } from '@playwright/test'

// Static pages plus one dynamic page per detail route. Detail ids are
// resolved at runtime from the live listing page (frontend/src/lib/api.ts
// hits production for both build and this server), so the suite never
// hardcodes a deputy or vote id that could later 404.
const STATIC_ROUTES = ['/', '/deputes', '/votes', '/chat', '/quiz']

async function firstDetailHref(page: Page, listPath: string, hrefPrefix: string, exclude: string[] = []) {
  await page.goto(listPath)
  const links = page.locator(`a[href^="${hrefPrefix}"]`)
  await links.first().waitFor({ state: 'attached' })
  const hrefs = await links.evaluateAll(els => els.map(el => el.getAttribute('href')))
  const href = hrefs.find((h): h is string => !!h && !exclude.includes(h))
  if (!href) throw new Error(`no link matching ${hrefPrefix} (excluding ${exclude.join(', ')}) found on ${listPath}`)
  return href
}

async function assertNoHorizontalOverflow(page: Page) {
  const viewport = page.viewportSize()
  if (!viewport) throw new Error('no viewport configured for this project')
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(scrollWidth).toBeLessThanOrEqual(viewport.width)
}

test.describe('smoke: no horizontal overflow', () => {
  for (const route of STATIC_ROUTES) {
    test(`${route} fits the viewport`, async ({ page }) => {
      await page.goto(route)
      await assertNoHorizontalOverflow(page)
    })
  }

  test('/deputes/[id] fits the viewport', async ({ page }) => {
    // /deputes/comparer and /deputes/tableau are static routes that also
    // match the `/deputes/` prefix and render before the deputy row list.
    const href = await firstDetailHref(page, '/deputes', '/deputes/', [
      '/deputes/comparer',
      '/deputes/tableau',
    ])
    await page.goto(href)
    await assertNoHorizontalOverflow(page)
  })

  test('/votes/[id] fits the viewport', async ({ page }) => {
    const href = await firstDetailHref(page, '/votes', '/votes/')
    await page.goto(href)
    await assertNoHorizontalOverflow(page)
  })
})

test.describe('smoke: /votes row columns are not clipped', () => {
  // MON-142: the date column rendered but title/theme/result were clipped
  // by overflow:hidden on the row's parent — invisible to jsdom, which
  // doesn't lay out grid columns or honor overflow clipping.
  test('first row title and result badge are visible', async ({ page }) => {
    await page.goto('/votes')
    const firstRow = page.locator('a[href^="/votes/"]').first()
    await firstRow.waitFor({ state: 'attached' })
    await expect(firstRow.getByText(/^Scrutin n°/).first()).toBeVisible()
    await expect(firstRow.getByText(/^Adopté$|^Rejeté$/).first()).toBeVisible()
  })
})

test.describe('smoke: nav visibility follows the md breakpoint', () => {
  // MON-141: the desktop nav is `hidden md:flex` — jsdom can't tell an
  // inline display:flex apart from the Tailwind class losing the cascade,
  // so this needs an actual computed-style check in a real browser.
  test('exactly one of the desktop nav / mobile tab bar is visible', async ({ page }) => {
    await page.goto('/')
    const viewport = page.viewportSize()
    if (!viewport) throw new Error('no viewport configured for this project')

    const desktopNavToggle = page.getByRole('button', { name: 'Explorer' })
    const mobileMenuButton = page.getByRole('button', { name: 'Ouvrir le menu' })

    if (viewport.width < 768) {
      await expect(mobileMenuButton).toBeVisible()
      await expect(desktopNavToggle).toBeHidden()
    } else {
      await expect(desktopNavToggle).toBeVisible()
      await expect(mobileMenuButton).toBeHidden()
    }
  })
})

test.describe('smoke: every route declares a canonical URL', () => {
  // MON-269: `alternates.canonical` in a page's metadata is only a claim until
  // Next actually renders the <link>. A page that was a client component, or
  // one whose generateMetadata bailed out early, silently emits nothing.
  // Nothing here depends on viewport or color scheme, and every check costs a
  // real navigation against the live API - one project is enough.
  test.beforeEach(({}, testInfo) => {
    testInfo.skip(testInfo.project.name !== 'desktop-light', 'viewport-independent')
  })

  async function canonicalHref(page: Page) {
    const link = page.locator('link[rel="canonical"]')
    await expect(link).toHaveCount(1)
    return (await link.getAttribute('href')) ?? ''
  }

  for (const route of STATIC_ROUTES) {
    test(`${route} emits one canonical`, async ({ page }) => {
      await page.goto(route)
      const href = await canonicalHref(page)
      expect(href).toMatch(/^https?:\/\//)
      expect(new URL(href).pathname).toBe(route)
    })
  }

  test('/deputes/[id] emits a canonical for its own id', async ({ page }) => {
    const href = await firstDetailHref(page, '/deputes', '/deputes/', [
      '/deputes/comparer',
      '/deputes/tableau',
    ])
    await page.goto(href)
    expect(new URL(await canonicalHref(page)).pathname).toBe(href)
  })

  // Worth its own test rather than folding into the loop above:
  // generateStaticParams prerenders 100 vote pages at build time, and that
  // burst regularly trips the API's rate limit, so a prerendered vote page can
  // ship with none of its own metadata. The canonical is built from the URL
  // before that fetch precisely so it survives.
  test('/votes/[id] emits a canonical for its own id', async ({ page }) => {
    const href = await firstDetailHref(page, '/votes', '/votes/')
    await page.goto(href)
    expect(new URL(await canonicalHref(page)).pathname).toBe(href)
  })

  test('a query string does not fork the canonical', async ({ page }) => {
    await page.goto('/chat?q=test')
    expect(new URL(await canonicalHref(page)).pathname).toBe('/chat')
  })
})
