import { expect, test } from '@playwright/test'

test('the launch screen shows the logo, then goes away without blocking input', async ({ page }) => {
  await page.goto('/')
  const launch = page.locator('#launch')
  await expect(launch.locator('svg.mark')).toBeAttached()
  expect(await launch.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none')
  await expect(launch).toHaveCount(0, { timeout: 5000 })
})

test('the launch screen follows the saved dark theme before the app script runs', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('tickdone:data:v1', JSON.stringify({ settings: { theme: 'dark' } })))
  // Without the app bundle only the inline script in index.html can set the theme.
  await page.route(/\/(assets|src)\/.*\.(js|tsx?)$/, (r) => r.abort())
  await page.reload()
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
  expect(await page.locator('#launch').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(28, 28, 28)')
})

test('the launch screen is skipped quickly with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('#launch')).toHaveCount(0, { timeout: 1000 })
})
