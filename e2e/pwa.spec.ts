import { readFileSync, writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// The installable app: the manifest, the service worker, offline reloads and the update toast.
// The other specs block service workers (playwright.config.ts); these turn them on.
test.use({ serviceWorkers: 'allow', locale: 'en-US' })

const SW = new URL('../dist/sw.js', import.meta.url)

/** Opens the app and waits until the service worker is active and has cached the app. */
async function openAndInstall(page: Page) {
  await page.goto('/')
  await expect(page.locator('.app')).toBeVisible()
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }))
    return reg.active?.state
  })
}

test('the manifest is linked and describes an installable app', async ({ page, request }) => {
  await page.goto('/')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBe('/manifest.webmanifest')
  const res = await request.get(href!)
  expect(res.ok()).toBe(true)
  const m = await res.json()
  expect(m).toMatchObject({ name: 'TickDone', short_name: 'TickDone', display: 'standalone', start_url: '/', scope: '/' })
  expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i)
  expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i)
  const sizes = (purpose: string) => m.icons.filter((i: { purpose: string }) => i.purpose === purpose).map((i: { sizes: string }) => i.sizes)
  expect(sizes('any')).toEqual(expect.arrayContaining(['192x192', '512x512']))
  expect(sizes('maskable')).toContain('512x512')
  for (const icon of m.icons) {
    const r = await request.get(icon.src)
    expect(r.ok(), icon.src).toBe(true)
    expect(r.headers()['content-type']).toContain(icon.type)
  }
})

test('after the first visit the app opens offline', async ({ page, context }) => {
  await openAndInstall(page)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.app')).toBeVisible()
  await expect(page.locator('.task-row, .row').first()).toBeVisible()
  // the feed proxy is never answered from the cache
  const api = await page.evaluate(() =>
    fetch('/api/ics?url=' + encodeURIComponent('https://example.com/a.ics')).then(
      () => 'answered',
      () => 'network error',
    ),
  )
  expect(api).toBe('network error')
  await context.setOffline(false)
})

test('a new version offers a reload that switches to it', async ({ page }) => {
  await openAndInstall(page)
  await expect(page.locator('.update-toast')).toHaveCount(0)
  // Deploy a "new version": change the service worker file the server sends
  const original = readFileSync(SW, 'utf8')
  try {
    writeFileSync(SW, original + '\n// next version\n')
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update())
    await expect(page.locator('.update-toast')).toBeVisible()
    await expect(page.locator('.update-toast')).toContainText('A new version of TickDone is available')
    await page.locator('.update-toast button', { hasText: 'Reload' }).click()
    await page.waitForEvent('load')
    await expect(page.locator('.app')).toBeVisible()
    await expect(page.locator('.update-toast')).toHaveCount(0)
  } finally {
    writeFileSync(SW, original)
  }
})
