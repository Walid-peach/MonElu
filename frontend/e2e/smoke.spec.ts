import { test, expect, type Page } from '@playwright/test'

// Static pages plus one dynamic page per detail route. Detail ids are
// resolved at runtime from the live listing page (frontend/src/lib/api.ts
// hits production for both build and this server), so the suite never
// hardcodes a deputy or vote id that could later 404.
const STATIC_ROUTES = ['/', '/deputes', '/votes', '/chat', '/quiz']

async function firstDetailHref(page: Page, listPath: string, hrefPrefix: string) {
  await page.goto(listPath)
  const link = page.locator(`a[href^="${hrefPrefix}"]`).first()
  await link.waitFor({ state: 'attached' })
  const href = await link.getAttribute('href')
  if (!href) throw new Error(`no link matching ${hrefPrefix} found on ${listPath}`)
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
    const href = await firstDetailHref(page, '/deputes', '/deputes/')
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
